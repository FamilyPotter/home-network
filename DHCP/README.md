# FamilyPotter Home Network Stack

QNAP TS-264 replacing Sky ER110 as home gateway, behind Starlink Gen 3 in bypass mode.

---

## Network Topology

```
Internet
    │
Starlink Gen 3 Router  (Bypass Mode ON — transparent passthrough)
    │  Ethernet — Starlink LAN port
    │
QNAP TS-264 — eth0  MAC 24:5E:BE:6D:25:88  ← WAN (CGNAT IP from Starlink)
    │
    │  [Container Stack]
    │  AdGuard Home  — DHCP + DNS + Ad blocking   :3000
    │  Tailscale     — VPN (CGNAT-compatible)
    │  ddclient      — DDNS familypotter.ddns.net
    │
QNAP TS-264 — eth1  MAC 24:5E:BE:6D:25:89  ← LAN  192.168.0.150/24
    │
Home LAN Switch  (192.168.0.0/24)
    └── All home devices
```

---

## Static IP Reservations (migrated from Sky ER110)

| Hostname | MAC Address | Reserved IP |
|---|---|---|
| SonosFamily | b8:e9:37:9d:19:aa | 192.168.0.97 |
| SonosLounge | b8:e9:37:ab:36:80 | 192.168.0.93 |
| SonosDining | b8:e9:37:ab:32:00 | 192.168.0.95 |
| SonosBed | b8:e9:37:ab:29:b6 | 192.168.0.98 |
| SonosKitchen | 94:9f:3e:72:fd:cc | 192.168.0.80 |
| SonosEddy | 94:9f:3e:1f:fa:ec | 192.168.0.67 |
| SonosGym | b8:e9:37:ab:29:ec | 192.168.0.94 |
| MAINDESK | 30:d0:42:ff:9e:0f | 192.168.0.72 |
| QNAP-NAS-eth0 | 24:5e:be:6d:25:88 | 192.168.0.150 |
| QNAP-NAS-eth1 | 24:5e:be:6d:25:89 | 192.168.0.151 |
| PROMAX | e8:cf:83:8e:0b:69 | 192.168.0.68 |
| czkawka-dedup | 02:eb:43:1c:19:40 | 192.168.0.78 |
| Fingbox | f0:23:b9:eb:12:f9 | 192.168.0.144 |
| Family-iPad | c6:6f:be:a5:27:fd | 192.168.0.70 |

Dynamic pool: `192.168.0.51` – `192.168.0.249`
Gateway handed to all clients: `192.168.0.150`
DNS handed to all clients: `192.168.0.150` (AdGuard Home)

---

## Files in this Repository

```
├── docker-compose.yml          Main container stack
├── .env                        Secrets — DO NOT share or commit
├── adguard/
│   ├── conf/AdGuardHome.yaml  DHCP + DNS + filter configuration
│   └── work/                  AdGuard Home runtime data (auto-created)
├── ddclient/
│   └── ddclient.conf          Dynamic DNS configuration
├── scripts/
│   └── setup-routing.sh       Host-level NAT and IP forwarding
└── tailscale/                 Tailscale state (auto-created, contains keys)
```

---

## Pre-Cutover Setup (do while Sky router is still running)

### Step 1 — QNAP Network Configuration (QTS Control Panel)

SSH into QNAP or use Control Panel → Network & Virtual Switch:

```
eth0  (24:5E:BE:6D:25:88)  →  Set to DHCP client  (will get IP from Starlink after cutover)
eth1  (24:5E:BE:6D:25:89)  →  Set to Static IP: 192.168.0.150 / 255.255.255.0
                               Gateway: leave blank (QNAP IS the gateway)
                               DNS: 127.0.0.1 (localhost — AdGuard Home)
```

While Sky is still active, eth1 will co-exist on the 192.168.0.0/24 segment.

### Step 2 — Disable QNAP's built-in DNS on port 53

QNAP QTS may run a DNS stub resolver that conflicts with AdGuard Home.

