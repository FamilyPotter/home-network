import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Alert
from schemas import AlertOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/", response_model=list[AlertOut])
async def list_alerts(
    acknowledged: bool | None = None,
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if acknowledged is not None:
        q = q.where(Alert.acknowledged == acknowledged)
    result = await db.execute(q)
    return result.scalars().all()


@router.patch("/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    a = await db.get(Alert, alert_id)
    if not a:
        from fastapi import HTTPException
        raise HTTPException(404, "Alert not found")
    a.acknowledged = True
    await db.commit()
    await db.refresh(a)
    return a


@router.post("/acknowledge-all", status_code=204)
async def acknowledge_all_alerts(db: AsyncSession = Depends(get_db)):
    await db.execute(update(Alert).where(Alert.acknowledged == False).values(acknowledged=True))
    await db.commit()
