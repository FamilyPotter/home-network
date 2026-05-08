"""Try to login to switch from NAS perspective - get full login page."""
import os
import paramiko, time

_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS
DOCKER = '/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

def run(cmd, timeout=15):
    chan = client.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = b''
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready(): out += chan.recv(8192)
        elif chan.exit_status_ready() and not chan.recv_ready(): break
        else: time.sleep(0.05)
    chan.recv_exit_status()
    return out.decode(errors='replace')

# Get the login page from the NAS
print('=== Login page (logon.htm) from NAS ===')
result = run('%s exec netmonitor-api curl -s -c /tmp/sw_cookies.txt -b /tmp/sw_cookies.txt http://192.168.0.105/ 2>&1 | head -c 1000' % DOCKER)
print(result)

print('\n=== Check if Logon.htm exists ===')
result = run('%s exec netmonitor-api curl -sv -c /tmp/sw_cookies.txt http://192.168.0.105/Logon.htm 2>&1 | head -c 2000' % DOCKER)
print(result[:2000])

print('\n=== Cookies ===')
result = run('%s exec netmonitor-api cat /tmp/sw_cookies.txt 2>&1' % DOCKER)
print(result)

client.close()
