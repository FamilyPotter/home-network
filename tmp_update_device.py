import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", "UlrTdq05#L"

def ssh(c, cmd, timeout=20):
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
    return chan.recv_exit_status(), out.decode(errors="replace")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

# Find the device UUID for 192.168.0.51 then update hostname
rc, out = ssh(client, """
psql_cmd() { /share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker exec netmonitor-db psql -U netmonitor -d netmonitor -t -c "$1"; }
psql_cmd "SELECT id, hostname, ip FROM devices WHERE ip = '192.168.0.51';"
""")
print("Current record:", out.strip())

rc, out = ssh(client, """
/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker exec netmonitor-db psql -U netmonitor -d netmonitor -t -c \
"UPDATE devices SET hostname = 'Sky Q Mini — Master Bedroom' WHERE ip = '192.168.0.51' RETURNING id, hostname, ip;"
""")
print("Updated:", out.strip())

client.close()
