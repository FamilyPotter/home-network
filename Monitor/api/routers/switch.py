"""Proxy endpoint: pull live port statistics from the TL-SG108PE switch.

The switch (192.168.0.105) blocks ALL management CGI requests from the NAS IP
(192.168.0.150) as a security policy — the gateway IP cannot authenticate.  GET
requests to HTML pages return the login-page.  When we detect this, we fall back
to the static known-good port layout captured from the browser session and set
``live=False`` so the UI can show a staleness badge.
"""
from __future__ import annotations

import re
import time
from typing import Any

import httpx
from fastapi import APIRouter

from config import settings

router = APIRouter(prefix="/switch", tags=["switch"])

# ---------------------------------------------------------------------------
# Static port map — device names, PoE capability, last-known link status
# (captured 2026-05-08 from browser session at 192.168.0.68)
# ---------------------------------------------------------------------------
_STATIC_PORTS: list[dict] = [
    {"port": 1, "poe": True,  "device": "HIK CCTV Gate",        "description": "HikVision PoE camera — Gate",
     "link_status": "100MF", "speed_mbps": 100,  "duplex": "Full", "up": True,
     "tx_good": 0, "tx_bad": 0, "rx_good": 0, "rx_bad": 0},
    {"port": 2, "poe": True,  "device": "HIK CCTV Front",       "description": "HikVision PoE camera — Front",
     "link_status": "100MF", "speed_mbps": 100,  "duplex": "Full", "up": True,
     "tx_good": 0, "tx_bad": 0, "rx_good": 0, "rx_bad": 0},
    {"port": 3, "poe": True,  "device": "HIK CCTV Rear",        "description": "HikVision PoE camera — Rear",
     "link_status": "100MF", "speed_mbps": 100,  "duplex": "Full", "up": True,
     "tx_good": 0, "tx_bad": 0, "rx_good": 0, "rx_bad": 0},
    {"port": 4, "poe": True,  "device": "",                     "description": "Empty — PoE capable",
     "link_status": "Link Down", "speed_mbps": None, "duplex": None, "up": False,
     "tx_good": 0, "tx_bad": 0, "rx_good": 0, "rx_bad": 0},
    {"port": 5, "poe": False, "device": "Fingbox",              "description": "Fing network monitor",
     "link_status": "100MF", "speed_mbps": 100,  "duplex": "Full", "up": True,
     "tx_good": 0, "tx_bad": 0, "rx_good": 0, "rx_bad": 0},
    {"port": 6, "poe": False, "device": "Deco X1500 Main Node", "description": "TP-Link Deco X1500 main mesh node",
     "link_status": "1000MF", "speed_mbps": 1000, "duplex": "Full", "up": True,
     "tx_good": 0, "tx_bad": 0, "rx_good": 0, "rx_bad": 0},
    {"port": 7, "poe": False, "device": "GS116 uplink",         "description": "NETGEAR GS116 — Room 2 expansion",
     "link_status": "1000MF", "speed_mbps": 1000, "duplex": "Full", "up": True,
     "tx_good": 0, "tx_bad": 0, "rx_good": 0, "rx_bad": 0},
    {"port": 8, "poe": False, "device": "CALGARYHOUSE",         "description": "QNAP NAS eth1 (192.168.0.150)",
     "link_status": "1000MF", "speed_mbps": 1000, "duplex": "Full", "up": True,
     "tx_good": 0, "tx_bad": 0, "rx_good": 0, "rx_bad": 0},
]

# Port map meta (index = port-1)
_PORT_MAP = [
    {"poe": True,  "device": "HIK CCTV Gate",        "description": "HikVision PoE camera — Gate"},
    {"poe": True,  "device": "HIK CCTV Front",       "description": "HikVision PoE camera — Front"},
    {"poe": True,  "device": "HIK CCTV Rear",        "description": "HikVision PoE camera — Rear"},
    {"poe": True,  "device": "",                     "description": "Empty — PoE capable"},
    {"poe": False, "device": "Fingbox",              "description": "Fing network monitor"},
    {"poe": False, "device": "Deco X1500 Main Node", "description": "TP-Link Deco X1500 main mesh node"},
    {"poe": False, "device": "GS116 uplink",         "description": "NETGEAR GS116 — Room 2 expansion"},
    {"poe": False, "device": "CALGARYHOUSE",         "description": "QNAP NAS eth1 (192.168.0.150)"},
]

