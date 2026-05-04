# WireGuard VPN — Future Configuration

WireGuard is ready to be activated once a **public IP** is available.

## Why it is not active yet

UK Starlink residential uses CGNAT — the WAN IP (100.64.x.x) is not reachable
from the internet. WireGuard requires inbound UDP connections, which CGNAT blocks.

**Current VPN:** Tailscale (works through CGNAT, see `../tailscale/`)

## How to activate WireGuard when a public IP is available

### Option A — Starlink Priority plan
Upgrade to Starlink Priority in the Starlink app. This adds a public routable IPv4.

### Option B — IPv6 (available now via Starlink bypass mode)
Starlink provides a /56 IPv6 prefix in bypass mode. WireGuard can listen on the
QNAP's IPv6 address, which is publicly routable. Requires IPv6-capable clients.

## When ready — add this service to docker-compose.yml

```yaml
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy:latest
    container_name: wg-easy
    network_mode: host
    volumes:
      - ./VPN/wireguard:/etc/wireguard
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
      - net.ipv4.ip_forward=1
    environment:
      - TZ=Europe/London
      - WG_HOST=familypotter.ddns.net   # or IPv6 address
      - WG_PORT=51820
      - WG_DEFAULT_ADDRESS=10.8.0.x
      - WG_DEFAULT_DNS=192.168.0.150    # AdGuard Home
      - WG_ALLOWED_IPS=0.0.0.0/0,::/0  # route all traffic through VPN
      - PASSWORD_HASH=<bcrypt hash>     # generate: docker run ghcr.io/wg-easy/wg-easy wgpw YOUR_PASSWORD
      - PORT=51821                      # web UI port
    restart: unless-stopped
```

Also add to `scripts/setup-routing.sh`:
```sh
# Allow WireGuard inbound
iptables -C INPUT -i eth0 -p udp --dport 51820 -j ACCEPT 2>/dev/null \
    || iptables -A INPUT -i eth0 -p udp --dport 51820 -j ACCEPT
```

Web UI will be at: `http://192.168.0.150:51821`
