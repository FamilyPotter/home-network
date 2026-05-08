"""
1. Deploy fixed schemas.py to API container (restart api only)
2. Add Deco X1500 devices to HA via ping integration + device registry area assignments
"""
import os
import sys, paramiko, time, json, random

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS
DOCKER = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"
MON    = "/share/Container/netmonitor"
HA_CFG = "/share/Calgary House/Container/HomeAssistant/config"

CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
def _enc(n, length):
    r = []
    for _ in range(length):
        r.append(CROCKFORD[n & 0x1f])
        n >>= 5
    return ''.join(reversed(r))
def ulid():
    return _enc(int(time.time() * 1000), 10) + _enc(random.getrandbits(80), 16)

def ssh(c, cmd, timeout=60):
    chan = c.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    deadline = time.time() + timeout
    out = b""
    while time.time() < deadline:
        if chan.recv_ready():
            out += chan.recv(8192)
        elif chan.exit_status_ready() and not chan.recv_ready():
            break
        else:
            time.sleep(0.05)
    chan.recv_exit_status()
    return out.decode(errors="replace")

def upload(client, local_path, remote_path):
    with open(local_path, "rb") as f:
        data = f.read()
    chan = client.get_transport().open_session()
    chan.exec_command(f"cat > '{remote_path}'")
    chan.sendall(data)
    chan.shutdown_write()
    chan.recv_exit_status()
    chan.close()
    print(f"  Uploaded {len(data):,} bytes → {remote_path}")

def upload_text(client, text, remote_path):
    data = text.encode("utf-8")
    chan = client.get_transport().open_session()
    chan.exec_command(f"cat > '{remote_path}'")
    chan.sendall(data)
    chan.shutdown_write()
    chan.recv_exit_status()
    chan.close()
    print(f"  Uploaded {len(data):,} bytes → {remote_path}")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
print("Connected\n")

# ══════════════════════════════════════════════════════════════════════════════
# PART 1: Deploy fixed schemas.py and restart API
# ══════════════════════════════════════════════════════════════════════════════
print("=" * 60)
print("PART 1: Deploy schemas.py fix → restart API")
print("=" * 60)
upload(client, r"D:\Network Privacy\Monitor\api\schemas.py", f"{MON}/api/schemas.py")
out = ssh(client, f"{DOCKER} restart netmonitor-api", timeout=30)
print(f"  {out.strip()}")
time.sleep(4)

# Verify the fix
print("  Testing /adguard/querylog?limit=3 ...")
time.sleep(3)
out2 = ssh(client, "curl -s http://localhost:8000/adguard/querylog?limit=3")
try:
    rows = json.loads(out2)
    print(f"  OK — got {len(rows)} row(s). First client_ip: {rows[0].get('client_ip') if rows else 'N/A'}")
except:
    print(f"  Response: {out2[:300]}")

# ══════════════════════════════════════════════════════════════════════════════
# PART 2: Add Deco X1500 devices to HA via ping integration
# ══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print("PART 2: Add Deco X1500 to HA (ping integration)")
print("=" * 60)

DECOS = [
    {"name": "Deco X1500 Main Node",                    "ip": "192.168.0.90",  "mac": "cc:ba:bd:87:2f:74", "area": "gym"},
    {"name": "Deco X1500 AP — Master Bedroom",          "ip": "192.168.0.100", "mac": "cc:ba:bd:87:2f:04", "area": "bedroom"},
    {"name": "Deco X1500 AP — Front Ensuite Bedroom",   "ip": "192.168.0.99",  "mac": "cc:ba:bd:87:2f:44", "area": "front_bedroom"},
]

NOW_ISO = "2026-05-06T23:30:00.000000+00:00"

# ── Step 2a: Add ping config entries (while HA is running) ────────────────────
# Read current config_entries
out3 = ssh(client, f"{DOCKER} exec homeassistant cat /config/.storage/core.config_entries 2>/dev/null")
cfg = json.loads(out3)
entries = cfg["data"]["entries"]
existing_uids = {(e.get("unique_id") or "").lower() for e in entries}

# Check if ping integration entries already exist for these IPs
existing_ips = set()
for e in entries:
    if e.get("domain") == "ping":
        data = e.get("data", {})
        existing_ips.add(data.get("host", ""))

print(f"  Existing ping entries for IPs: {existing_ips}")

# Stop HA so we can safely edit storage files
print("  Stopping HA...")
out_stop = ssh(client, f"{DOCKER} stop homeassistant", timeout=45)
print(f"  {out_stop.strip()}")
time.sleep(3)

# Read fresh from host filesystem after HA has stopped (final state)
host_cfg  = f"{HA_CFG}/.storage/core.config_entries"
host_dev  = f"{HA_CFG}/.storage/core.device_registry"
host_ent  = f"{HA_CFG}/.storage/core.entity_registry"

cfg_raw  = ssh(client, f"cat '{host_cfg}'")
dev_raw  = ssh(client, f"cat '{host_dev}'")
ent_raw  = ssh(client, f"cat '{host_ent}'")

cfg  = json.loads(cfg_raw)
dreg = json.loads(dev_raw)
ereg = json.loads(ent_raw)

entries   = cfg["data"]["entries"]
devices   = dreg["data"]["devices"]
entities  = ereg["data"]["entities"]

existing_uids = {(e.get("unique_id") or "").lower() for e in entries}

