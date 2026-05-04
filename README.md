# FamilyPotter Home Network Stack

> **Status: LIVE** — Cutover to Starlink + QNAP gateway complete 2026-05-04.

QNAP TS-264 running as home gateway behind Starlink Gen 3 (bypass mode). All DHCP, DNS, ad-blocking, and VPN services run as Docker containers in QNAP Container Station.

**See [NETWORK-ARCHITECTURE.md](NETWORK-ARCHITECTURE.md) for the full architecture guide, diagrams, and operations reference.**

---

## Folder Structure

```
d:\Network Privacy\
├── docker-compose.yml          Main container stack definition
├── .env                        Secrets — DO NOT share or commit to git
├── .gitignore                  Excludes secrets and runtime data from git
├── README.md                   This file
│
├── AdGuard\                    DNS + DHCP + Ad/Tracker blocking
│   ├── conf\
│   │   └── AdGuardHome.yaml   Full config: DHCP pool, 14 static reservations, DNS, filters
│   └── work\                  Runtime data (written by container — do not edit)
│
├── VPN\
│   ├── tailscale\             Tailscale state (private keys — do not share)
│   └── wireguard\
│       └── README-wireguard.md  Activation guide for when public IP is available
│
├── DDNS\
│   └── ddclient.conf          Keeps familypotter.ddns.net updated
│
└── scripts\
    ├── setup-routing.sh       Host-level IP forwarding + iptables NAT (runs at QNAP boot)
    └── deploy-to-qnap.ps1    Windows PowerShell: copies stack to QNAP over network share
```

---

## Network Topology

```
Internet
    │
Starlink Gen 3 Router  ← Bypass Mode ON (transparent passthrough, WiFi disabled)
    │  Ethernet
    │
QNAP TS-264
    ├── eth0  MAC 24:5E:BE:6D:25:88  ← WAN  (DHCP from Starlink, CGNAT 100.64.x.x)
    │
    │   ┌─────────────────────────────────────────────────┐
    │   │  Container Stack                                │
    │   │  AdGuard Home  DHCP + DNS + Blocking  :3000    │
    │   │  Tailscale     VPN (CGNAT-compatible)           │
    │   │  ddclient      DDNS familypotter.ddns.net       │
    │   └─────────────────────────────────────────────────┘
    │
    └── eth1  MAC 24:5E:BE:6D:25:89  ← LAN  192.168.0.150/24 (home gateway)
          │
     Home LAN Switch
          ├── PROMAX          192.168.0.68
          ├── MAINDESK        192.168.0.72
          ├── Fingbox         192.168.0.144
          ├── Family-iPad     192.168.0.70
          ├── SonosFamily     192.168.0.97
          ├── SonosLounge     192.168.0.93
          ├── SonosDining     192.168.0.95
          ├── SonosBed        192.168.0.98
          ├── SonosKitchen    192.168.0.80
          ├── SonosEddy       192.168.0.67
          ├── SonosGym        192.168.0.94
          ├── czkawka-dedup   192.168.0.78
          └── Dynamic pool    192.168.0.51 – 192.168.0.249
```

---

## Static IP Reservations (migrated exactly from Sky ER110)

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

---

## Deployment — Step by Step

### Before you start: QNAP Network Configuration (QTS)

In QNAP Control Panel → Network & Virtual Switch:

| Interface | MAC | Setting |
|---|---|---|
| eth0 | 24:5E:BE:6D:25:88 | DHCP client (will get Starlink IP after cutover) |
| eth1 | 24:5E:BE:6D:25:89 | Static: `192.168.0.150 / 255.255.255.0`, no gateway |

Set QNAP's own DNS to `127.0.0.1` (AdGuard Home, running locally).

### Check port 53 is free on QNAP

```sh
# Via QNAP SSH:
netstat -tlnp | grep :53
```

If anything is bound: App Center → uninstall "DNS Server" QPKG.
If a system process holds it: `lsof -i :53` to identify, then disable via its QPKG.

---

### Option A — Deploy via PowerShell (recommended)

From a Windows PC on the same network as the QNAP:

```powershell
cd "d:\Network Privacy"
.\scripts\deploy-to-qnap.ps1
```

The script will:
1. Prompt for your QNAP admin password
2. Map a temporary network drive to `\\192.168.0.150\Container`
3. Copy all files to `Container\familypotter-network\`
4. Print the SSH commands to run on the QNAP next

---

### Option B — Manual copy via Windows Explorer

1. Open `\\192.168.0.150\Container` in Explorer
2. Create folder `familypotter-network`
3. Copy the entire contents of `d:\Network Privacy\` into it
   (skip `.vs\` and `DHCP\` — these are not needed on the NAS)

---

### On QNAP — install routing script

SSH into QNAP (`ssh admin@192.168.0.150`), then:

```sh
BASE=/share/CACHEDEV1_DATA/Container/familypotter-network

# Make executable
chmod +x $BASE/scripts/setup-routing.sh

# Register with autorun so it survives reboots
echo "$BASE/scripts/setup-routing.sh >> /var/log/routing-setup.log 2>&1" \
  >> /etc/config/autorun.sh

# Run immediately
sh $BASE/scripts/setup-routing.sh

