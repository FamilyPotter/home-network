import os
import posixpath
import stat
import socket
import time
import requests
import paramiko

HOST = "192.168.0.150"
PORT = 22
USER = "admin"
PASSWORD = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not PASSWORD:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
LOCAL_ROOT = r"D:\Network Privacy\Monitor"
REMOTE_ROOT = "/share/Container/netmonitor"
DOCKER_BIN = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"


def ensure_remote_dir(sftp, remote_dir):
    parts = remote_dir.strip("/").split("/")
    current = ""
    for part in parts:
        current += "/" + part
        try:
            sftp.stat(current)
        except IOError:
            sftp.mkdir(current)


def upload_dir(sftp, local_dir, remote_dir):
    ensure_remote_dir(sftp, remote_dir)
    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        remote_path = posixpath.join(remote_dir, item)
        if os.path.isdir(local_path):
            upload_dir(sftp, local_path, remote_path)
        else:
            sftp.put(local_path, remote_path)
            print(f"Uploaded: {local_path} -> {remote_path}")


def run_cmd(ssh, cmd):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out.encode("ascii", "ignore").decode().strip())
    if err:
        print(err.encode("ascii", "ignore").decode().strip())
    print(f"[exit_code={code}]")
    return code, out, err


def wait_http(url, timeout=60):
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(url, timeout=5)
            return r.status_code, r.text[:500]
        except Exception:
            time.sleep(2)
    raise TimeoutError(f"Timeout waiting for {url}")


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=15)
    print("Connected to NAS over SSH.")

    sftp = ssh.open_sftp()
    upload_dir(sftp, LOCAL_ROOT, REMOTE_ROOT)
    sftp.close()
    print("Upload complete.")

    run_cmd(ssh, f"cd {REMOTE_ROOT} && {DOCKER_BIN} compose config")
    run_cmd(ssh, f"cd {REMOTE_ROOT} && {DOCKER_BIN} compose down -v")
    run_cmd(ssh, f"cd {REMOTE_ROOT} && {DOCKER_BIN} compose up -d --build")
    run_cmd(ssh, f"cd {REMOTE_ROOT} && {DOCKER_BIN} compose ps")
    run_cmd(ssh, f"cd {REMOTE_ROOT} && {DOCKER_BIN} compose logs --tail=80 db")
    run_cmd(ssh, f"cd {REMOTE_ROOT} && {DOCKER_BIN} compose logs --tail=120 api")
    run_cmd(ssh, f"cd {REMOTE_ROOT} && {DOCKER_BIN} compose logs --tail=80 web")

    # API health
    code, out, err = run_cmd(ssh, "curl -sS http://127.0.0.1:8000/health")
    # Trigger scan
    run_cmd(ssh, "curl -sS -X POST http://127.0.0.1:8000/scans/trigger")
    time.sleep(5)
    run_cmd(ssh, "curl -sS http://127.0.0.1:8000/stats")

    ssh.close()
    print("SSH verification complete.")

    # External reachability checks from local machine
    for url in [
        "http://192.168.0.150:8080",
        "http://192.168.0.150:8000/health",
        "http://192.168.0.150:25050",
    ]:
        try:
            status, body = wait_http(url, timeout=45)
            print(f"{url} -> HTTP {status}")
        except Exception as exc:
            print(f"{url} -> ERROR: {exc}")


if __name__ == "__main__":
    main()
