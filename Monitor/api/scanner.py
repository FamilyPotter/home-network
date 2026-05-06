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
                db.add(DeviceHistory(device_id=d.id, scan_id=scan.id, ip=d.ip, online=is_online))
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

            if is_online and found_by_mac[d.mac] != d.ip:
                previous_ip = d.ip
                db.add(Alert(
                    device_id=d.id,
                    alert_type="ip_change",
                    severity="info",
                    message=f"{d.hostname or d.mac} IP changed {d.ip} → {found_by_mac[d.mac]}",
                ))
                d.ip = found_by_mac[d.mac]
                db.add(
                    DeviceEvent(
                        device_id=d.id,
                        event_type="ip_change",
                        old_value=str(previous_ip) if previous_ip else None,
                        new_value=found_by_mac[d.mac],
                    )
                )

            if is_online:
                d.last_seen = datetime.now(timezone.utc)
            db.add(
                PresenceSnapshot(
                    device_id=d.id,
                    ip=found_by_mac.get(d.mac, d.ip),
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
    raw = entry.get("elapsedMs")
    if raw is None:
        return None
    try:
        return int(float(str(raw)))
    except (TypeError, ValueError):
        return None


async def poll_adguard_queries() -> None:
    """Fetch recent AdGuard query log and persist to adguard_queries table."""
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

    from models import AdguardQuery

    rows = []
    for entry in data.get("data", []) or []:
        if not isinstance(entry, dict):
            continue
        q = entry.get("question")
        qname = None
        if isinstance(q, dict):
            qname = q.get("name")
        elif isinstance(q, str):
            qname = q

        rows.append(AdguardQuery(
            fetched_at=datetime.now(timezone.utc),
            client_ip=entry.get("client"),
            question=qname,
            answer=_querylog_answer_text(entry),
            status=entry.get("reason") or entry.get("status"),
            elapsed_ms=_querylog_elapsed_ms(entry),
        ))

    if rows:
        async with AsyncSessionLocal() as db:
            db.add_all(rows)
            await db.commit()
        logger.info("AdGuard query log: persisted %d rows into adguard_queries", len(rows))
    else:
        logger.debug("AdGuard query log: no rows returned")
