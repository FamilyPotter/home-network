import paramiko, time, sys, os

_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS
NAS_BASE = '/share/CACHEDEV1_DATA/Container/familypotter-network/Monitor'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
print('Connected to NAS')

def ssh_run(cmd, timeout=30):
    chan = client.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = b''
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready():
            out += chan.recv(8192)
        elif chan.exit_status_ready() and not chan.recv_ready():
            break
        else:
            time.sleep(0.05)
    rc = chan.recv_exit_status()
    return rc, out.decode(errors='replace')

def upload(local_path, remote_path):
    with open(local_path, 'rb') as f:
        data = f.read()
    remote_dir = '/'.join(remote_path.split('/')[:-1])
    ssh_run(f'mkdir -p "{remote_dir}"')
    chan = client.get_transport().open_session()
    chan.exec_command(f'cat > "{remote_path}"')
    chan.sendall(data)
    chan.shutdown_write()
    chan.recv_exit_status()
    chan.close()
    print(f'  Uploaded {len(data):,}b -> {remote_path}')

LOCAL = r'c:\Users\FamilyPotter\OneDrive - Simon Potter Tenant\Cursor\Network Privacy\Monitor'

files = [
    (f'{LOCAL}/api/routers/switch.py',                f'{NAS_BASE}/api/routers/switch.py'),
    (f'{LOCAL}/api/main.py',                          f'{NAS_BASE}/api/main.py'),
    (f'{LOCAL}/api/config.py',                        f'{NAS_BASE}/api/config.py'),
    (f'{LOCAL}/web/src/types/index.ts',               f'{NAS_BASE}/web/src/types/index.ts'),
    (f'{LOCAL}/web/src/components/SwitchTab.tsx',     f'{NAS_BASE}/web/src/components/SwitchTab.tsx'),
    (f'{LOCAL}/web/src/App.tsx',                      f'{NAS_BASE}/web/src/App.tsx'),
    (f'{LOCAL}/.env',                                 f'{NAS_BASE}/.env'),
]

for local, remote in files:
    upload(local, remote)

print('\nAll files uploaded. Restarting API container...')

DOCKER = '/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker'
rc, out = ssh_run(f'{DOCKER} restart netmonitor-api', timeout=60)
print(f'  restart API: rc={rc}, {out.strip()}')

time.sleep(8)

# Check health
rc, out = ssh_run('curl -sf http://127.0.0.1:8000/health')
print(f'  API health: {out.strip()}')

rc, out = ssh_run('curl -sf http://127.0.0.1:8000/switch/ports')
print(f'  Switch ports: {out.strip()[:500]}')

client.close()
print('\nDeploy complete.')
