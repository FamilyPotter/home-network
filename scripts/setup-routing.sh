#!/bin/sh
# =============================================================================
# setup-routing.sh — Host-level IP Routing and NAT
# FamilyPotter Home Network — QNAP TS-264
#
# Run this script at QNAP boot to enable the NAS as a network gateway.
#
# Interfaces:
#   eth0 — WAN (connected to Starlink Gen 3 LAN port, CGNAT IP from Starlink)
#   eth1 — LAN (home network, static 192.168.0.150/24)
#
# What this does:
#   1. Enables IPv4 packet forwarding (kernel routing between interfaces)
#   2. Sets up NAT masquerade so LAN devices can reach the internet via eth0
#   3. Sets up stateful forwarding rules (allow LAN→WAN, allow established back)
#
# Installation on QNAP:
#   1. Copy this script to /share/CACHEDEV1_DATA/homes/admin/setup-routing.sh
#   2. chmod +x /share/CACHEDEV1_DATA/homes/admin/setup-routing.sh
#   3. Add to /etc/config/autorun.sh:
#        /share/CACHEDEV1_DATA/homes/admin/setup-routing.sh >> /var/log/routing-setup.log 2>&1
#   Note: /etc/config/autorun.sh is preserved across QTS firmware updates.
#
# To run manually via SSH:
#   sh /share/CACHEDEV1_DATA/homes/admin/setup-routing.sh
# =============================================================================

WAN_IF="eth0"
LAN_IF="eth1"
LAN_SUBNET="192.168.0.0/24"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [routing] $1"
}

log "Starting network gateway configuration..."

# -----------------------------------------------------------------------------
# 1. Enable IPv4 forwarding
# -----------------------------------------------------------------------------
sysctl -w net.ipv4.ip_forward=1
log "IPv4 forwarding enabled"

# Persist across reboots (in case sysctl.conf is writable on this QTS version)
if grep -q "net.ipv4.ip_forward" /etc/sysctl.conf 2>/dev/null; then
    sed -i 's/^net.ipv4.ip_forward.*/net.ipv4.ip_forward = 1/' /etc/sysctl.conf
else
    echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf 2>/dev/null || true
fi

# -----------------------------------------------------------------------------
# 2. NAT — masquerade LAN traffic as it leaves via WAN
#    The -C check prevents duplicate rules on repeated runs
# -----------------------------------------------------------------------------
iptables -t nat -C POSTROUTING -s "$LAN_SUBNET" -o "$WAN_IF" -j MASQUERADE 2>/dev/null \
    || iptables -t nat -A POSTROUTING -s "$LAN_SUBNET" -o "$WAN_IF" -j MASQUERADE
log "NAT MASQUERADE rule set: $LAN_SUBNET → $WAN_IF"

# -----------------------------------------------------------------------------
# 3. Forwarding rules — stateful, LAN↔WAN
# -----------------------------------------------------------------------------

# Allow new connections from LAN to WAN
iptables -C FORWARD -i "$LAN_IF" -o "$WAN_IF" -j ACCEPT 2>/dev/null \
    || iptables -A FORWARD -i "$LAN_IF" -o "$WAN_IF" -j ACCEPT

# Allow established/related return traffic from WAN back to LAN
iptables -C FORWARD -i "$WAN_IF" -o "$LAN_IF" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
    || iptables -A FORWARD -i "$WAN_IF" -o "$LAN_IF" -m state --state RELATED,ESTABLISHED -j ACCEPT

# Allow intra-LAN forwarding (devices communicating through the NAS switch port)
iptables -C FORWARD -i "$LAN_IF" -o "$LAN_IF" -j ACCEPT 2>/dev/null \
    || iptables -A FORWARD -i "$LAN_IF" -o "$LAN_IF" -j ACCEPT

log "Forwarding rules set: LAN($LAN_IF) ↔ WAN($WAN_IF)"

# -----------------------------------------------------------------------------
# 4. IPv6 forwarding (for Starlink /56 prefix delegation pass-through)
# -----------------------------------------------------------------------------
sysctl -w net.ipv6.conf.all.forwarding=1
sysctl -w net.ipv6.conf."$WAN_IF".accept_ra=2   # Accept RA even with forwarding on
log "IPv6 forwarding enabled"

# -----------------------------------------------------------------------------
# 5. Optional: Drop unsolicited inbound traffic on WAN
#    (basic WAN firewall — block new connections initiated from Starlink/internet)
# -----------------------------------------------------------------------------
iptables -C INPUT -i "$WAN_IF" -m state --state NEW -j DROP 2>/dev/null \
    || iptables -A INPUT -i "$WAN_IF" -m state --state NEW -j DROP

# But allow established inbound (responses to our outbound requests)
iptables -C INPUT -i "$WAN_IF" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -i "$WAN_IF" -m state --state RELATED,ESTABLISHED -j ACCEPT

log "WAN firewall: new inbound blocked, established allowed"

log "Gateway configuration complete."
