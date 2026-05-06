"""
Domain-to-tracker enrichment using the Ghostery / WhoTracks.me TrackerDB.

Source: https://github.com/whotracksme/whotracks.me  (CC-BY-NC-SA-4.0)
The SQLite dump is downloaded once and cached for the container lifetime.
"""
from __future__ import annotations

import logging
import re
import sqlite3
from pathlib import Path
from typing import NamedTuple

import httpx

logger = logging.getLogger("tracker_lookup")

TRACKERDB_URL = (
    "https://raw.githubusercontent.com/whotracksme/whotracks.me"
    "/master/whotracksme/data/assets/trackerdb.sql"
)
CACHE_PATH = Path("/tmp/trackerdb.sqlite")

# Category display names used for UI badges
CATEGORY_LABELS: dict[str, str] = {
    "advertising": "Advertising",
    "site_analytics": "Analytics",
    "social_media": "Social",
    "cdn": "CDN",
    "hosting": "Hosting",
    "customer_interaction": "Customer",
    "audio_video_player": "Media",
    "comments": "Comments",
    "email": "Email",
    "essential": "Essential",
    "extensions": "Extension",
    "misc": "Misc",
    "pornvertising": "Adult Ads",
    "telemetry": "Telemetry",
    "consent": "Consent",
    "utility": "Utility",
    "unknown": "Unknown",
}


class TrackerInfo(NamedTuple):
    name: str      # e.g. "Google Analytics"
    category: str  # raw key e.g. "site_analytics"
    org: str       # e.g. "Google"


_lookup: dict[str, TrackerInfo] = {}
_enabled = False


def preload() -> None:
    """Download (if needed) and build the domain lookup. Call once at startup."""
    global _enabled
    try:
        _ensure_sqlite()
        _build_lookup()
        if not _lookup:
            # Cache may have been written before unistr fix — wipe and retry once
            logger.warning("TrackerDB loaded 0 entries; wiping cache and retrying…")
            CACHE_PATH.unlink(missing_ok=True)
            _ensure_sqlite()
            _build_lookup()
        _enabled = True
        logger.info("TrackerDB loaded — %d domain entries", len(_lookup))
    except Exception as exc:
        logger.warning("TrackerDB unavailable; tracker enrichment disabled: %s", exc)


def _unistr(s: str | None) -> str | None:
    """Python shim for SQLite's unistr() added in 3.42 — decodes \\uXXXX escapes."""
    if not s:
        return s
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)


def _open_rw() -> sqlite3.Connection:
    conn = sqlite3.connect(str(CACHE_PATH))
    conn.create_function("unistr", 1, _unistr)
    return conn


def _open_ro() -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{CACHE_PATH}?mode=ro", uri=True)
    conn.create_function("unistr", 1, _unistr)
    return conn


def _ensure_sqlite() -> None:
    """Download trackerdb.sql and import into a local SQLite file if not cached."""
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 50_000:
        logger.info("TrackerDB cache found at %s", CACHE_PATH)
        return

    logger.info("Downloading TrackerDB SQL from GitHub…")
    resp = httpx.get(TRACKERDB_URL, timeout=90, follow_redirects=True)
    resp.raise_for_status()

    conn = _open_rw()
    try:
        conn.executescript(resp.text)
        conn.commit()
    finally:
        conn.close()
    logger.info("TrackerDB cached at %s (%d bytes)", CACHE_PATH, CACHE_PATH.stat().st_size)


def _build_lookup() -> None:
    """Populate _lookup dict from SQLite. Handles both whotracks.me and ghostery/trackerdb schemas."""
    conn = _open_ro()
    rows = []
    try:
        # Preferred: whotracks.me schema
        # tracker_domains(tracker→int, domain), trackers(id,name,category,company), categories, companies
        try:
            rows = conn.execute("""
                SELECT td.domain, t.name, c.name, COALESCE(co.name, '')
                FROM   tracker_domains td
                JOIN   trackers   t  ON t.id  = td.tracker
                JOIN   categories c  ON c.id  = t.category
                LEFT JOIN companies co ON co.id = t.company
            """).fetchall()
        except sqlite3.OperationalError:
            pass

        # Fallback: ghostery/trackerdb schema
        # tracker_domains(pattern→key, domain), patterns(key,name,category,organization)
        if not rows:
            rows = conn.execute("""
                SELECT td.domain, p.name, c.name, COALESCE(o.name, '')
                FROM   tracker_domains td
                JOIN   patterns       p ON p.key = td.pattern
                JOIN   categories     c ON c.key = p.category
                LEFT JOIN organizations o ON o.id = p.organization
            """).fetchall()
    finally:
        conn.close()

    for domain, name, category, org in rows:
        info = TrackerInfo(
            name=name or "",
            category=(category or "unknown").lower().replace(" ", "_"),
            org=org or "",
        )
        _lookup[domain.lower()] = info


def _etld1(fqdn: str) -> str:
    """Return the effective TLD+1 (e.g. 'sub.example.com' → 'example.com')."""
    parts = fqdn.rstrip(".").split(".")
    return ".".join(parts[-2:]) if len(parts) > 2 else fqdn


def lookup_domain(fqdn: str | None) -> TrackerInfo | None:
    """Return TrackerInfo for a DNS question hostname, or None if not in TrackerDB."""
    if not fqdn or not _enabled:
        return None
    fqdn = fqdn.rstrip(".").lower()
    return _lookup.get(fqdn) or _lookup.get(_etld1(fqdn))
