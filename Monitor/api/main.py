from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text

from config import settings
from database import AsyncSessionLocal, engine
from models import Alert, Base, Device, ScanEvent
from routers import adguard, alerts, devices, scans
from scanner import poll_adguard_queries, run_scan
from schemas import StatsOut

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("main")

app = FastAPI(
    title="Network Monitor API",
    version="1.0.0",
    description="Calgary House — local network device monitoring",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(scans.router)
app.include_router(alerts.router)
app.include_router(adguard.router)

scheduler = AsyncIOScheduler(timezone="Europe/London")


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("DB tables verified.")

    scheduler.add_job(run_scan, "interval", seconds=settings.poll_interval_sec, id="arp_scan")
    scheduler.add_job(poll_adguard_queries, "interval", seconds=300, id="adguard_poll")
    scheduler.start()
    logger.info(
        "Scheduler started — ARP scan every %ds, AdGuard poll every 300s",
        settings.poll_interval_sec,
    )


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/stats", response_model=StatsOut)
async def stats():
    async with AsyncSessionLocal() as db:
        total = (await db.execute(select(func.count()).select_from(Device))).scalar_one()
        online = (await db.execute(select(func.count()).select_from(Device).where(Device.online == True))).scalar_one()
        unknown = (await db.execute(select(func.count()).select_from(Device).where(Device.known == False))).scalar_one()
        last_scan = (await db.execute(select(func.max(ScanEvent.scanned_at)))).scalar_one()
        alerts_unack = (await db.execute(
            select(func.count()).select_from(Alert).where(Alert.acknowledged == False)
        )).scalar_one()

    return StatsOut(
        total_devices=total,
        online_devices=online,
        unknown_devices=unknown,
        last_scan=last_scan,
        alerts_unack=alerts_unack,
    )
