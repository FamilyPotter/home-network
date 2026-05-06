from __future__ import annotations

from datetime import datetime, timezone
import logging

import httpx

from config import settings
from database import AsyncSessionLocal
from models import TrafficSample

logger = logging.getLogger("adguard-client")


class AdguardClient:
    def __init__(self) -> None:
        self.base_url = settings.adguard_url.rstrip("/")
        self.auth = (settings.adguard_user, settings.adguard_password)

    async def get_stats(self) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{self.base_url}/control/stats", auth=self.auth)
            response.raise_for_status()
            return response.json()

    async def get_querylog(self, limit: int = 100) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{self.base_url}/control/querylog",
                params={"limit": limit, "response_status": "all"},
                auth=self.auth,
            )
            response.raise_for_status()
            return response.json()


async def poll_adguard_traffic() -> None:
    """Persist periodic DNS traffic totals for charting."""
    client = AdguardClient()
    try:
        stats = await client.get_stats()
    except Exception as exc:  # pragma: no cover - network-driven
        logger.warning("AdGuard stats poll failed: %s", exc)
        return

    sample = TrafficSample(
        sampled_at=datetime.now(timezone.utc),
        bytes_in=0,
        bytes_out=0,
        dns_query_count=stats.get("num_dns_queries", 0),
        dns_block_count=stats.get("num_blocked_filtering", 0),
    )
    async with AsyncSessionLocal() as db:
        db.add(sample)
        await db.commit()
