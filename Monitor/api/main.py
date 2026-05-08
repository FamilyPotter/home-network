from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text

from config import settings
from constants import KEY_POLL_INTERVAL, coerce_scan_interval
from database import AsyncSessionLocal, engine
from models import Alert, Base, Device, MonitorSetting, ScanEvent
from routers import adguard, alerts, devices, scans, switch
from routers.scan_interval import router as scan_interval_router
from scheduler import build_scheduler
from scheduler_state import get_scheduler, set_scheduler
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
app.include_router(scan_interval_router)
app.include_router(switch.router)


async def load_scan_interval_sec() -> int:
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(MonitorSetting).where(MonitorSetting.key == KEY_POLL_INTERVAL))
        row = r.scalar_one_or_none()
        if row:
            try:
                return coerce_scan_interval(int(row.value))
            except ValueError:
                pass
    return coerce_scan_interval(settings.poll_interval_sec)


async def _run_migrations(conn) -> None:
    """Apply any schema changes that create_all cannot handle (new columns on existing tables)."""
    await conn.execute(text(
        "ALTER TABLE adguard_queries ADD COLUMN IF NOT EXISTS queried_at TIMESTAMPTZ"
    ))
    await conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_adguard_queries_queried_at "
        "ON adguard_queries (queried_at) WHERE queried_at IS NOT NULL"
    ))
    # TrackerDB enrichment columns (added in v1.1)
    for col in ("tracker_name TEXT", "tracker_category TEXT", "tracker_org TEXT"):
        col_name = col.split()[0]
        await conn.execute(text(
            f"ALTER TABLE adguard_queries ADD COLUMN IF NOT EXISTS {col}"
        ))
        logger.info("Migration: ensured column adguard_queries.%s", col_name)


async def _seed_devices_if_empty(conn) -> None:
    """Seed the device inventory from seed_inventory.sql (or example) if the devices table is empty."""
    count = (await conn.execute(text("SELECT COUNT(*) FROM devices"))).scalar()
    if count and count > 0:
        return
    seed_file: Path | None = None
    for name in ("seed_inventory.sql", "seed_inventory.example.sql"):
        candidate = Path("/app/db") / name
        if candidate.exists():
            seed_file = candidate
            break
    if seed_file is None:
        logger.warning(
            "No seed_inventory.sql or seed_inventory.example.sql under /app/db — devices table will be empty"
        )
        return
    sql = seed_file.read_text()
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt and not stmt.startswith("--"):
            await conn.execute(text(stmt))
    logger.info("Device inventory seeded from %s", seed_file)


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _run_migrations(conn)
        await _seed_devices_if_empty(conn)
    logger.info("DB tables verified and seeded.")

    import tracker_lookup
    tracker_lookup.preload()

    scan_sec = await load_scan_interval_sec()
    sched = build_scheduler(
        scan_interval_sec=scan_sec,
        adguard_query_poll_sec=settings.adguard_query_poll_sec,
    )
    set_scheduler(sched)
    sched.start()
    logger.info(
        "Scheduler started — scan/traffic every %ds; AdGuard query log DB sync every %ds",
        scan_sec,
        settings.adguard_query_poll_sec,
    )


@app.on_event("shutdown")
async def shutdown():
    try:
        get_scheduler().shutdown(wait=False)
    except RuntimeError:
        pass


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
