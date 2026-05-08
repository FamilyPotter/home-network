"""Get full login page from NAS container and figure out POST."""
import hashlib
import os
import re
import shlex
import urllib.parse

import paramiko, time

_PASS = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _PASS:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
HOST, PORT, USER, PASS = "192.168.0.150", 22, "admin", _PASS

_SW = os.environ.get("SWITCH_WEB_PASSWORD", "").strip()
if not _SW:
    raise SystemExit("Set SWITCH_WEB_PASSWORD — see scratch_scripts_env.md")

DOCKER = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)


def run(cmd, timeout=20):
    chan = client.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = b""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready():
            out += chan.recv(8192)
        elif chan.exit_status_ready() and not chan.recv_ready():
            break
        else:
            time.sleep(0.05)
    chan.recv_exit_status()
    return out.decode(errors="replace")


# Get the full login page from NAS
print("=== Full login page (8000 chars) ===")
result = run("%s exec netmonitor-api curl -s http://192.168.0.105/ 2>&1" % DOCKER)
print(result[:8000])

print()
print("=== Looking for form action ===")
forms = re.findall(r"<form[^>]*>|action\s*=\s*[\"']?([^\"'>\s]+)", result, re.IGNORECASE)
print(forms[:20])

# Try posting with MD5 password (TL-SG108 pattern)
pw_md5 = hashlib.md5(_SW.encode()).hexdigest()
print("\nMD5 of password:", pw_md5)

post_md5 = urllib.parse.urlencode({"username": "admin", "password": pw_md5})
post_plain = urllib.parse.urlencode({"username": "admin", "password": _SW})

print("\n=== Try POST to /logon.cgi (MD5 body) ===")
cmd = "%s exec netmonitor-api curl -sv -c /tmp/sw_cookies.txt -b /tmp/sw_cookies.txt -X POST -d %s http://192.168.0.105/logon.cgi 2>&1 | head -c 2000" % (
    DOCKER,
    shlex.quote(post_md5),
)
result2 = run(cmd)
print(result2)

print("\n=== Try POST with plain password ===")
cmd2 = "%s exec netmonitor-api curl -sv -c /tmp/sw_cookies2.txt -X POST -d %s http://192.168.0.105/logon.cgi 2>&1 | head -c 2000" % (
    DOCKER,
    shlex.quote(post_plain),
)
result3 = run(cmd2)
print(result3)

client.close()
