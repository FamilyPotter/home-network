# =============================================================================
# deploy-to-qnap.ps1
# Copies the network stack to the QNAP NAS over SMB, then starts containers.
#
# Usage (run from d:\Network Privacy\):
#   .\scripts\deploy-to-qnap.ps1
#
# Requirements:
#   - QNAP reachable at 192.168.0.150 (Sky router still serving DHCP)
#   - QNAP admin credentials ready
#   - PowerShell 5.1+ (built into Windows 10/11)
# =============================================================================

param(
    [string]$NasIP        = "192.168.0.150",
    [string]$NasShare     = "Container",
    [string]$DestFolder   = "familypotter-network",
    [string]$NasUser      = "admin"
)

$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $PSScriptRoot   # d:\Network Privacy\

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " FamilyPotter Network Stack — QNAP Deployment" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Source : $Source"
Write-Host "Target : \\$NasIP\$NasShare\$DestFolder"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Mount QNAP share
# ---------------------------------------------------------------------------
$UncPath = "\\$NasIP\$NasShare"
$DriveLetter = "Q:"

if (Test-Path $DriveLetter) {
    Write-Host "Disconnecting existing $DriveLetter mapping..." -ForegroundColor Yellow
    net use $DriveLetter /delete /yes | Out-Null
}

$Cred = Get-Credential -UserName $NasUser -Message "Enter QNAP $NasUser password"
net use $DriveLetter $UncPath /user:$NasUser $Cred.GetNetworkCredential().Password | Out-Null

if (-not (Test-Path $DriveLetter)) {
    Write-Error "Failed to map $DriveLetter to $UncPath. Check NAS IP and credentials."
    exit 1
}
Write-Host "Mapped $DriveLetter → $UncPath" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2. Create destination folder on QNAP
# ---------------------------------------------------------------------------
$Dest = "$DriveLetter\$DestFolder"
if (-not (Test-Path $Dest)) {
    New-Item -ItemType Directory -Path $Dest | Out-Null
    Write-Host "Created $Dest" -ForegroundColor Green
} else {
    Write-Host "Destination exists: $Dest" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 3. Copy files — exclude runtime/secret paths
# ---------------------------------------------------------------------------
$Excludes = @(
    ".git",
    ".vs",
    "*.slnx",
    "AdGuard\work",     # Runtime — created by AdGuard Home
    "VPN\tailscale",    # Contains private keys — transfer separately if needed
    "DHCP"              # Legacy folder superseded by this structure
)

Write-Host ""
Write-Host "Copying files..." -ForegroundColor Cyan

Get-ChildItem -Path $Source -Recurse -Force | ForEach-Object {
    $RelPath = $_.FullName.Substring($Source.Length).TrimStart("\")

    # Skip excluded paths
    foreach ($ex in $Excludes) {
        if ($RelPath -like "$ex*") { return }
    }

    $TargetPath = Join-Path $Dest $RelPath

    if ($_.PSIsContainer) {
        if (-not (Test-Path $TargetPath)) {
            New-Item -ItemType Directory -Path $TargetPath | Out-Null
        }
    } else {
        $TargetDir = Split-Path $TargetPath -Parent
        if (-not (Test-Path $TargetDir)) {
            New-Item -ItemType Directory -Path $TargetDir | Out-Null
        }
        Copy-Item -Path $_.FullName -Destination $TargetPath -Force
        Write-Host "  Copied: $RelPath" -ForegroundColor Gray
    }
}

# Ensure AdGuard work directory exists on NAS (empty, created by container)
$WorkDir = "$Dest\AdGuard\work"
if (-not (Test-Path $WorkDir)) {
    New-Item -ItemType Directory -Path $WorkDir | Out-Null
    Write-Host "  Created: AdGuard\work (empty — written by container)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "All files copied successfully." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 4. Disconnect share
# ---------------------------------------------------------------------------
net use $DriveLetter /delete /yes | Out-Null
Write-Host "Unmapped $DriveLetter"

# ---------------------------------------------------------------------------
# 5. Next steps reminder
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " NEXT STEPS ON QNAP (via SSH or Container Station)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " 1. SSH into QNAP:" -ForegroundColor White
Write-Host "    ssh admin@$NasIP" -ForegroundColor Yellow
Write-Host ""
Write-Host " 2. Install routing script:" -ForegroundColor White
Write-Host "    chmod +x /share/CACHEDEV1_DATA/Container/$DestFolder/scripts/setup-routing.sh" -ForegroundColor Yellow
Write-Host "    echo '/share/CACHEDEV1_DATA/Container/$DestFolder/scripts/setup-routing.sh >> /var/log/routing-setup.log 2>&1' >> /etc/config/autorun.sh" -ForegroundColor Yellow
Write-Host "    sh /share/CACHEDEV1_DATA/Container/$DestFolder/scripts/setup-routing.sh" -ForegroundColor Yellow
Write-Host ""
Write-Host " 3. Start containers:" -ForegroundColor White
Write-Host "    cd /share/CACHEDEV1_DATA/Container/$DestFolder" -ForegroundColor Yellow
Write-Host "    docker compose up -d" -ForegroundColor Yellow
Write-Host ""
Write-Host " 4. Watch startup:" -ForegroundColor White
Write-Host "    docker compose logs -f" -ForegroundColor Yellow
Write-Host ""
Write-Host " 5. AdGuard first-run wizard:" -ForegroundColor White
Write-Host "    http://$NasIP`:3000  (admin interface)" -ForegroundColor Yellow
Write-Host ""
Write-Host " 6. Tailscale auth (if no TS_AUTHKEY set in .env):" -ForegroundColor White
Write-Host "    docker logs tailscale" -ForegroundColor Yellow
Write-Host "    (open the auth URL shown in logs on your phone/PC)" -ForegroundColor Yellow
Write-Host ""
