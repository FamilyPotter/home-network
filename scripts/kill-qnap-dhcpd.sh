#!/bin/sh
# Kill QNAP ISC dhcpd - conflicts with AdGuard Home DHCP on port 67
sleep 15
kill $(cat /var/lib/dhcpd/docker0.pid 2>/dev/null) 2>/dev/null
kill $(cat /var/lib/dhcpd/lxcbr0.pid  2>/dev/null) 2>/dev/null
kill $(cat /var/lib/dhcpd/lxdbr0.pid  2>/dev/null) 2>/dev/null