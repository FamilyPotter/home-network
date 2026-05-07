"""Remove DHCP lease for c6:6f:be:a5:27:fd with correct hostname."""
import sys, paramiko, time, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", "UlrTdq05#L"
MON = "/share/Container/netmonitor"

def ssh(c, cmd, timeout=30):
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

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

env_raw = ssh(client, f"cat '{MON}/.env'")
env = {}
for line in env_raw.splitlines():
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
ag_url  = env.get("ADGUARD_URL", "http://192.168.0.150:3000")
ag_user = env.get("ADGUARD_USER", "admin")
ag_pass = env.get("ADGUARD_PASSWORD", "")

# The API requires the exact stored values
body = json.dumps({"mac": "c6:6f:be:a5:27:fd", "ip": "192.168.0.70", "hostname": "family-ipad"})
print(f"Sending: {body}")
out = ssh(client, f"curl -s -w '\\nHTTP %{{http_code}}' "
                  f"-X POST -u '{ag_user}:{ag_pass}' "
                  f"-H 'Content-Type: application/json' "
                  f"-d '{body}' "
                  f"'{ag_url}/control/dhcp/remove_static_lease'")
print(out)

# Confirm gone
out2 = ssh(client, f"curl -s -u '{ag_user}:{ag_pass}' '{ag_url}/control/dhcp/status'")
leases = json.loads(out2).get("static_leases", [])
found = any(l["mac"] == "c6:6f:be:a5:27:fd" for l in leases)
print(f"\nLease still present: {found}")
print(f"Total leases remaining: {len(leases)}")

client.close()
