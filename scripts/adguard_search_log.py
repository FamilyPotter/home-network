"""
Search the full AdGuard Home query log history for a specific client IP.

Usage:
    python adguard_search_log.py [client_ip]

If no argument is given, defaults to CLIENT below.
Pages through the entire log via the AdGuard API (handles 90-day history).
"""
import sys
import collections
import httpx

AUTH   = ("admin", "AdGuard123")
BASE   = "http://192.168.0.150:3000/control/querylog"
CLIENT = sys.argv[1] if len(sys.argv) > 1 else "192.168.0.104"

domains  = collections.Counter()
statuses = collections.Counter()
total    = 0
older_than = ""

print(f"Scanning full query log history for client: {CLIENT}")
print("(This may take a minute for a large log…)\n")

while True:
    params: dict = {"limit": 1000, "client": CLIENT}
    if older_than:
        params["older_than"] = older_than

    r = httpx.get(BASE, params=params, auth=AUTH, timeout=30)
    r.raise_for_status()
    entries = r.json().get("data", [])
    if not entries:
        break

    for e in entries:
        q = e.get("question", {})
        domains[q.get("name", "?")] += 1
        statuses[e.get("reason") or e.get("status") or "unknown"] += 1

    total      += len(entries)
    older_than  = entries[-1].get("time", "")
    print(f"  …{total} entries retrieved", end="\r")

print(f"\nTotal queries from {CLIENT}: {total}\n")

if total == 0:
    print("No entries found for that client.")
    sys.exit(0)

print(f"Top 30 domains queried by {CLIENT}:")
print(f"  {'Count':>6}  Domain")
print(f"  {'------':>6}  {'------'}")
for domain, count in domains.most_common(30):
    print(f"  {count:6d}  {domain}")

print(f"\nQuery status breakdown:")
for status, count in statuses.most_common():
    print(f"  {count:6d}  {status}")
