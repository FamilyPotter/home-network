import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, BigInteger, Integer, Text, DateTime, ForeignKey, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID, INET, MACADDR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mac: Mapped[str] = mapped_column(MACADDR, nullable=False, unique=True)
    ip: Mapped[str | None] = mapped_column(INET)
    hostname: Mapped[str | None] = mapped_column(Text)
    manufacturer: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    room: Mapped[str | None] = mapped_column(Text)
    connection: Mapped[str | None] = mapped_column(Text)
    ip_type: Mapped[str | None] = mapped_column(Text, default="D")
    description: Mapped[str | None] = mapped_column(Text)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    known: Mapped[bool] = mapped_column(Boolean, default=False)

    history: Mapped[list["DeviceHistory"]] = relationship("DeviceHistory", back_populates="device")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="device")
    events: Mapped[list["DeviceEvent"]] = relationship("DeviceEvent", back_populates="device")
    snapshots: Mapped[list["PresenceSnapshot"]] = relationship("PresenceSnapshot", back_populates="device")
    traffic_samples: Mapped[list["TrafficSample"]] = relationship("TrafficSample", back_populates="device")


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    total_hosts: Mapped[int | None] = mapped_column(Integer)
    new_devices: Mapped[int | None] = mapped_column(Integer)
    lost_devices: Mapped[int | None] = mapped_column(Integer)

    history: Mapped[list["DeviceHistory"]] = relationship("DeviceHistory", back_populates="scan")


class DeviceHistory(Base):
    __tablename__ = "device_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"))
    scan_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("scan_events.id", ondelete="SET NULL"))
    ip: Mapped[str | None] = mapped_column(INET)
    online: Mapped[bool] = mapped_column(Boolean, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    device: Mapped["Device"] = relationship("Device", back_populates="history")
    scan: Mapped["ScanEvent"] = relationship("ScanEvent", back_populates="history")


class AdguardQuery(Base):
    __tablename__ = "adguard_queries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    queried_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, unique=True)
    client_ip: Mapped[str | None] = mapped_column(INET)
    client_mac: Mapped[str | None] = mapped_column(MACADDR)
    question: Mapped[str | None] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(Text)
    elapsed_ms: Mapped[int | None] = mapped_column(Integer)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"))
    alert_type: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(Text, default="info")
    message: Mapped[str | None] = mapped_column(Text)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    device: Mapped["Device | None"] = relationship("Device", back_populates="alerts")


class DeviceEvent(Base):
    __tablename__ = "device_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    device: Mapped["Device"] = relationship("Device", back_populates="events")


class PresenceSnapshot(Base):
    __tablename__ = "presence_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"))
    sampled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    ip: Mapped[str | None] = mapped_column(INET)
    mac: Mapped[str] = mapped_column(MACADDR)
    alive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rtt_ms: Mapped[int | None] = mapped_column(Integer)

    device: Mapped["Device"] = relationship("Device", back_populates="snapshots")


class TrafficSample(Base):
    __tablename__ = "traffic_samples"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"))
    sampled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    bytes_in: Mapped[int] = mapped_column(BigInteger, default=0)
    bytes_out: Mapped[int] = mapped_column(BigInteger, default=0)
    dns_query_count: Mapped[int] = mapped_column(Integer, default=0)
    dns_block_count: Mapped[int] = mapped_column(Integer, default=0)

    device: Mapped["Device | None"] = relationship("Device", back_populates="traffic_samples")


class MonitorSetting(Base):
    __tablename__ = "monitor_settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
