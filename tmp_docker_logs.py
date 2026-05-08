import os

import paramiko

_pw = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _pw:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    "192.168.0.150",
    username="admin",
    password=_pw,
    timeout=15,
    look_for_keys=False,
    allow_agent=False,
)
dbin = "/share/CACHEDEV1_DATA/.qpkg/container-station/usr/bin/docker"
_, o, e = ssh.exec_command(f"{dbin} ps -a --filter name=netmonitor-api --format '{{{{.Status}}}}'")
print("api status:", o.read().decode())
_, o, e = ssh.exec_command(f"{dbin} logs netmonitor-api --tail 40 2>&1")
print(o.read().decode())
ssh.close()
