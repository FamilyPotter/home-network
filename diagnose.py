import os
import paramiko, time

_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS

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

NAS = '/share/CACHEDEV1_DATA/Container/familypotter-network/Monitor'
DOCKER = '/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker'

print('== main.py router imports ==')
print(run('grep -n "router" %s/api/main.py' % NAS))

print('== switch.py on NAS ==')
print(run('ls -la %s/api/routers/switch.py 2>&1' % NAS))

print('== Test import inside container ==')
print(run('%s exec netmonitor-api python -c "from routers import switch; print(switch)" 2>&1' % DOCKER))

print('== Switch endpoint test ==')
print(run('curl -s http://127.0.0.1:8000/switch/ports'))

client.close()