Check via SSH:
```sh
netstat -tlnp | grep :53
```

If something is bound to :53, disable it:
- App Center → search "DNS Server" → uninstall if present
- Or: `lsof -i :53` to identify the process, then disable via its QPKG

### Step 3 — Install routing script

Via SSH:
```sh
cp /path/to/scripts/setup-routing.sh /share/CACHEDEV1_DATA/homes/admin/setup-routing.sh
chmod +x /share/CACHEDEV1_DATA/homes/admin/setup-routing.sh

# Add to autorun (runs at every QTS boot)
echo '/share/CACHEDEV1_DATA/homes/admin/setup-routing.sh >> /var/log/routing-setup.log 2>&1' \
  >> /etc/config/autorun.sh

# Run now (pre-cutover test)
sh /share/CACHEDEV1_DATA/homes/admin/setup-routing.sh
```

### Step 4 — Decode DDNS Password

In PowerShell, decode the password saved from the Sky router config:
```powershell
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("ejJlX2pNc2oA"))
```

Paste the result into `ddclient/ddclient.conf` replacing `<YOUR_PASSWORD>`.

### Step 5 — Copy project to QNAP

Copy the entire project folder to QNAP. Recommended path:
```
/share/CACHEDEV1_DATA/Container/familypotter-network/
```

Via Windows Explorer: `\\192.168.0.150\Container\` → create folder `familypotter-network`

### Step 6 — Start containers (while Sky still live)

In Container Station → Applications → Create → Upload docker-compose.yml
OR via QNAP SSH:
```sh
cd /share/CACHEDEV1_DATA/Container/familypotter-network
docker compose up -d
```

### Step 7 — First-run AdGuard Home wizard

Open: `http://192.168.0.150:3000`

Wizard settings:
- Admin interface port: **3000** (pre-set in config)
- DNS listen interface: **192.168.0.150** (LAN only)
- Set admin username and strong password
- Skip the "configure your router's DNS" step — DHCP will handle it

### Step 8 — Test DNS (Sky router still active)

On one test device, manually set DNS to `192.168.0.150`.
Verify:
- `nslookup google.com 192.168.0.150` — resolves correctly
- `nslookup nas.lan 192.168.0.150` — returns 192.168.0.150
- Visit `http://192.168.0.150:3000` → Query Log shows your test lookups

### Step 9 — Configure Tailscale

```sh
# On QNAP SSH (container should already be running):
docker exec tailscale tailscale up \
  --advertise-routes=192.168.0.0/24 \
  --accept-dns=false \
  --hostname=familypotter-nas
```

This outputs an auth URL. Open it on your phone or PC to approve the device.

