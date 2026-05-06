from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import ScanEvent
from scanner import run_scan
from schemas import ScanEventOut

router = APIRouter(prefix="/scans", tags=["scans"])


@router.get("/", response_model=list[ScanEventOut])
async def list_scans(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    q = select(ScanEvent).order_by(ScanEvent.scanned_at.desc()).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/trigger", status_code=202)
async def trigger_scan():
    """Manually trigger an immediate ARP scan."""
    import asyncio
    asyncio.create_task(run_scan())
    return {"detail": "Scan triggered"}
