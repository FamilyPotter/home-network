from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Device, DeviceHistory
from schemas import DeviceCreate, DeviceOut, DeviceUpdate, DeviceHistoryOut

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("/", response_model=list[DeviceOut])
async def list_devices(
    room: str | None = None,
    online: bool | None = None,
    known: bool | None = None,
    category: str | None = None,
    limit: int = Query(200, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Device)
    if room:
        q = q.where(Device.room == room)
    if online is not None:
        q = q.where(Device.online == online)
    if known is not None:
        q = q.where(Device.known == known)
    if category:
        q = q.where(Device.category == category)
    q = q.order_by(Device.last_seen.desc()).offset(offset).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(device_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    d = await db.get(Device, device_id)
    if not d:
        raise HTTPException(404, "Device not found")
    return d


@router.post("/", response_model=DeviceOut, status_code=201)
async def create_device(payload: DeviceCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(Device).where(Device.mac == payload.mac))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Device with this MAC already exists")
    d = Device(**payload.model_dump())
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


@router.patch("/{device_id}", response_model=DeviceOut)
async def update_device(device_id: uuid.UUID, payload: DeviceUpdate, db: AsyncSession = Depends(get_db)):
    d = await db.get(Device, device_id)
    if not d:
        raise HTTPException(404, "Device not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(d, key, val)
    await db.commit()
    await db.refresh(d)
    return d


@router.delete("/{device_id}", status_code=204)
async def delete_device(device_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    d = await db.get(Device, device_id)
    if not d:
        raise HTTPException(404, "Device not found")
    await db.execute(sql_delete(Device).where(Device.id == device_id))
    await db.commit()


@router.get("/{device_id}/history", response_model=list[DeviceHistoryOut])
async def device_history(
    device_id: uuid.UUID,
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(DeviceHistory)
        .where(DeviceHistory.device_id == device_id)
        .order_by(DeviceHistory.changed_at.desc())
        .limit(limit)
    )
    result = await db.execute(q)
    return result.scalars().all()
