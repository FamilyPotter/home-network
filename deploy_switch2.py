import os
import paramiko, time

_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS
NAS_BASE = '/share/CACHEDEV1_DATA/Container/netmonitor'
DOCKER = '/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
print('Connected to NAS')

def run(cmd, timeout=60):
    chan = client.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = b''
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready(): out += chan.recv(8192)
        elif chan.exit_status_ready() and not chan.recv_ready(): break
        else: time.sleep(0.05)
    rc = chan.recv_exit_status()
    return rc, out.decode(errors='replace')

def upload(local_path, remote_path):
    with open(local_path, 'rb') as f:
        data = f.read()
    remote_dir = '/'.join(remote_path.split('/')[:-1])
    run('mkdir -p "%s"' % remote_dir)
    chan = client.get_transport().open_session()
    chan.exec_command('cat > "%s"' % remote_path)
    chan.sendall(data)
    chan.shutdown_write()
    chan.recv_exit_status()
    chan.close()
    print('  Uploaded %db -> %s' % (len(data), remote_path))

LOCAL = r'c:\Users\FamilyPotter\OneDrive - Simon Potter Tenant\Cursor\Network Privacy\Monitor'

files = [
    (LOCAL + '/api/routers/switch.py',             NAS_BASE + '/api/routers/switch.py'),
    (LOCAL + '/api/main.py',                        NAS_BASE + '/api/main.py'),
    (LOCAL + '/api/config.py',                      NAS_BASE + '/api/config.py'),
    (LOCAL + '/.env',                               NAS_BASE + '/.env'),
]

for local, remote in files:
    upload(local, remote)

# Also fix permissions
run('chmod 644 %s/api/routers/switch.py' % NAS_BASE)
run('chmod 644 %s/api/main.py' % NAS_BASE)
run('chmod 644 %s/api/config.py' % NAS_BASE)

print('\nAPI files uploaded. Restarting API container...')
rc, out = run('%s restart netmonitor-api' % DOCKER, timeout=60)
print('  restart: rc=%d %s' % (rc, out.strip()))

time.sleep(10)

rc, out = run('curl -s http://127.0.0.1:8000/switch/ports')
print('Switch ports response: %s' % out.strip()[:600])

rc, out = run(DOCKER + ' logs netmonitor-api --tail 20')
print('API logs:\n' + out)

client.close()
print('Done.')
