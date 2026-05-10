# Network Monitor — Calgary House

Local home-network monitoring dashboard built on FastAPI + React + PostgreSQL,
running in Docker containers on the QNAP NAS.

## Stack

| Service | Image | Port |
|---|---|---|
| PostgreSQL 16 | postgres:16.6-alpine | **127.0.0.1:5432** (LAN not published; see `docker-compose.yml`) |
| pgAdmin 4 | dpage/pgadmin4:9.2 | **25050** (host; see `docker-compose.yml`) |
| FastAPI API | ./api | **8000** (uses **host network** on Linux so ARP reaches the LAN) |
| React UI (nginx) | ./web | **8080** — on QNAP, if **8080** is busy, map **8880:80** instead |

## pgAdmin

URL (example): `http://192.168.0.150:25050`

Login email and password come from **`PGADMIN_DEFAULT_EMAIL`** and **`PGADMIN_DEFAULT_PASSWORD`** in [`.env`](.env) (see [`.env.example`](.env.example)). The `netmonitor` database is pre-configured as a server connection in [`db/pgadmin-servers.json`](db/pgadmin-servers.json).

With **`PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED`** enabled in [`docker-compose.yml`](docker-compose.yml), pgAdmin prompts for a **master password** on first use; choose a strong one and store it safely (password manager).

**Security:** If you ever committed real passwords to docs or git, rotate pgAdmin login, the master password, PostgreSQL (`POSTGRES_PASSWORD`), and AdGuard API credentials (`ADGUARD_PASSWORD`) before relying on this stack.

## Related stack: Efficiency Monitor (Smart House)

A separate Docker project (**efficiency_monitor** on GitHub) runs **`efficientymonitor-*`** containers for temperature / weather / future COP analytics. It uses **different** `container_name` values and **different ports** (e.g. web **9080**, pgAdmin **9050**) so this **netmonitor** stack is unchanged. Deploy it in its own folder (e.g. next to `/share/Container/netmonitor`).

## Quick Start (on NAS via Container Station)

```bash
# 1. Copy repo to NAS share, cd into it
cd /share/Container/netmonitor

# 2. Create secrets file (see .env.example)
cp .env.example .env
# Edit .env — strong passwords required

# 3. Device inventory (first run seeds an empty DB from SQL)
#    - New clones: optional `cp db/seed_inventory.example.sql db/seed_inventory.sql` and customize.
#    - If you had a private `seed_inventory.sql` in git before, recover it from history into
#      `db/seed_inventory.sql` (that path is gitignored) so you keep your real MAC/IP list.

# 4. Start all containers
docker compose up -d

# 5. Check logs
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
