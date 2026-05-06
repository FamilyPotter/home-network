"""Proxy endpoints: pull data from AdGuard Home REST API and return to frontend."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    """Return AdGuard Home global stats (dns_queries, blocked_filtering, etc.)."""
    try:
        return await _ag_get("/control/stats")
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


@router.get("/dhcp")
async def adguard_dhcp():
    """Return current DHCP leases from AdGuard."""
    try:
        return await _ag_get("/control/dhcp/status")
    except Exception as exc:
        raise HTTPException(502, f"AdGuard unreachable: {exc}")
