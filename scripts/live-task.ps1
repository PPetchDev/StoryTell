# Registers (or with -Unregister removes) the "Storytell Live" startup task, which runs the live
# supervisor (<LIVE_HOME>\app\scripts\live-run.mjs) when Windows starts, whether or not anyone
# logs on. Run it once, from an elevated PowerShell, after the first `npm run live:deploy`.
#   powershell -ExecutionPolicy Bypass -File scripts\live-task.ps1
param(
    [string]$LiveHome,
    [switch]$Unregister
)
$ErrorActionPreference = 'Stop'
$TaskName = 'Storytell Live'

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed the '$TaskName' task."
    return
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run this from an elevated PowerShell (Run as administrator).' }

# LIVE_HOME from .env.live unless given, the same default as scripts/live.mjs.
if (-not $LiveHome) {
    $envFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.live'
    $line = if (Test-Path $envFile) { Select-String -Path $envFile -Pattern '^\s*LIVE_HOME\s*=\s*(.+)$' | Select-Object -First 1 }
    $LiveHome = if ($line) { $line.Matches[0].Groups[1].Value.Trim().Trim('"', "'") } else { 'C:\StorytellLive' }
}
$runner = Join-Path $LiveHome 'app\scripts\live-run.mjs'
if (-not (Test-Path $runner)) { throw "No release at $LiveHome\app. Run npm run live:deploy first." }
$node = (Get-Command node).Source

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$runner`"" -WorkingDirectory (Join-Path $LiveHome 'app')
$trigger = New-ScheduledTaskTrigger -AtStartup
# S4U runs as this account at startup with no stored password; loopback connections still work.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
# No time limit (the default kills a task after 72 hours), restart if it fails, never two at once.
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

$limit = (Get-ScheduledTask -TaskName $TaskName).Settings.ExecutionTimeLimit
Write-Host "Registered '$TaskName': node `"$runner`" at startup as $env:USERNAME (time limit: $limit, PT0S means none)."
Write-Host 'Start it now with: npm run live:start'
