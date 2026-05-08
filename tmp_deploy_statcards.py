"""Deploy StatCard click-to-navigate enhancement and rebuild web container."""
import os
import sys, paramiko, time, pathlib, base64

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS
DOCKER     = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"
BASE       = pathlib.Path(r"C:\Users\FamilyPotter\OneDrive - Simon Potter Tenant\Cursor\Network Privacy")
REMOTE_SRC = "/share/CACHEDEV1_DATA/Container/netmonitor/web/src"

files = [
    ("Monitor/web/src/App.tsx",                        f"{REMOTE_SRC}/App.tsx"),
    ("Monitor/web/src/components/StatCard.tsx",        f"{REMOTE_SRC}/components/StatCard.tsx"),
    ("Monitor/web/src/components/SwitchTab.tsx",       f"{REMOTE_SRC}/components/SwitchTab.tsx"),
    ("Monitor/web/src/types/index.ts",                 f"{REMOTE_SRC}/types/index.ts"),
]

def ssh(c, cmd, timeout=120):
    chan = c.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    deadline = time.time() + timeout
    out = b""
    while time.time() < deadline:
        if chan.recv_ready():
            out += chan.recv(65536)
        elif chan.exit_status_ready() and not chan.recv_ready():
            break
        else:
            time.sleep(0.1)
    chan.recv_exit_status()
    return out.decode(errors="replace")

def upload_b64(c, local_path, remote_path):
    content = pathlib.Path(local_path).read_bytes()
    b64 = base64.b64encode(content).decode()
    chunk = 60000
    print(f"  Uploading {local_path.name} ({len(content):,} bytes) ...", end="", flush=True)
    ssh(c, f"echo '{b64[:chunk]}' | base64 -d > {remote_path}")
    pos = chunk
    while pos < len(b64):
        ssh(c, f"echo '{b64[pos:pos+chunk]}' | base64 -d >> {remote_path}")
        pos += chunk
    print(" done")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
print("Connected to NAS\n")

print("=== Uploading files ===")
for local, remote in files:
    upload_b64(client, BASE / local, remote)

print("\n=== Rebuilding web container ===")
out = ssh(client, f"cd /share/CACHEDEV1_DATA/Container/netmonitor && {DOCKER} compose build web 2>&1", timeout=300)
print(out[-3000:])

print("\n=== Restarting web container ===")
out = ssh(client, f"cd /share/CACHEDEV1_DATA/Container/netmonitor && {DOCKER} compose up -d --no-deps web 2>&1", timeout=60)
print(out)

print("\n=== Verify ===")
time.sleep(5)
out = ssh(client, f"{DOCKER} ps --filter name=netmonitor-web --format '{{{{.Names}}}} {{{{.Status}}}}'")
print("web:", out.strip())

client.close()
print("\nDone.")
