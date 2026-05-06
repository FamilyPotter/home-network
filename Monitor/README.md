# Network Monitor — Calgary House

Local home-network monitoring dashboard built on FastAPI + React + PostgreSQL,
running in Docker containers on the QNAP NAS.

## Stack

| Service | Image | Port |
|---|---|---|
| PostgreSQL 16 | postgres:16-alpine | 5432 |
| pgAdmin 4 | dpage/pgadmin4 | **5050** |
| FastAPI API | ./api | **8000** |
| React UI (nginx) | ./web | **8080** |

## pgAdmin Login

| Field | Value |
|---|---|
| URL | http://192.168.0.150:5050 |
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

## Scanner

The FastAPI service runs an ARP scan every 120 seconds (configurable via `POLL_INTERVAL_SEC` in `.env`).
It also polls the AdGuard Home query log every 5 minutes.

## Credentials

See `.env` for all credentials. Keep this file out of version control — copy to `.env.local` for overrides.
