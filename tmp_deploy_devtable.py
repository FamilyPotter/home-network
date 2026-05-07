import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", "UlrTdq05#L"
DOCKER = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"
MON    = "/share/Container/netmonitor"

def ssh(c, cmd, timeout=300):
    chan = c.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    deadline = time.time() + timeout
    out = b""
    while time.time() < deadline:
        if chan.recv_ready():
            chunk = chan.recv(8192); out += chunk
        elif chan.exit_status_ready() and not chan.recv_ready():
            break
        else:
            time.sleep(0.05)
    rc = chan.recv_exit_status()
    print(out.decode(errors="replace"), end="")
    return rc

def upload(client, local_path, remote_path):
    with open(local_path, "rb") as f:
        data = f.read()
    chan = client.get_transport().open_session()
    chan.exec_command(f"cat > '{remote_path}'")
    chan.sendall(data)
    chan.shutdown_write()
    chan.recv_exit_status()
    chan.close()
    print(f"Uploaded {len(data):,} bytes → {remote_path}")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
print("Connected\n")

files = [
    (r"D:\Network Privacy\Monitor\web\src\components\TrackerTab.tsx",
     f"{MON}/web/src/components/TrackerTab.tsx"),
    (r"D:\Network Privacy\Monitor\web\src\App.tsx",
     f"{MON}/web/src/App.tsx"),
]
for local, remote in files:
    upload(client, local, remote)

print("\nRebuilding web container...")
ssh(client, f"cd '{MON}' && {DOCKER} compose build web 2>&1 | tail -10")
ssh(client, f"cd '{MON}' && {DOCKER} compose up -d --no-deps web 2>&1")

time.sleep(4)
print("\nStatus:")
ssh(client, f"{DOCKER} ps --filter 'name=netmonitor-web' --format '{{{{.Names}}}} {{{{.Status}}}}'", timeout=10)

client.close()
print("\nDone.")
