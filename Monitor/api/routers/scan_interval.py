from __future__ import annotations

from datetime import datetime, timezone

from apscheduler.triggers.interval import IntervalTrigger
from fastapi import APIRouter
from pydantic import BaseModel, field_validator
from sqlalchemy import select

from config import settings
from constants import ALLOWED_SCAN_INTERVAL_SEC, KEY_POLL_INTERVAL, coerce_scan_interval
from database import AsyncSessionLocal
from models import MonitorSetting
from scheduler_state import get_scheduler

router = APIRouter(prefix="/settings", tags=["settings"])


class ScanIntervalOut(BaseModel):
    seconds: int
    allowed_seconds: list[int]


class ScanIntervalUpdate(BaseModel):
    seconds: int

    @field_validator("seconds")
    @classmethod
    def _allowed(cls, v: int) -> int:
        if v not in ALLOWED_SCAN_INTERVAL_SEC:
            raise ValueError(f"seconds must be one of {sorted(ALLOWED_SCAN_INTERVAL_SEC)}")
        return v


@router.get("/scan-interval", response_model=ScanIntervalOut)
async def get_scan_interval():
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(MonitorSetting).where(MonitorSetting.key == KEY_POLL_INTERVAL))
        row = r.scalar_one_or_none()
        if row:
            try:
                sec = coerce_scan_interval(int(row.value))
            except ValueError:
                sec = coerce_scan_interval(settings.poll_interval_sec)
        else:
            sec = coerce_scan_interval(settings.poll_interval_sec)
    return ScanIntervalOut(
        seconds=sec,
        allowed_seconds=sorted(ALLOWED_SCAN_INTERVAL_SEC),
    )


@router.put("/scan-interval", response_model=ScanIntervalOut)
async def put_scan_interval(body: ScanIntervalUpdate):
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(MonitorSetting).where(MonitorSetting.key == KEY_POLL_INTERVAL))
        row = r.scalar_one_or_none()
        if row:
            row.value = str(body.seconds)
            row.updated_at = now
        else:
            db.add(
                MonitorSetting(
                    key=KEY_POLL_INTERVAL,
                    value=str(body.seconds),
                    updated_at=now,
                )
            )
        await db.commit()

    trigger = IntervalTrigger(seconds=body.seconds)
    sched = get_scheduler()
    sched.reschedule_job("presence-scan", trigger=trigger)
    sched.reschedule_job("traffic-sample", trigger=trigger)
    sched.reschedule_job("adguard-querylog", trigger=trigger)

    return ScanIntervalOut(
        seconds=body.seconds,
        allowed_seconds=sorted(ALLOWED_SCAN_INTERVAL_SEC),
    )
