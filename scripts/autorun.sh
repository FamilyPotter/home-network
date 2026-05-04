sysctl -w net.ipv4.ip_forward=1
sysctl -w net.ipv6.conf.all.forwarding=1
sysctl -w net.ipv6.conf.eth0.accept_ra=2
# Increase NIC ring buffers to reduce drops under load (default 256, max 4096)
ethtool -G eth0 rx 4096 tx 4096 2>/dev/null
ethtool -G eth1 rx 4096 tx 4096 2>/dev/null
# NAT and forwarding
iptables -t nat -C POSTROUTING -s 192.168.0.0/24 -o eth0 -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s 192.168.0.0/24 -o eth0 -j MASQUERADE
iptables -C FORWARD -i eth1 -o eth0 -j ACCEPT 2>/dev/null || iptables -A FORWARD -i eth1 -o eth0 -j ACCEPT
iptables -C FORWARD -i eth0 -o eth1 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || iptables -A FORWARD -i eth0 -o eth1 -m state --state RELATED,ESTABLISHED -j ACCEPT
# Allow DHCP and DNS from LAN before QUFIREWALL blocks them
iptables -C INPUT -i eth1 -p udp --dport 67 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i eth1 -p udp --dport 67 -j ACCEPT
iptables -C INPUT -i eth1 -p udp --dport 53 -j ACCEPT 2>/dev/null || iptables -I INPUT 2 -i eth1 -p udp --dport 53 -j ACCEPT
iptables -C INPUT -i eth1 -p tcp --dport 53 -j ACCEPT 2>/dev/null || iptables -I INPUT 3 -i eth1 -p tcp --dport 53 -j ACCEPT
# Kill QNAP ISC dhcpd - conflicts with AdGuard Home DHCP on port 67
/share/CACHEDEV1_DATA/Container/familypotter-network/scripts/kill-qnap-dhcpd.sh &
