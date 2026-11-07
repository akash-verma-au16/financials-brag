# Installs the Financials server as a Windows scheduled task that:
#   - starts at boot (before anyone logs in) and again at your logon (if it isn't running),
#   - runs as you, without storing your password (S4U: local files only, which is all it needs),
#   - restarts every minute if it ever stops, and never times out.
# Also (optional, -KeepAwake) stops the machine sleeping while plugged in.
#
# Run once from an *Administrator* PowerShell in the repo folder:
#   powershell -ExecutionPolicy Bypass -File tools\install-service.ps1 -KeepAwake
# Remove:  Unregister-ScheduledTask -TaskName Financials -Confirm:$false

param([switch]$KeepAwake)
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
# Full account name (e.g. PC\name): task triggers reject a bare user name.
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path (Join-Path $repo "dist\index.html"))) {
  Write-Host "Building the app first..."
  Push-Location $repo; npm run build; Pop-Location
}

$action = New-ScheduledTaskAction -Execute $node -Argument "tools\server.ts" -WorkingDirectory $repo
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn -User $me)
)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 9999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$common = @{ TaskName = "Financials"; Description = "Financials dashboard server (tools/server.ts), published by Tailscale Funnel"; Action = $action; Settings = $settings; Force = $true }
try {
  # Before login, as you, no stored password.
  $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType S4U -RunLevel Limited
  Register-ScheduledTask @common -Trigger $triggers -Principal $principal -ErrorAction Stop | Out-Null
  Write-Host "Starts at boot (before login) and at logon."
} catch {
  # Some accounts can't use that mode: fall back to starting when you log in.
  Write-Host "Couldn't register the before-login mode ($($_.Exception.Message.Trim())); using start-at-logon instead." -ForegroundColor Yellow
  $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask @common -Trigger $triggers[1] -Principal $principal -ErrorAction Stop | Out-Null
  Write-Host "Starts when you log in (enable automatic sign-in if the machine restarts unattended)."
}
Start-ScheduledTask -TaskName "Financials"
Write-Host "Installed and started the 'Financials' task."

if ($KeepAwake) {
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  Write-Host "Sleep and hibernate disabled while plugged in."
}
