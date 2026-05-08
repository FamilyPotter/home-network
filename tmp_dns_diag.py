import os
import sys, paramiko, time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS
DOCKER = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"

def psql(c, sql):
    rc, out = ssh(c, f"""{DOCKER} exec netmonitor-db psql -U netmonitor -d netmonitor -t -c "{sql}" """)
    return out.strip()
def ssh(c, cmd, timeout=20):
    chan = c.get_transport().open_session(); chan.set_combine_stderr(True); chan.exec_command(cmd)
    deadline = time.time() + timeout; out = b""
    while time.time() < deadline:
        if chan.recv_ready(): out += chan.recv(32768)
        elif chan.exit_status_ready() and not chan.recv_ready(): break
        else: time.sleep(0.05)
    return chan.recv_exit_status(), out.decode(errors="replace")

c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

# Update all Smart Plug category devices to Smart Home
r = psql(c, "UPDATE devices SET category='Smart Home' WHERE category='Smart Plug' RETURNING hostname, ip, category;")
print("Updated:\n" + r)

# Verify all TP-Link plug devices are now consistent
print("\nAll TP-Link smart plugs:")
print(psql(c, "SELECT hostname, ip, category, room FROM devices WHERE manufacturer ILIKE '%tp-link%' AND hostname ILIKE '%p1%' ORDER BY hostname;"))

c.close()
