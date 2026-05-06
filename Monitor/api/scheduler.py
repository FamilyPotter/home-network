from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from adguard import poll_adguard_traffic
from config import settings
from scanner import run_scan


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Europe/London")
    scheduler.add_job(run_scan, "interval", seconds=settings.poll_interval_sec, id="presence-scan")
    scheduler.add_job(poll_adguard_traffic, "interval", seconds=settings.poll_interval_sec, id="traffic-sample")
    return scheduler
