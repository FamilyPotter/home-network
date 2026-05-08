"""
Remove AdGuard query log entries matching a pattern.
Edit FILTER_PATTERN below — supports any substring, e.g. "bbc", "192.168.0.104", "doubleclick".
Case-insensitive match against the raw JSON line (domain name, client IP, answer, etc.).
"""
import os
import paramiko, sys, time

# ── Change this to whatever you want to filter out ──────────────────────────
FILTER_PATTERN = "bbc"
# ────────────────────────────────────────────────────────────────────────────

QUERYLOG = "/share/Container/familypotter-network/AdGuard/work/data/querylog.json"
BACKUP   = QUERYLOG + ".bak"
DOCKER   = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"


def ssh(client, cmd, timeout=30):
    print(f"\n>>> {cmd[:130]}", flush=True)
    chan = client.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = b""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready():
            chunk = chan.recv(8192)
            out += chunk
            sys.stdout.buffer.write(chunk)
            sys.stdout.flush()
        elif chan.exit_status_ready() and not chan.recv_ready():
            break
        else:
            time.sleep(0.1)
    rc = chan.recv_exit_status()
    return rc, out.decode(errors="replace")


c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())

_ssh_pw = os.environ.get("NAS_SSH_PASSWORD", "").strip()
if not _ssh_pw:
    raise SystemExit("Set NAS_SSH_PASSWORD — see scratch_scripts_env.md")
c.connect("192.168.0.150", port=22, username="admin", password=_ssh_pw, timeout=10)
print("Connected.", flush=True)

# ── Step 1: count matching entries ──────────────────────────────────────────
_, out = ssh(c, f'grep -ic "{FILTER_PATTERN}" {QUERYLOG} 2>/dev/null || echo 0')
count = out.strip().splitlines()[-1].strip()
print(f"\nEntries matching '*{FILTER_PATTERN}*': {count}", flush=True)

if count == "0":
    print("Nothing to remove — exiting.")
    c.close()
    sys.exit(0)

# ── Step 2: show a sample of what will be removed ───────────────────────────
print("\nSample matching entries (up to 5 domains + clients):", flush=True)
ssh(c, f'grep -im5 "{FILTER_PATTERN}" {QUERYLOG} | '
       r'sed \'s/.*"QH":"\([^"]*\)".*"client":"\([^"]*\)".*/  domain: \1  client: \2/;'
       r't; s/.*"name":"\([^"]*\)".*"client":"\([^"]*\)".*/  domain: \1  client: \2/\' 2>/dev/null')

# ── Step 3: confirm ──────────────────────────────────────────────────────────
print(f"\nAbout to REMOVE all {count} lines containing '{FILTER_PATTERN}' from:\n  {QUERYLOG}")
answer = input("\nProceed? (yes/no): ").strip().lower()
if answer != "yes":
    print("Aborted — no changes made.")
    c.close()
    sys.exit(0)

# ── Step 4: stop AdGuard ─────────────────────────────────────────────────────
print("\n--- Stopping adguardhome ---", flush=True)
ssh(c, f"{DOCKER} stop adguardhome")

# ── Step 5: backup ───────────────────────────────────────────────────────────
ssh(c, f"cp {QUERYLOG} {BACKUP} && echo 'Backup created at {BACKUP}'")

# ── Step 6: write filtered file ──────────────────────────────────────────────
ssh(c, f'grep -iv "{FILTER_PATTERN}" {QUERYLOG} > /tmp/querylog_filtered.json')

# ── Step 7: verify ───────────────────────────────────────────────────────────
_, orig     = ssh(c, f"wc -l < {QUERYLOG}")
_, new      = ssh(c, f"wc -l < /tmp/querylog_filtered.json")
_, remain   = ssh(c, f'grep -ic "{FILTER_PATTERN}" /tmp/querylog_filtered.json 2>/dev/null || echo 0')

orig_n    = orig.strip().splitlines()[-1].strip()
new_n     = new.strip().splitlines()[-1].strip()
remain_n  = remain.strip().splitlines()[-1].strip()

print(f"\nOriginal lines : {orig_n}")
print(f"Filtered lines : {new_n}  (removed {int(orig_n or 0) - int(new_n or 0)} lines)")
print(f"Remaining hits : {remain_n}  (should be 0)", flush=True)

if remain_n != "0":
    print("\nWARNING: matches still found in filtered file — restoring backup, no changes applied.")
    ssh(c, f"cp {BACKUP} {QUERYLOG} && echo 'Original restored'")
    ssh(c, f"{DOCKER} start adguardhome")
    c.close()
    sys.exit(1)

# ── Step 8: replace log file ─────────────────────────────────────────────────
ssh(c, f"mv /tmp/querylog_filtered.json {QUERYLOG} && echo 'Log file replaced'")

# ── Step 9: restart AdGuard ──────────────────────────────────────────────────
print("\n--- Starting adguardhome ---", flush=True)
ssh(c, f"{DOCKER} start adguardhome")

print(f"\nDone. All entries containing '{FILTER_PATTERN}' have been removed.")
print(f"Backup: {BACKUP}")
print(f"When satisfied, delete it with:\n  ssh admin@192.168.0.150 rm {BACKUP}")

c.close()
