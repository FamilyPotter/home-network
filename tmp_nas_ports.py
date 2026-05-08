import os

import paramiko

HOST = "192.168.0.150"
PORT = 22
USER = "admin"
PASSWORD = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not PASSWORD:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
DOCKER_BIN = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=10)
for cmd in [
    f'{DOCKER_BIN} ps --format "table {{{{.Names}}}}\\t{{{{.Image}}}}\\t{{{{.Ports}}}}"',
    "curl -I -sS http://127.0.0.1:8000/health",
    "curl -I -sS http://127.0.0.1:8080",
    "curl -I -sS http://127.0.0.1:25050",
]:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode(errors="ignore"))
    print(stderr.read().decode(errors="ignore"))
ssh.close()
