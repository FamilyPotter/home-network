"""
Assign areas to the two new TP-Link devices and optionally set friendly names.
Stop HA → edit device_registry → start HA.
"""
import sys, paramiko, time, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", "UlrTdq05#L"
DOCKER = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"
HA_CFG = "/share/Calgary House/Container/HomeAssistant/config"

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
    rc = chan.recv_exit_status()
    return rc, out.decode(errors="replace")

def upload_text(client, text: str, remote_path: str):
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

# entry_id → (area_id, user_name)
# From our config entries:
#   SonosBed P100: entry_id=01KQZNEZZ2R6GT7TF7R6BXNBDC → loft
#   PROMAX P110:   entry_id=01KQZNEZZ2HWQETXW4J56MG7G4 → lounge
ENTRY_AREA_NAME = {
    "01KQZNEZZ2R6GT7TF7R6BXNBDC": ("loft",   "SonosBed P100"),
    "01KQZNEZZ2HWQETXW4J56MG7G4": ("lounge",  "PROMAX P110"),
}

print("Stopping HA...")
rc, out = ssh(client, f"{DOCKER} stop homeassistant", timeout=45)
print(f"  {out.strip()}")
time.sleep(3)

host_dev = f"{HA_CFG}/.storage/core.device_registry"
rc, raw = ssh(client, f"cat '{host_dev}'")
dreg = json.loads(raw)
devices = dreg["data"]["devices"]

changed = 0
for d in devices:
    d_entries = set(d.get("config_entries") or [])
    for eid, (area_id, user_name) in ENTRY_AREA_NAME.items():
        if eid in d_entries:
            old_area = d.get("area_id")
            old_name = d.get("name_by_user")
            if old_area != area_id or old_name != user_name:
                d["area_id"] = area_id
                d["name_by_user"] = user_name
                print(f"  Updated: {d.get('name')} → area={area_id}, name_by_user={user_name}  (was area={old_area}, name_by_user={old_name})")
                changed += 1

if changed:
    dreg["data"]["devices"] = devices
    upload_text(client, json.dumps(dreg, indent=2), host_dev)
else:
    print("  No changes needed")

print("\nStarting HA...")
rc, out = ssh(client, f"{DOCKER} start homeassistant", timeout=15)
print(f"  {out.strip()}")

client.close()
print("\nDone — HA starting, allow ~90 s.")
