#!/usr/bin/env bash
# =============================================================================
# nas_fix.sh — One-shot fix: pull latest code, seed DB, set AdGuard creds,
#              restart Monitor stack.
#
# Run on the QNAP NAS via SSH or Container Station terminal:
#   cd /path/to/home-network/Monitor
#   bash scripts/nas_fix.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="$(dirname "$MONITOR_DIR")"

cd "$MONITOR_DIR"
echo "=== Working in: $MONITOR_DIR ==="

# ── 1. Git pull ───────────────────────────────────────────────────────────────
echo ""
echo "=== Pulling latest code ==="
cd "$REPO_DIR"
git pull
cd "$MONITOR_DIR"

# ── 2. .env check / create ────────────────────────────────────────────────────
echo ""
echo "=== Checking .env ==="
if [[ ! -f .env ]]; then
  echo "  .env not found — creating from defaults."
  cat > .env <<'ENVEOF'
POSTGRES_USER=netmonitor
POSTGRES_PASSWORD=change_me_strong_db_password
POSTGRES_DB=netmonitor
PGADMIN_DEFAULT_EMAIL=admin@example.local
PGADMIN_DEFAULT_PASSWORD=change_me_pgadmin_login_password
ADGUARD_URL=http://192.168.0.150:3000
ADGUARD_USER=admin
ADGUARD_PASSWORD=
POLL_INTERVAL_SEC=120
ENVEOF
  echo "  Created .env with defaults."
fi

# ── 3. Prompt for AdGuard password ────────────────────────────────────────────
echo ""
echo "=== AdGuard credentials ==="
CURRENT_AG_PASS=$(grep '^ADGUARD_PASSWORD=' .env | cut -d= -f2- || true)
if [[ -z "$CURRENT_AG_PASS" ]]; then
  read -rp "  AdGuard admin password (leave blank if none set): " AG_PASS
  if [[ -n "$AG_PASS" ]]; then
    # Replace or add ADGUARD_PASSWORD line
    if grep -q '^ADGUARD_PASSWORD=' .env; then
      sed -i "s|^ADGUARD_PASSWORD=.*|ADGUARD_PASSWORD=$AG_PASS|" .env
    else
      echo "ADGUARD_PASSWORD=$AG_PASS" >> .env
    fi
    echo "  AdGuard password saved to .env."
  else
    echo "  No password set — AdGuard will be accessed without auth."
  fi
else
  echo "  ADGUARD_PASSWORD already set in .env (not changed)."
fi

# ── 4. Rebuild and bring up containers ────────────────────────────────────────
echo ""
echo "=== Rebuilding and starting containers ==="
docker compose pull --ignore-pull-failures 2>/dev/null || true
docker compose build --no-cache api web
docker compose up -d --force-recreate

# ── 5. Wait for DB to be ready ────────────────────────────────────────────────
echo ""
echo "=== Waiting for Postgres to be ready ==="
for i in $(seq 1 20); do
  if docker compose exec -T db pg_isready -U netmonitor -d netmonitor -q 2>/dev/null; then
    echo "  Postgres ready."
    break
  fi
  echo "  Waiting... ($i/20)"
  sleep 3
done

# ── 6. Run seed_inventory.sql (idempotent — ON CONFLICT DO UPDATE) ───────────
echo ""
echo "=== Seeding device inventory ==="
SEED_SQL="$MONITOR_DIR/db/seed_inventory.sql"
if [[ -f "$SEED_SQL" ]]; then
  docker compose exec -T db psql -U netmonitor -d netmonitor < "$SEED_SQL"
  echo "  Device inventory seeded."
else
  echo "  WARNING: $SEED_SQL not found — skipping seed."
fi

# ── 7. Show API logs ──────────────────────────────────────────────────────────
echo ""
echo "=== Last 30 lines of API logs ==="
sleep 5
docker compose logs --tail=30 api

echo ""
echo "=== Done! ==="
echo "  Monitor UI:  http://192.168.0.150:8080"
echo "  API health:  http://192.168.0.150:8000/health"
echo "  AdGuard:     http://192.168.0.150:3000"
echo ""
echo "  If AdGuard stats/queries are still empty, check the API logs above"
echo "  for lines containing 'AdGuard query log fetch failed'."
echo "  The ADGUARD_PASSWORD in .env must match the password set in the"
echo "  AdGuard wizard at http://192.168.0.150:3000 ."
