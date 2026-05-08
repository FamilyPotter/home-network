# Scratch / diagnose scripts — credentials

These one-off scripts read secrets from the environment (never commit real passwords).

| Variable | Used for |
|----------|----------|
| `NAS_SSH_PASSWORD` | QNAP admin SSH password (`ssh admin@NAS`) |
| `SWITCH_WEB_PASSWORD` | TP-Link Easy Smart switch web UI (`admin` account) |

**PowerShell (current session):**

```powershell
$env:NAS_SSH_PASSWORD = "your-qnap-password"
$env:SWITCH_WEB_PASSWORD = "your-switch-password"
python .\diagnose4.py
```

**Rotate credentials after any accidental exposure** (e.g. if they were pushed to a remote).
