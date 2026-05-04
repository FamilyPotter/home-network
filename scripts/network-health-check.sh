#!/bin/sh
# Run every 30m from cron or SSH. Logs anomalies to stdout (and optional file via redirect).
set -eu
D="/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"
LOG_TAG="[net-health $(date -Iseconds)]"

fail=0
echo "$LOG_TAG start"

if ! $D ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -q '^adguardhome Up'; then
  echo "$LOG_TAG ERROR adguardhome not Up"
  fail=1
fi

bad67=$(netstat -ulnp 2>/dev/null | grep ':67 ' | grep -v AdGuardHome | grep -v '^$' || true)
if [ -n "$bad67" ]; then
  echo "$LOG_TAG WARN other listeners on UDP/67:"; echo "$bad67"
  /share/CACHEDEV1_DATA/Container/familypotter-network/scripts/kill-qnap-dhcpd.sh 2>/dev/null || true
fi

if ! netstat -ulnp 2>/dev/null | grep -q '192.168.0.150:53.*AdGuardHome'; then
  echo "$LOG_TAG ERROR AdGuard not bound 192.168.0.150:53"
  fail=1
fi

if ! iptables -C INPUT -i eth1 -p udp --dport 67 -j ACCEPT 2>/dev/null; then
  echo "$LOG_TAG FIX inserting INPUT DHCP accept"
  iptables -I INPUT 1 -i eth1 -p udp --dport 67 -j ACCEPT
fi
if ! iptables -C INPUT -i eth1 -p udp --dport 53 -j ACCEPT 2>/dev/null; then
  iptables -I INPUT 2 -i eth1 -p udp --dport 53 -j ACCEPT
fi
if ! iptables -C INPUT -i eth1 -p tcp --dport 53 -j ACCEPT 2>/dev/null; then
  iptables -I INPUT 3 -i eth1 -p tcp --dport 53 -j ACCEPT
fi

if ! iptables -t nat -C POSTROUTING -s 192.168.0.0/24 -o eth0 -j MASQUERADE 2>/dev/null; then
  echo "$LOG_TAG FIX MASQUERADE"
  iptables -t nat -A POSTROUTING -s 192.168.0.0/24 -o eth0 -j MASQUERADE
fi

if ! ping -c1 -W3 1.1.1.1 >/dev/null 2>&1; then
  echo "$LOG_TAG WARN WAN ping to 1.1.1.1 failed"
  fail=1
fi

echo "$LOG_TAG done (fail=$fail)"
exit "$fail"