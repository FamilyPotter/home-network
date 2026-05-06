"""
ARP-based network scanner using scapy.
Runs as a background task via APScheduler.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

import httpx
from scapy.layers.l2 import ARP, Ether
from scapy.sendrecv import srp
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import AsyncSessionLocal
from models import Alert, Device, DeviceEvent, DeviceHistory, PresenceSnapshot, ScanEvent

logger = logging.getLogger("scanner")


def _ip_str(ip) -> str | None:
    """Coerce asyncpg IPv4Address/IPv6Address to plain string."""
    return str(ip) if ip is not None else None


def _arp_scan(cidr: str, timeout: int = 3) -> list[dict]:
    """Run a synchronous ARP scan and return [{ip, mac}, ...]."""
    pkt = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=cidr)
    # Never use iface_hint=cidr segment (invalid). Prefer host network namespace (see docker-compose) on NAS.
    kwargs: dict = {"timeout": timeout, "verbose": False}
    iface = getattr(settings, "scan_iface", None)
    if iface:
        kwargs["iface"] = iface
    ans, _ = srp(pkt, **kwargs)
    return [{"ip": rcv.psrc, "mac": rcv.hwsrc.lower()} for _, rcv in ans]


async def run_scan() -> None:
    """Full scan cycle: ARP → update devices → persist history → raise alerts."""
    start = time.monotonic()
    logger.info("Scan starting for %s", settings.network_cidr)

    loop = asyncio.get_event_loop()
    try:
        found: list[dict] = await loop.run_in_executor(
            None, _arp_scan, settings.network_cidr
        )
    except Exception as exc:
        logger.error("ARP scan failed: %s", exc)
        return

    elapsed_ms = int((time.monotonic() - start) * 1000)
    found_macs = {r["mac"] for r in found}
    found_by_mac = {r["mac"]: r["ip"] for r in found}

    async with AsyncSessionLocal() as db:
        scan = ScanEvent(
            scanned_at=datetime.now(timezone.utc),
            duration_ms=elapsed_ms,
            total_hosts=len(found),
        )
        db.add(scan)
        await db.flush()

        all_devices: list[Device] = (await db.execute(select(Device))).scalars().all()
        known_macs = {d.mac: d for d in all_devices}

        new_count = 0
        lost_count = 0

        # Mark devices online/offline and track changes
        for d in all_devices:
            was_online = d.online
            is_online = d.mac in found_macs

            if was_online != is_online:
                d.online = is_online
                d.last_seen = datetime.now(timezone.utc) if is_online else d.last_seen
                db.add(DeviceHistory(device_id=d.id, scan_id=scan.id, ip=_ip_str(d.ip), online=is_online))
                db.add(
                    DeviceEvent(
                        device_id=d.id,
                        event_type="join" if is_online else "leave",
                        old_value="offline" if is_online else "online",
                        new_value="online" if is_online else "offline",
                    )
                )

                if not is_online:
                    lost_count += 1
                    db.add(Alert(
                        device_id=d.id,
                        alert_type="offline",
                        severity="warning",
                        message=f"{d.hostname or d.mac} went offline",
                    ))

            if is_online and found_by_mac[d.mac] != _ip_str(d.ip):
                previous_ip = _ip_str(d.ip)
                db.add(Alert(
                    device_id=d.id,
                    alert_type="ip_change",
                    severity="info",
                    message=f"{d.hostname or d.mac} IP changed {previous_ip} → {found_by_mac[d.mac]}",
                ))
                d.ip = found_by_mac[d.mac]
                db.add(
                    DeviceEvent(
                        device_id=d.id,
                        event_type="ip_change",
                        old_value=previous_ip,
                        new_value=found_by_mac[d.mac],
                    )
                )

            if is_online:
                d.last_seen = datetime.now(timezone.utc)
            db.add(
                PresenceSnapshot(
                    device_id=d.id,
                    ip=found_by_mac.get(d.mac, _ip_str(d.ip)),
                    mac=d.mac,
                    alive=is_online,
                )
            )

        # Register new devices
        for mac, ip in found_by_mac.items():
            if mac not in known_macs:
                new_d = Device(
                    mac=mac,
                    ip=ip,
                    online=True,
                    known=False,
                    first_seen=datetime.now(timezone.utc),
                    last_seen=datetime.now(timezone.utc),
                )
                db.add(new_d)
                await db.flush()
                db.add(DeviceHistory(device_id=new_d.id, scan_id=scan.id, ip=ip, online=True))
                db.add(Alert(
                    device_id=new_d.id,
                    alert_type="new_device",
                    severity="info",
                    message=f"New device discovered: {mac} ({ip})",
                ))
                new_count += 1
                db.add(
                    DeviceEvent(
                        device_id=new_d.id,
                        event_type="new_device",
                        old_value=None,
                        new_value=f"{mac}@{ip}",
                    )
                )
                db.add(
                    PresenceSnapshot(
                        device_id=new_d.id,
                        ip=ip,
                        mac=mac,
                        alive=True,
                    )
                )

        scan.new_devices = new_count
        scan.lost_devices = lost_count

        await db.commit()

    logger.info(
        "Scan done in %dms — %d hosts, %d new, %d lost",
        elapsed_ms, len(found), new_count, lost_count,
    )


# ─── AdGuard query log poller ──────────────────────────────────────────────────

def _querylog_answer_text(entry: dict) -> str | None:
    ans = entry.get("answer")
    if ans is None:
        return None
    if isinstance(ans, str):
        return ans
    try:
        return json.dumps(ans)
    except (TypeError, ValueError):
        return str(ans)


def _querylog_elapsed_ms(entry: dict) -> int | None:
    # AdGuard ≥0.107 uses "elapsedMs" (numeric ms); older/newer may use "elapsed" ("0.123ms")
    for key in ("elapsedMs", "elapsed"):
        raw = entry.get(key)
        if raw is None:
            continue
        try:
            return int(float(str(raw).rstrip("ms").strip()))
        except (TypeError, ValueError):
            pass
    return None


def _querylog_queried_at(entry: dict) -> datetime | None:
    raw = entry.get("time")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _safe_inet(value: str | None) -> str | None:
    """Return value only if it looks like a valid IPv4/IPv6 address; else None."""
    if not value:
        return None
    import ipaddress
    try:
        ipaddress.ip_address(value)
        return value
    except ValueError:
        return None


async def poll_adguard_queries() -> None:
    """Fetch recent AdGuard query log and persist new rows to adguard_queries."""
    url = f"{settings.adguard_url}/control/querylog"
    params = {"limit": 200, "response_status": "all"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                url, params=params,
                auth=(settings.adguard_user, settings.adguard_password),
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("AdGuard query log fetch failed: %s", exc)
        return

    # AdGuard returns {"data": [...], "oldest": "..."} since v0.107
    raw_entries = data.get("data") if isinstance(data, dict) else data
    if not isinstance(raw_entries, list):
        logger.warning("AdGuard query log: unexpected response shape: %s", type(data))
        return

    from models import AdguardQuery
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    import tracker_lookup

    rows: list[dict] = []
    now = datetime.now(timezone.utc)
    for entry in raw_entries:
        if not isinstance(entry, dict):
            continue
        q = entry.get("question")
        qname = None
        if isinstance(q, dict):
            qname = q.get("name")
        elif isinstance(q, str):
            qname = q

        tracker = tracker_lookup.lookup_domain(qname)
        rows.append({
            "fetched_at": now,
            "queried_at": _querylog_queried_at(entry),
            "client_ip": _safe_inet(entry.get("client")),
            "question": qname,
            "answer": _querylog_answer_text(entry),
            "status": entry.get("reason") or entry.get("status"),
            "elapsed_ms": _querylog_elapsed_ms(entry),
            "tracker_name": tracker.name if tracker else None,
            "tracker_category": tracker.category if tracker else None,
            "tracker_org": tracker.org if tracker else None,
        })

    if not rows:
        logger.debug("AdGuard query log: no entries returned")
        return

    try:
        async with AsyncSessionLocal() as db:
            stmt = (
                pg_insert(AdguardQuery.__table__)
                .values(rows)
                .on_conflict_do_nothing(index_elements=["queried_at"])
            )
            result = await db.execute(stmt)
            await db.commit()
            inserted = result.rowcount if result.rowcount >= 0 else len(rows)
            logger.info(
                "AdGuard query log: %d fetched, %d new rows inserted into adguard_queries",
                len(rows), inserted,
            )
    except Exception as exc:
        logger.warning("AdGuard query log DB insert failed: %s", exc)
