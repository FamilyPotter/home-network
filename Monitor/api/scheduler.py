from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from adguard import poll_adguard_traffic
from config import settings
from scanner import poll_adguard_queries, run_scan


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Europe/London")
    scheduler.add_job(run_scan, "interval", seconds=settings.poll_interval_sec, id="presence-scan")
    scheduler.add_job(poll_adguard_traffic, "interval", seconds=settings.poll_interval_sec, id="traffic-sample")
    scheduler.add_job(
        poll_adguard_queries,
        "interval",
        seconds=settings.adguard_query_poll_sec,
        id="adguard-querylog",
    )
    return scheduler
