# Restarts the always-on server after a rebuild (npm run serve:update).
$task = Get-ScheduledTask -TaskName Financials -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host ""
  Write-Host "Built. The 'Financials' startup task isn't installed yet, so nothing to restart." -ForegroundColor Yellow
  Write-Host "Install it once from an Administrator PowerShell in this folder:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File tools\install-service.ps1 -KeepAwake"
  exit 0
}
Stop-ScheduledTask -TaskName Financials
Start-ScheduledTask -TaskName Financials
Write-Host "Built and restarted the Financials server."
