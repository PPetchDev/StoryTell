# Registers (or with -Unregister removes) the "Storytell Live" task, which runs the live supervisor
# (<LIVE_HOME>\live-run.mjs) when Windows starts, whether or not anyone logs on, and again every
# 5 minutes so a supervisor that died comes back (a running one makes the new copy exit at once).
# Run it once, from an elevated PowerShell in this checkout, after the first `npm run live:deploy`:
#   powershell -ExecutionPolicy Bypass -File scripts\live-task.ps1
param([switch]$Unregister)
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

$node = (Get-Command node).Source
# LIVE_HOME as scripts/live.mjs reads it from .env.live, so the two can't disagree.
$liveHome = & $node (Join-Path $PSScriptRoot 'live.mjs') home
if ($LASTEXITCODE -ne 0) { throw 'Could not read LIVE_HOME from .env.live.' }
$runner = Join-Path $liveHome 'live-run.mjs'
if (-not (Test-Path $runner)) { throw "No release in $liveHome. Run npm run live:deploy first." }

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$runner`"" -WorkingDirectory $liveHome
$atStartup = New-ScheduledTaskTrigger -AtStartup
# With no duration the repetition never ends.
$every5Minutes = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
# S4U runs as this account with no stored password, logged on or not.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
# No time limit (the default ends a task after 72 hours) and never two copies at once.
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atStartup, $every5Minutes) -Principal $principal -Settings $settings -Force | Out-Null

$limit = (Get-ScheduledTask -TaskName $TaskName).Settings.ExecutionTimeLimit
Write-Host "Registered '$TaskName': node `"$runner`" at startup and every 5 minutes as $env:USERNAME (time limit: $limit; PT0S means none)."
Write-Host 'Start it now with: npm run live:start'