# ── Add ping config entries for each Deco ─────────────────────────────────────
new_entry_ids = {}
for deco in DECOS:
    uid = f"ping-{deco['ip']}"
    if uid in existing_uids:
        print(f"  SKIP ping entry for {deco['ip']} (already exists)")
        # Find existing entry_id
        for e in entries:
            if e.get("unique_id") == uid:
                new_entry_ids[deco["ip"]] = e["entry_id"]
        continue
    eid = ulid()
    new_entry_ids[deco["ip"]] = eid
    entries.append({
        "created_at":  NOW_ISO,
        "data":        {"host": deco["ip"]},
        "disabled_by": None,
        "discovery_keys": {},
        "domain":      "ping",
        "entry_id":    eid,
        "minor_version": 1,
        "modified_at": NOW_ISO,
        "options":     {"consider_home": 180},
        "pref_disable_new_entities": False,
        "pref_disable_polling":      False,
        "source":      "user",
        "subentries":  [],
        "title":       deco["name"],
        "unique_id":   uid,
        "version":     1,
    })
    existing_uids.add(uid)
    print(f"  + Ping entry for {deco['name']} ({deco['ip']}) entry_id={eid}")

cfg["data"]["entries"] = entries

# ── Add device registry entries for each Deco ─────────────────────────────────
existing_dev_conns = set()
for d in devices:
    for conn in (d.get("connections") or []):
        existing_dev_conns.add(tuple(conn))

new_device_ids = {}
for deco in DECOS:
    mac_conn = ("mac", deco["mac"].lower())
    if mac_conn in existing_dev_conns:
        print(f"  SKIP device registry entry for {deco['name']} (MAC already registered)")
        for d in devices:
            if mac_conn in [tuple(c) for c in (d.get("connections") or [])]:
                new_device_ids[deco["ip"]] = d["id"]
        continue
    dev_id = str(random.randint(10**30, 10**32))[:32].replace("-", "")
    # Use a UUID-like hex string
    import uuid as _uuid
    dev_id = _uuid.uuid4().hex
    new_device_ids[deco["ip"]] = dev_id
    eid = new_entry_ids.get(deco["ip"], ulid())
    devices.append({
        "area_id":        deco["area"],
        "config_entries": [eid],
        "config_entries_subentries": {eid: [None]},
        "configuration_url": None,
        "connections": [["mac", deco["mac"].lower()]],
        "created_at":  NOW_ISO,
        "disabled_by": None,
        "entry_type":  None,
        "hw_version":  None,
        "id":          dev_id,
        "identifiers": [["ping", deco["ip"]]],
        "labels":      [],
        "manufacturer": "TP-Link",
        "model":       "Deco X1500",
        "model_id":    None,
        "modified_at": NOW_ISO,
        "name":        deco["name"],
        "name_by_user": deco["name"],
        "primary_config_entry": eid,
        "serial_number": None,
        "sw_version":  None,
        "via_device_id": None,
    })
    existing_dev_conns.add(mac_conn)
    print(f"  + Device registry: {deco['name']} area={deco['area']} id={dev_id}")

dreg["data"]["devices"] = devices

# ── Add entity registry entries (binary_sensor per Deco) ──────────────────────
existing_ent_uids = {e.get("unique_id") for e in entities}
for deco in DECOS:
    ent_uid = f"ping-{deco['ip']}"
    if ent_uid in existing_ent_uids:
        print(f"  SKIP entity for {deco['ip']}")
        continue
    eid = new_entry_ids.get(deco["ip"], "")
    dev_id = new_device_ids.get(deco["ip"], "")
    slug = deco["name"].lower().replace(" ", "_").replace("—", "").replace("-", "_").replace("__", "_").strip("_")
    entities.append({
        "aliases":           [],
        "area_id":           deco["area"],
        "capabilities":      None,
        "categories":        {},
        "config_entry_id":   eid,
        "config_subentry_id": None,
        "created_at":        NOW_ISO,
        "device_class":      "connectivity",
        "device_id":         dev_id,
        "disabled_by":       None,
        "entity_category":   None,
        "entity_id":         f"binary_sensor.{slug}",
        "has_entity_name":   True,
        "hidden_by":         None,
        "icon":              "mdi:router-wireless",
        "id":                _uuid.uuid4().hex,
        "labels":            [],
        "modified_at":       NOW_ISO,
        "name":              deco["name"],
        "options":           {},
        "original_device_class": "connectivity",
        "original_icon":     "mdi:router-wireless",
        "original_name":     deco["name"],
        "platform":          "ping",
        "previous_unique_id": None,
        "supported_features": 0,
        "translation_key":   None,
        "unique_id":         ent_uid,
        "unit_of_measurement": None,
    })
    existing_ent_uids.add(ent_uid)
    print(f"  + Entity: binary_sensor.{slug}")

ereg["data"]["entities"] = entities

# ── Write all three files ──────────────────────────────────────────────────────
upload_text(client, json.dumps(cfg, indent=2),  host_cfg)
upload_text(client, json.dumps(dreg, indent=2), host_dev)
upload_text(client, json.dumps(ereg, indent=2), host_ent)

# ── Also add ping integration to configuration.yaml if not already there ──────
print("\n  Checking configuration.yaml for ping entries...")
cfg_yaml_raw = ssh(client, f"cat '{HA_CFG}/configuration.yaml' 2>/dev/null")
print(f"  configuration.yaml:\n{cfg_yaml_raw[:500]}")

# ── Start HA ──────────────────────────────────────────────────────────────────
print("\n  Starting HA...")
out_start = ssh(client, f"{DOCKER} start homeassistant", timeout=15)
print(f"  {out_start.strip()}")
print("  Allow ~90 s to boot.")

client.close()
print("\nDone.")
