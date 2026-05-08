"""
Find the correct filter parameter for AdGuard v0.107.74 querylog.
"""
import os
import sys, json, paramiko, time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS

def ssh(c, cmd, timeout=20):
    chan = c.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    deadline = time.time() + timeout
    out = b""
    while time.time() < deadline:
        if chan.recv_ready():
            chunk = chan.recv(16384); out += chunk
        elif chan.exit_status_ready() and not chan.recv_ready():
            break
        else:
            time.sleep(0.05)
    return chan.recv_exit_status(), out.decode(errors="replace")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

rc, out = ssh(client, "cat /share/Container/netmonitor/.env")
env = {}
for line in out.splitlines():
    if '=' in line and not line.startswith('#'):
        k, _, v = line.partition('='); env[k.strip()] = v.strip().strip('"\'')
ag_url  = env.get("ADGUARD_URL", "http://192.168.0.150:3000")
ag_user = env.get("ADGUARD_USER", "admin")
ag_pass = env.get("ADGUARD_PASSWORD", "")

def ag_curl(params):
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    rc, out = ssh(client, f'curl -s -u "{ag_user}:{ag_pass}" "{ag_url}/control/querylog?{qs}"')
    try:
        data = json.loads(out).get("data", [])
        unique = list({e.get("client") for e in data})
        return len(data), unique
    except:
        return 0, [out[:100]]

TEST_IP = "192.168.0.51"  # Sky Q — very active, easy to verify

print("Testing different filter parameters for client IP:", TEST_IP)
print()

# Try each candidate parameter name
candidates = [
    {"limit": 20, "client": TEST_IP},
    {"limit": 20, "search": TEST_IP},
    {"limit": 20, "client_id": TEST_IP},
    {"limit": 20, "filter_client": TEST_IP},
    {"limit": 20, "search": TEST_IP, "response_status": "all"},
]
for params in candidates:
    n, clients = ag_curl(params)
    ok = all(c == TEST_IP for c in clients) if clients else False
    marker = "✓ WORKS" if ok else "✗ no filter"
    print(f"  {params} → {n} entries, clients={clients[:4]}  {marker}")

# Also check the OpenAPI spec if exposed
print()
rc, out = ssh(client, f'curl -s -u "{ag_user}:{ag_pass}" "{ag_url}/openapi.yaml" 2>&1 | grep -A3 "querylog" | head -20')
print("OpenAPI querylog spec:\n", out[:500])

client.close()
