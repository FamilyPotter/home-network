"""Proxy endpoints: pull data from AdGuard Home REST API and return to frontend."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from adguard_normalize import client_query_totals_from_stats, normalize_adguard_stats
from config import settings
from database import get_db
from models import AdguardQuery
from schemas import AdguardQueryOut

router = APIRouter(prefix="/adguard", tags=["adguard"])


async def _ag_get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(
            f"{settings.adguard_url}{path}",
            params=params,
            auth=(settings.adguard_user, settings.adguard_password),
        )
        resp.raise_for_status()
        return resp.json()


@router.get("/stats")
async def adguard_stats():
    """Return AdGuard Home global stats; normalizes top_clients/top_blocked to {name,count} rows."""
    try:
        raw = await _ag_get("/control/stats")
        return normalize_adguard_stats(raw)
    except Exception as exc:
        raise HTTPException(502, f"AdGuard unreachable: {exc}")


@router.get("/client_dns_totals")
async def client_dns_totals():
    """Per-client DNS query totals (from AdGuard stats top_clients), keyed by client IP or label."""
    try:
        raw = await _ag_get("/control/stats")
        norm = normalize_adguard_stats(raw)
        return {"totals": client_query_totals_from_stats(norm)}
    except Exception as exc:
        raise HTTPException(502, f"AdGuard unreachable: {exc}")


@router.get("/clients")
async def adguard_clients():
    """Return all AdGuard client stats."""
    try:
        return await _ag_get("/control/stats", {"period": "day"})
    except Exception as exc:
        raise HTTPException(502, f"AdGuard unreachable: {exc}")


@router.get("/querylog", response_model=list[AdguardQueryOut])
async def querylog_cached(
    limit: int = Query(200, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Return cached AdGuard query log from PostgreSQL."""
    q = select(AdguardQuery).order_by(AdguardQuery.fetched_at.desc()).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/querylog/live")
async def querylog_live(
    clientid: str | None = Query(default=None),
    limit: int = Query(default=50, le=500),
):
    """Live AdGuard query log, optionally filtered by client IP, enriched with WhoTracks.me data."""
    import tracker_lookup  # loaded at startup via preload()
    params: dict[str, str | int] = {"limit": limit}
    if clientid:
        # AdGuard v0.107 uses 'search' (matches domain OR client IP); 'client' is silently ignored
        params["search"] = clientid
    try:
        raw = await _ag_get("/control/querylog", params)
        for entry in raw.get("data") or []:
            q = entry.get("question") or {}
            qname = q.get("name") or entry.get("qhost")
            if qname:
                info = tracker_lookup.lookup_domain(qname)
                if info:
                    entry["tracker_name"]     = info.name
                    entry["tracker_category"] = info.category
                    entry["tracker_org"]      = info.org
        return raw
    except Exception as exc:
        raise HTTPException(502, f"AdGuard unreachable: {exc}")


@router.get("/dhcp")
async def adguard_dhcp():
    """Return current DHCP leases from AdGuard."""
    try:
        return await _ag_get("/control/dhcp/status")
    except Exception as exc:
        raise HTTPException(502, f"AdGuard unreachable: {exc}")