_LINK_INFO   = ["Link Down", "Auto", "10MH", "10MF", "100MH", "100MF", "1000MF", ""]
_LINK_SPEED  = ["", "", "10", "10", "100", "100", "1000", ""]
_LINK_DUPLEX = ["", "Auto", "Half", "Full", "Half", "Full", "Full", ""]

# In-process cache (30 s TTL)
_cache: dict[str, Any] = {}
_CACHE_TTL = 30


def _is_login_page(html: str) -> bool:
    """Return True if the switch returned its login page instead of data."""
    return "logonInfo" in html or "logon.cgi" in html


def _parse_array(html: str, name: str) -> list[int]:
    m = re.search(rf"{re.escape(name)}:\s*\[([^\]]+)\]", html)
    if not m:
        return []
    return [int(x.strip()) for x in m.group(1).split(",") if x.strip().lstrip("-").isdigit()]


def _build_ports_from_html(html: str) -> list[dict]:
    state_vals  = _parse_array(html, "state")
    link_vals   = _parse_array(html, "link_status")
    pkts        = _parse_array(html, "pkts")

    ports = []
    for i, pm in enumerate(_PORT_MAP):
        ls = link_vals[i] if i < len(link_vals) else 0
        st = state_vals[i] if i < len(state_vals) else 0
        base = 4 * i
        tx_good = pkts[base]     if base     < len(pkts) else 0
        tx_bad  = pkts[base + 1] if base + 1 < len(pkts) else 0
        rx_good = pkts[base + 2] if base + 2 < len(pkts) else 0
        rx_bad  = pkts[base + 3] if base + 3 < len(pkts) else 0

        link_label = _LINK_INFO[ls]  if ls < len(_LINK_INFO)  else ""
        speed      = _LINK_SPEED[ls] if ls < len(_LINK_SPEED) else ""
        duplex     = _LINK_DUPLEX[ls] if ls < len(_LINK_DUPLEX) else ""

        ports.append({
            "port":        i + 1,
            "enabled":     bool(st),
            "poe":         pm["poe"],
            "device":      pm["device"],
            "description": pm["description"],
            "link_status": link_label,
            "speed_mbps":  int(speed) if speed else None,
            "duplex":      duplex if duplex else None,
            "up":          ls > 0,
            "tx_good":     tx_good,
            "tx_bad":      tx_bad,
            "rx_good":     rx_good,
            "rx_bad":      rx_bad,
        })
    return ports


@router.get("/ports")
async def switch_ports():
    """Return port status for TL-SG108PE.

    Attempts a live scrape; falls back to static layout when the switch
    blocks access from the NAS gateway IP (192.168.0.150).
    """
    now = time.monotonic()
    if "result" in _cache and now - _cache.get("ts", 0) < _CACHE_TTL:
        return _cache["result"]

    live = False
    ports = None

    try:
        url = f"{settings.switch_url}/PortStatisticsRpm.htm"
        async with httpx.AsyncClient(timeout=6) as client:
            resp = await client.get(url, auth=(settings.switch_user, settings.switch_password))
        html = resp.text

        if not _is_login_page(html) and "all_info" in html:
            ports = _build_ports_from_html(html)
            live = True
    except Exception:
        pass  # network error → fall through to static

    if ports is None:
        # Static fallback: known-good layout, no live packet counters
        ports = [dict(p, enabled=True) for p in _STATIC_PORTS]

    result = {
        "switch":    "TL-SG108PE",
        "switch_ip": "192.168.0.105",
        "live":      live,
        "note":      None if live else (
            "Live polling blocked — the switch rejects management connections "
            "from the NAS gateway IP (192.168.0.150). Port layout reflects "
            "the known static configuration; link speeds are last-known."
        ),
        "ports": ports,
    }
    _cache["result"] = result
    _cache["ts"] = now
    return result
