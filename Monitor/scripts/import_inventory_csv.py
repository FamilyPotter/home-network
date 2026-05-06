#!/usr/bin/env python3
"""Build seed_inventory.sql from network-device-inventory_UPDATED.csv for PostgreSQL devices table."""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

MAC_RE = re.compile(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$", re.I)
IP_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


def esc(s: str) -> str:
    return s.replace("'", "''")


def parse_ip(raw: str) -> str | None:
    t = raw.strip().strip('"').lstrip("~").strip()
    if not t or "CGNAT" in t.upper() or not IP_RE.match(t):
        return None
    return t


def parse_online(alive: str) -> bool:
    a = alive.strip().strip('"').lower()
    if a in ("alive", "yes", "true"):
        return True
    return False


def parse_ip_type(reserved: str) -> str:
    r = reserved.strip().strip('"')
    if "Static OS" in r or r.upper() == "S":
        return "S"
    if "DHCP" in r or "Reserved" in r or r.upper() == "R" or "— DHCP" in r:
        return "R"
    return "D"


def parse_connection(conn: str) -> str:
    c = conn.strip().strip('"')
    if c == "Wired":
        return "Wired"
    if c == "Wireless":
        return "Wireless"
    return "Unknown"


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: import_inventory_csv.py <inventory.csv> <out.sql>", file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    rows: list[tuple] = []
    with src.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mac_raw = (row.get("MAC Address") or "").strip().strip('"')
            if not MAC_RE.match(mac_raw):
                continue
            mac = mac_raw.lower()
            ip = parse_ip(row.get("IP Address") or "")
            hostname = (row.get("Hostname") or "").strip().strip('"') or None
            if hostname == "—":
                hostname = None
            room = (row.get("Room") or "").strip().strip('"') or None
            if room == "—":
                room = None
            online = parse_online(row.get("Alive") or "")
            ip_type = parse_ip_type(row.get("IP Reserved") or "")
            connection = parse_connection(row.get("Connection") or "?")
            manufacturer = (row.get("Manufacturer") or "").strip().strip('"') or None
            if manufacturer == "—":
                manufacturer = None
            category = (row.get("Category") or "").strip().strip('"') or None
            if category == "—":
                category = None
            description = (row.get("Description") or "").strip().strip('"') or None
            if description == "—":
                description = None

            hostname_sql = "NULL" if hostname is None else f"'{esc(hostname)}'"
            ip_sql = "NULL" if ip is None else f"'{ip}'"
            manufacturer_sql = "NULL" if manufacturer is None else f"'{esc(manufacturer)}'"
            category_sql = "NULL" if category is None else f"'{esc(category)}'"
            room_sql = "NULL" if room is None else f"'{esc(room)}'"
            desc_sql = "NULL" if description is None else f"'{esc(description)}'"
            rows.append(
                (
                    mac,
                    ip_sql,
                    hostname_sql,
                    manufacturer_sql,
                    category_sql,
                    room_sql,
                    connection,
                    ip_type,
                    str(online).lower(),
                    desc_sql,
                )
            )

    lines = [
        "-- Auto-generated from network inventory CSV; safe to re-run.",
        "-- ON CONFLICT updates metadata and keeps canonical MAC key.",
        "",
    ]
    for r in rows:
        lines.append(
            "INSERT INTO devices (id, mac, ip, hostname, manufacturer, category, room, connection, ip_type, known, online, description) "
            f"VALUES (gen_random_uuid(), '{r[0]}', {r[1]}, {r[2]}, {r[3]}, {r[4]}, {r[5]}, '{r[6]}', '{r[7]}', TRUE, {r[8]}, {r[9]}) "
            "ON CONFLICT (mac) DO UPDATE SET ip = COALESCE(EXCLUDED.ip, devices.ip), "
            "hostname = COALESCE(EXCLUDED.hostname, devices.hostname), manufacturer = COALESCE(EXCLUDED.manufacturer, devices.manufacturer), "
            "category = COALESCE(EXCLUDED.category, devices.category), room = COALESCE(EXCLUDED.room, devices.room), "
            "connection = EXCLUDED.connection, ip_type = EXCLUDED.ip_type, known = TRUE, "
            "online = EXCLUDED.online, description = COALESCE(EXCLUDED.description, devices.description);"
        )

    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} device rows -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