In the Tailscale admin console (https://login.tailscale.com/admin):
- Find `familypotter-nas` → Edit → enable **Subnet routes** (`192.168.0.0/24`)
- This allows Tailscale clients to reach all home devices when remote

Test from mobile data: connect Tailscale on phone, then SSH or browse to `192.168.0.150`.

Alternatively, paste a pre-auth key in `.env` (`TS_AUTHKEY=tskey-auth-...`) before starting the stack.

---

## Cutover Procedure (planned 10-minute window)

### 1 — Enable Starlink Bypass Mode

On your phone (connect to Starlink WiFi first):
1. Open Starlink app → menu → Settings → Network
2. Scroll to **Bypass Mode** → toggle ON
3. Confirm — Starlink router restarts (~60 seconds)
4. Starlink WiFi will go offline (expected — bypass disables it)

### 2 — Reconnect cables

```
BEFORE:  Sky ER110 → LAN Switch → all devices
                  ↑
              Phone line

AFTER:   Starlink Gen 3 LAN port → QNAP eth0
         QNAP eth1               → LAN Switch → all devices
```

Physical steps:
1. Unplug Sky ER110 WAN and LAN cables
2. Plug Starlink Gen 3 LAN Ethernet → QNAP eth0 (MAC 24:5E:BE:6D:25:88)
3. Confirm QNAP eth1 (MAC 24:5E:BE:6D:25:89) is plugged into home switch

### 3 — Wait for IP assignment (~60 seconds)

QNAP eth0 will request a DHCP lease from Starlink.
Check via SSH:
```sh
ip addr show eth0    # Should show 100.64.x.x or similar CGNAT address
ip route             # Should show default route via eth0
```

### 4 — Verify internet connectivity

```sh
# From QNAP SSH:
curl -s https://1.1.1.1/cdn-cgi/trace | grep ip
ping -c 3 8.8.8.8
```

### 5 — Release/renew DHCP on home devices

Most devices will pick up the new gateway automatically when their lease expires
(24h leases from Sky). To speed this up:

- Windows: `ipconfig /release && ipconfig /renew`
- Mac/Linux: `sudo dhclient -r eth0 && sudo dhclient eth0`
- iOS/Android: toggle WiFi off and on

Verify new gateway: should be `192.168.0.150` (not `192.168.0.1` from Sky).

---

## Verification Checklist

```
[ ] QNAP eth0 has Starlink CGNAT IP (ip addr show eth0)
[ ] Internet works from QNAP (curl https://1.1.1.1)
[ ] Internet works from a laptop/phone through QNAP
[ ] AdGuard Home UI accessible: http://192.168.0.150:3000
[ ] AdGuard query log shows DNS requests from home devices
[ ] All Sonos devices at expected IPs (.67, .80, .93, .94, .95, .97, .98)
[ ] PROMAX at .68, MAINDESK at .72
[ ] Fingbox at .144 — network monitoring should resume automatically
[ ] Family-iPad at .70
[ ] Ad-blocking active: visit doubleclick.net (should be blocked)
[ ] Tailscale: connect from mobile data, browse to 192.168.0.150
[ ] DDNS: ddclient logs show successful update (docker logs ddclient)
```

---

## Day-to-Day Management

| Task | URL / Command |
|---|---|
| AdGuard Home dashboard | `http://192.168.0.150:3000` |
| View DHCP leases | AdGuard Home → DHCP → Active leases |
| Add new static reservation | AdGuard Home → DHCP → Static leases → Add |
| View DNS query log | AdGuard Home → Query Log |
| Add a domain block | AdGuard Home → Filters → Custom rules → `||domain.com^` |
| Tailscale admin | https://login.tailscale.com/admin |
| Container logs | `docker compose logs -f adguardhome` |
| Update all containers | `docker compose pull && docker compose up -d` |
| Routing log | `/var/log/routing-setup.log` on QNAP |

---

## CGNAT and VPN Notes

UK Starlink residential uses **Carrier-Grade NAT (CGNAT)**. Your QNAP eth0 receives
an IP in the `100.64.0.0/10` range — this is not reachable from the public internet.

**What this means:**
- `familypotter.ddns.net` will resolve to a CGNAT IP → inbound connections from internet fail
- Port forwarding from internet into your LAN is not possible on the standard plan
- **Tailscale bypasses this entirely** — it establishes outbound tunnels that CGNAT allows

**To get a public IP:**
- Upgrade to Starlink Priority plan (adds public routable IPv4, ~£20/mo extra)
- Once done, `familypotter.ddns.net` will become reachable, and you can add WireGuard
  port forwarding rules if needed

**IPv6:**
Starlink provides a `/56` IPv6 prefix in bypass mode. IPv6 is publicly routable and does
not use CGNAT. Advanced users can configure WireGuard to listen on the IPv6 address
for inbound connections — contact `[previous chat]` for a guide when ready.

---

## Rollback

If anything goes wrong, plug Sky ER110 back in and disable Starlink Bypass Mode:
1. Reconnect Sky ER110 WAN (phone line) and LAN cables
2. Open Starlink app → Settings → Network → Bypass Mode → toggle OFF
3. Sky ER110 resumes as gateway — all devices recover on next DHCP renewal
