# Network Monitor — Calgary House

Local home-network monitoring dashboard built on FastAPI + React + PostgreSQL,
running in Docker containers on the QNAP NAS.

## Stack

| Service | Image | Port |
|---|---|---|
| PostgreSQL 16 | postgres:16-alpine | 5432 |
| pgAdmin 4 | dpage/pgadmin4 | **25050** (host; see `docker-compose.yml`) |
| FastAPI API | ./api | **8000** (uses **host network** on Linux so ARP reaches the LAN) |
| React UI (nginx) | ./web | **8080** — on QNAP, if **8080** is busy, map **8880:80** instead |

## pgAdmin Login

| Field | Value |
|---|---|
| URL | http://192.168.0.150:25050 |
| Email | `admin@familypotter.local` |
| Password | `Chester123!pg` |

The `netmonitor` database is pre-configured as a server connection.

## Quick Start (on NAS via Container Station)

```bash
# 1. Copy repo to NAS share, cd into it
cd /share/Container/netmonitor

# 2. Start all containers
docker compose up -d

# 3. Check logs
docker compose logs -f api
```

## API Docs

Once running: http://192.168.0.150:8000/docs

## Web UI API calls

Production builds use **same-origin** requests to `/api/...` (nginx proxies to the FastAPI container host). Rebuild the **web** image after changing API URLs.

The **DNS** column matches devices by **IP** to AdGuard’s **top clients** list (statistics interval configured in AdGuard). LAN bandwidth per device is not available without extra tooling.

The **`adguard_queries`** table is filled by a scheduled job (`poll_adguard_queries`, interval **`ADGUARD_QUERY_POLL_SEC`**, default 300s). If it stays empty, confirm **Settings → General settings → Statistics / Query logs** in AdGuard allows query logging and that API credentials in `.env` work.

## Scanner

The FastAPI service runs an ARP scan every 120 seconds (configurable via `POLL_INTERVAL_SEC` in `.env`).
The **API container uses `network_mode: host`** so ARP broadcasts reach your LAN; with a normal bridge-only API, **Scan Now finds 0 devices**.

If you still see zero hosts on some QNAP models, set **`SCAN_IFACE`** in `.env` to the LAN interface (examples: `bond0`, `eth0`, `ovs_eth0`), then recreate the API container.

It also polls AdGuard Home for traffic samples on the same interval.

## Credentials

See `.env` for all credentials. Keep this file out of version control — copy to `.env.local` for overrides.