# Confirm IP forwarding is on
sysctl net.ipv4.ip_forward
# Expected: net.ipv4.ip_forward = 1
```

---

### On QNAP — start containers

```sh
cd /share/CACHEDEV1_DATA/Container/familypotter-network
docker compose up -d
docker compose ps        # All should show "running"
docker compose logs -f   # Watch startup (Ctrl+C to stop tailing)
```

---

### AdGuard Home — first-run wizard

Open `http://192.168.0.150:3000` in a browser.

| Wizard step | Value |
|---|---|
| Admin web interface port | **3000** (already set in config) |
| DNS listen interface | `192.168.0.150` |
| Username | choose your own |
| Password | choose a strong password |

Skip the "configure your router DNS" step — DHCP will distribute it automatically.

---

### Tailscale — authenticate

If `TS_AUTHKEY` is blank in `.env`, check logs for the auth URL:

```sh
docker logs tailscale
# Opens: https://login.tailscale.com/a/xxxxxxxxx
```

Open that URL on your phone or PC to approve the device.

In Tailscale admin console (https://login.tailscale.com/admin):
- Find `familypotter-nas` → **Edit** → enable **Subnet routes** for `192.168.0.0/24`

Test from mobile data: connect Tailscale on phone, then browse to `http://192.168.0.150:3000`.

---

## Cutover — Sky ER110 → Starlink + QNAP (10-minute window)

### 1. Enable Starlink Bypass Mode

On your phone (connect to Starlink WiFi first):
- Starlink app → menu → **Settings** → **Network** → **Bypass Mode** → toggle **ON**
- Confirm — router restarts (~60 seconds). Starlink WiFi goes offline. This is expected.

### 2. Recable

```
OLD:  Phone line → Sky ER110 → home LAN switch → all devices

NEW:  Starlink dish → Starlink Gen 3 (bypass)
                           │ Ethernet
                      QNAP eth0 (WAN)
                      QNAP eth1 → home LAN switch → all devices
```

Steps:
1. Unplug Sky ER110
2. Plug Starlink Gen 3 LAN port → QNAP eth0 (`24:5E:BE:6D:25:88`)
3. Confirm QNAP eth1 (`24:5E:BE:6D:25:89`) is in the home switch

### 3. Confirm QNAP gets a WAN IP

```sh
# SSH into QNAP:
ip addr show eth0
# Look for: inet 100.64.x.x/xx   (Starlink CGNAT range)

ip route
# Look for: default via <starlink-gateway> dev eth0
```

### 4. Confirm internet from QNAP

```sh
curl -s https://1.1.1.1/cdn-cgi/trace | grep ip
ping -c 3 8.8.8.8
```

### 5. Force DHCP renewal on home devices

- **Windows:** `ipconfig /release && ipconfig /renew`
- **Mac:** System Settings → Network → interface → Renew DHCP
- **iOS/Android:** Toggle WiFi off/on
- **Other:** Unplug and replug Ethernet

New default gateway should be `192.168.0.150` (not `192.168.0.1`).

---

## Verification Checklist

```
[ ] QNAP eth0 shows 100.64.x.x Starlink CGNAT IP
[ ] Internet works from QNAP (curl https://1.1.1.1)
[ ] Internet works from laptop/phone through QNAP
[ ] AdGuard Home UI: http://192.168.0.150:3000
[ ] Query Log shows DNS requests from home devices
[ ] All Sonos at expected IPs (.67 .80 .93 .94 .95 .97 .98)
[ ] PROMAX .68, MAINDESK .72, Fingbox .144, Family-iPad .70
[ ] Ad blocking: visit doubleclick.net — blocked
[ ] Tailscale: connect on mobile data → reach 192.168.0.150
[ ] DDNS: docker logs ddclient shows successful update
```

---

## Day-to-Day Management

| Task | How |
|---|---|
| AdGuard Home dashboard | http://192.168.0.150:3000 |
| Active DHCP leases | AdGuard → DHCP → Active leases |
| Add static reservation | AdGuard → DHCP → Static leases → Add |
| DNS query log | AdGuard → Query Log |
| Block a domain | AdGuard → Filters → Custom rules → `\|\|domain.com^` |
| Tailscale admin | https://login.tailscale.com/admin |
| Update all containers | `docker compose pull && docker compose up -d` |
| Container logs | `docker compose logs -f [adguardhome\|tailscale\|ddclient]` |
| Routing log | `/var/log/routing-setup.log` on QNAP SSH |
| Local hostname lookup | `nas.lan`, `promax.lan`, `maindesk.lan`, etc. |

---

## CGNAT & VPN Notes

| Feature | Status | Notes |
|---|---|---|
| Remote access VPN | **Working** | Tailscale — no port forwarding needed |
| Public IP / port forward | Not available | Starlink residential = CGNAT |
| WireGuard (inbound) | Future | See `VPN/wireguard/README-wireguard.md` |
| IPv6 | Available | Starlink provides /56 via bypass mode |
| DDNS (familypotter.ddns.net) | Maintained | Will become useful when Priority plan activated |

---

## Rollback to Sky ER110

If anything goes wrong:
1. Replug Sky ER110 WAN (phone line) and LAN cables
2. Starlink app → Settings → Network → Bypass Mode → **OFF**
3. Sky ER110 resumes as gateway — all devices recover on next DHCP renewal
