"""Shared constants for monitor runtime settings."""

from __future__ import annotations

# Automatic ARP presence scan + AdGuard traffic sample interval (seconds).
ALLOWED_SCAN_INTERVAL_SEC = frozenset(
    {60, 180, 300, 900, 1800, 3600, 10800, 21600, 43200}
)
KEY_POLL_INTERVAL = "poll_interval_sec"


def coerce_scan_interval(sec: int) -> int:
    """Map any integer to the nearest allowed scan interval."""
    if sec in ALLOWED_SCAN_INTERVAL_SEC:
        return sec
    allowed_sorted = sorted(ALLOWED_SCAN_INTERVAL_SEC)
    return min(allowed_sorted, key=lambda x: abs(x - sec))
