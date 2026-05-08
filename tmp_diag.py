"""Check AdGuard DHCP from inside container + all unknown DB devices."""
import os
import sys, paramiko, time, json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS
DOCKER = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"

def ssh(c, cmd, timeout=30):
    chan = c.get_transport().open_session(); chan.set_combine_stderr(True); chan.exec_command(cmd)
    deadline = time.time()+timeout; out = b""
    while time.time()<deadline:
        if chan.recv_ready(): out += chan.recv(65536)
        elif chan.exit_status_ready() and not chan.recv_ready(): break
        else: time.sleep(0.05)
    chan.recv_exit_status(); return out.decode(errors="replace")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

# Try AdGuard DHCP from inside the API container (which has network access to adguard)
print("=== AdGuard DHCP leases (via API container) ===")
env_raw = ssh(client, "cat /share/CACHEDEV1_DATA/Container/netmonitor/.env")
env = {}
for line in env_raw.splitlines():
    if "=" in line and not line.startswith("#"):
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
ag_user = env.get("ADGUARD_USERNAME","admin")
ag_pass = env.get("ADGUARD_PASSWORD","")
ag_url  = env.get("ADGUARD_URL", "http://adguardhome:3001")
print(f"AdGuard URL: {ag_url}, user: {ag_user}")

out = ssh(client, f"{DOCKER} exec netmonitor-api curl -s -u '{ag_user}:{ag_pass}' '{ag_url}/control/dhcp/status' 2>&1")
try:
    dhcp = json.loads(out)
    static  = dhcp.get("static_leases", [])
    dynamic = dhcp.get("leases", [])
    print(f"Static leases: {len(static)},  Dynamic leases: {len(dynamic)}")
    print("\nAll dynamic leases (sorted by IP):")
    for l in sorted(dynamic, key=lambda x: [int(n) for n in (x.get("ip","0.0.0.0").split(".")+["0","0","0","0"])[:4]]):
        print(f"  {l.get('ip','?'):>15}  {l.get('mac','?')}  {l.get('hostname','(no hostname)')}")
    print("\nStatic leases:")
    for l in sorted(static, key=lambda x: [int(n) for n in (x.get("ip","0.0.0.0").split(".")+["0","0","0","0"])[:4]]):
        print(f"  {l.get('ip','?'):>15}  {l.get('mac','?')}  {l.get('hostname','(no hostname)')}")
except Exception as e:
    print(f"Error: {e}\nRaw: {out[:600]}")

# All devices in DB that are unknown / have no hostname
print("\n=== Unknown devices in DB (no hostname or 'unknown') ===")
out = ssh(client, f'{DOCKER} exec netmonitor-db psql -U netmonitor -d netmonitor -c "SELECT ip, mac, hostname, manufacturer, first_seen, last_seen, online FROM devices WHERE hostname IS NULL OR hostname=\'\' ORDER BY last_seen DESC LIMIT 20;"')
print(out)

# Devices that changed IP / MAC recently
print("\n=== All devices seen in last 2 hours ===")
out = ssh(client, f'{DOCKER} exec netmonitor-db psql -U netmonitor -d netmonitor -c "SELECT ip, mac, hostname, manufacturer, first_seen, last_seen FROM devices WHERE last_seen > NOW() - INTERVAL \'2 hours\' ORDER BY last_seen DESC LIMIT 30;"')
print(out)

client.close()
