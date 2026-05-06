from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class DeviceBase(BaseModel):
    mac: str
    ip: str | None = None
    hostname: str | None = None
    manufacturer: str | None = None
    category: str | None = None
    room: str | None = None
    connection: Literal["Wired", "Wireless", "Unknown"] | None = None
    ip_type: Literal["S", "R", "D"] | None = "D"
    description: str | None = None
    known: bool = False


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    hostname: str | None = None
    category: str | None = None
    room: str | None = None
    connection: str | None = None
    ip_type: str | None = None
    description: str | None = None
    known: bool | None = None


class DeviceOut(DeviceBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    online: bool
    first_seen: datetime
    last_seen: datetime


class ScanEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scanned_at: datetime
    duration_ms: int | None
    total_hosts: int | None
    new_devices: int | None
    lost_devices: int | None


class DeviceHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: uuid.UUID
    ip: str | None
    online: bool
    changed_at: datetime


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: uuid.UUID | None
    alert_type: str
    severity: str
    message: str | None
    acknowledged: bool
    created_at: datetime


class AdguardQueryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fetched_at: datetime
    client_ip: str | None
    client_mac: str | None
    question: str | None
    answer: str | None
    status: str | None
    elapsed_ms: int | None


class StatsOut(BaseModel):
    total_devices: int
    online_devices: int
    unknown_devices: int
    last_scan: datetime | None
    alerts_unack: int
