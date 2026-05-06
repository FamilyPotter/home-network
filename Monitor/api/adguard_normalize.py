"""Normalize AdGuard Home /control/stats JSON for UI (top_* entries use map-like dicts, not {name,count})."""
from __future__ import annotations

from typing import Any


def _normalize_top_entries(entries: list[Any] | None) -> list[dict[str, Any]]:
    if not entries:
        return []
    out: list[dict[str, Any]] = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        if "name" in item and "count" in item:
            try:
                out.append({"name": str(item["name"]), "count": int(item["count"])})
            except (TypeError, ValueError):
                pass
            continue
        for key, val in item.items():
            if key in ("name", "count"):
                continue
            try:
                out.append({"name": str(key), "count": int(val)})
            except (TypeError, ValueError):
                pass
    return out


def normalize_adguard_stats(raw: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of stats with top_* arrays as list[{name, count}]."""
    data = dict(raw)
    data["top_clients"] = _normalize_top_entries(raw.get("top_clients"))
    data["top_blocked_domains"] = _normalize_top_entries(raw.get("top_blocked_domains"))
    data["top_queried_domains"] = _normalize_top_entries(raw.get("top_queried_domains"))
    # Aliases some frontends expect
    if data.get("num_dns_queries") is None and raw.get("dns_queries") is not None:
        # hourly histogram length != total; skip
        pass
    return data


def client_query_totals_from_stats(normalized: dict[str, Any]) -> dict[str, int]:
    """IP/client key -> DNS query count from normalized top_clients."""
    m: dict[str, int] = {}
    for row in normalized.get("top_clients") or []:
        name = row.get("name")
        cnt = row.get("count")
        if name is not None and cnt is not None:
            m[str(name)] = int(cnt)
    return m
