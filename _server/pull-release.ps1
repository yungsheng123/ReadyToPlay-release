<#
  Brings the IIS site to the latest release that publish-release.ps1 pushed. Normally nobody runs this by hand: install-server.ps1 sets
  it up as a scheduled task that calls it every minute with -Auto (it does nothing unless there is something new).

  By hand, in an elevated PowerShell:
    .\pull-release.ps1 -Config C:\ProgramData\ReadyToPlay-deploy\config.json            (the settings install-server.ps1 saved)
    .\pull-release.ps1 -SiteDir C:\inetpub\readytoplay -ReleaseDir C:\src\ReadyToPlay-release -AppPool ReadyToPlay -Url http://localhost

  What it does: pulls the release, backs up the live site, shows a "back soon" page while the files are copied (keeping secrets.config,
  App_Data and logs), recycles the app pool and checks /api/ping; if the site does not answer (or the copy fails part-way) the backup is put
  back. Nothing here touches the database (see DEPLOY.md for what a first release since 22 Oct 2026 changes).

  -Auto              for the scheduled task: quiet and instant when there is nothing new; one run at a time; writes deploy.log
  -Ref v2026.10.22   go to that tag (to go back to an earlier release; mind the note about the database)
  -SkipPull          use the release repository as it is now
#>
param(
    [string]$Config = '',
    [string]$SiteDir = '',
    [string]$ReleaseDir = 'C:\src\ReadyToPlay-release',
    [string]$Ref = 'master',
    [string]$AppPool = '',
    [string]$Url = 'http://localhost',
    [string]$BackupDir = '',
    [int]$KeepBackups = 5,
    [switch]$Auto,
    [switch]$SkipPull
)
$ErrorActionPreference = 'Stop'
if ($Config) {
    if (-not (Test-Path $Config)) { Write-Host "FAILED: settings file $Config not found." -ForegroundColor Red; exit 1 }
    $c = Get-Content $Config -Raw | ConvertFrom-Json
    foreach ($name in 'SiteDir', 'ReleaseDir', 'AppPool', 'Url', 'BackupDir', 'Ref') {
        if ($c.PSObject.Properties.Name -contains $name -and $c.$name -and -not $PSBoundParameters.ContainsKey($name)) { Set-Variable -Name $name -Value $c.$name }
    }
}
if (-not $SiteDir) { Write-Host 'FAILED: -SiteDir (or -Config) is needed.' -ForegroundColor Red; exit 1 }
if (-not $BackupDir) { $BackupDir = Join-Path (Split-Path $SiteDir -Parent) 'readytoplay-backups' }
New-Item -ItemType Directory -Force $BackupDir | Out-Null

function Step($text) { Write-Host ("`n== " + $text) -ForegroundColor Cyan }
function Fail($text) { Write-Host ("FAILED: " + $text) -ForegroundColor Red; exit 1 }
function GitRun { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & git.exe @args 2>&1 | ForEach-Object { Write-Host "$_" } } finally { $ErrorActionPreference = $old } }   # (git writes progress to stderr: that is not an error; its exit code is checked)
function Robo($from, $to, $extra) {
    & robocopy $from $to /MIR /NFL /NDL /NJH /NJS /NP /R:5 /W:3 @extra | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE) copying $from to $to" }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git is not installed (or not on the PATH).' }
if (-not (Test-Path (Join-Path $ReleaseDir '.git'))) { Fail "$ReleaseDir is not a clone of the release repository (git clone it there first)." }

# ---- -Auto: is there anything new? (one cheap fetch; nothing else happens when there is not)
$lockFile = Join-Path $BackupDir 'deploy.lock'
if ($Auto) {
    $ErrorActionPreference = 'Continue'
    & git.exe -C $ReleaseDir fetch --tags --prune origin 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    $local = (& git.exe -C $ReleaseDir rev-parse HEAD 2>$null)
    $remote = (& git.exe -C $ReleaseDir rev-parse "origin/$Ref" 2>$null)
    if (-not $remote -or $local -eq $remote) { exit 0 }                                   # nothing new (or the remote cannot be reached right now)
    if ((Test-Path $lockFile) -and ((Get-Date) - (Get-Item $lockFile).LastWriteTime).TotalMinutes -lt 20) { exit 0 }   # another run is busy
    Set-Content $lockFile (Get-Date -Format o)
    Start-Transcript -Path (Join-Path $BackupDir 'deploy.log') -Append | Out-Null
}
try {
    if (-not (Test-Path $SiteDir)) { Fail "The site folder $SiteDir does not exist." }
    if (-not (Test-Path (Join-Path $SiteDir 'secrets.config'))) { Fail "secrets.config is missing in $SiteDir. Copy AutoBot_Web\secrets.config.example there, fill in the values, and run again." }

    Step "Getting $Ref from git"
    if (-not $SkipPull) {
        if (-not $Auto) { GitRun -C $ReleaseDir fetch --tags --prune origin; if ($LASTEXITCODE -ne 0) { Fail 'git fetch failed.' } }   # (-Auto fetched above)
        & git.exe -C $ReleaseDir rev-parse --verify --quiet "refs/remotes/origin/$Ref" | Out-Null
        if ($LASTEXITCODE -eq 0) {
            GitRun -C $ReleaseDir checkout --quiet $Ref
            GitRun -C $ReleaseDir reset --hard --quiet "origin/$Ref"   # the clone is only a copy of what was released: always exactly that
            if ($LASTEXITCODE -ne 0) { Fail "Could not move to $Ref." }
        } else {
            GitRun -C $ReleaseDir checkout --quiet $Ref
            if ($LASTEXITCODE -ne 0) { Fail "Unknown release: $Ref" }
        }
    }
    $commit = (& git.exe -C $ReleaseDir rev-parse --short HEAD).Trim()
    $subject = (& git.exe -C $ReleaseDir log -1 --format=%s).Trim()
    Write-Host "Release: $commit  $subject"
    foreach ($need in 'bin\AutoBot_Web.dll', 'bin\AutoBot.dll', 'fees.html', 'Web.config') {
        if (-not (Test-Path (Join-Path $ReleaseDir $need))) { Fail "$need is missing in the release: it is not a published site." }
    }
    if ((Get-Content (Join-Path $ReleaseDir 'Web.config') -Raw) -notmatch 'appSettings file="secrets.config"') { Fail 'The release Web.config does not read secrets.config: not a release made by publish-release.ps1.' }

    Step 'Backing up the live site'
    $backup = Join-Path $BackupDir (Get-Date -Format 'yyyyMMdd-HHmmss')
    Robo $SiteDir $backup @('/XD', 'logs')
    Get-ChildItem $BackupDir -Directory | Sort-Object Name -Descending | Select-Object -Skip $KeepBackups | ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
    Write-Host "Backup: $backup"

    Step 'Copying the release (the site shows a short "back soon" page meanwhile)'
    $offline = Join-Path $SiteDir 'app_offline.htm'
    # The page players see meanwhile travels with the release (_server\app_offline.htm: one self-contained file, nothing else can load while the site is off);
    # a plain one is used when the release has none.
    $offlinePage = Join-Path $ReleaseDir '_server\app_offline.htm'
    if (Test-Path $offlinePage) { Copy-Item $offlinePage $offline -Force; Write-Host 'Showing the update page.' }
    else { Set-Content $offline '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Back soon</title><p style="font:16px sans-serif;margin:3em">Updating. Back in a minute.</p>' }
    Start-Sleep -Seconds 4   # IIS unloads the application when it sees app_offline.htm; the files are free a moment later
    try {
        Robo $ReleaseDir $SiteDir @('/XF', 'secrets.config', 'app_offline.htm', '.gitignore', '.gitattributes', '/XD', '.git', '_server', 'App_Data', 'logs')
    } catch {
        Write-Host 'The copy failed part-way: putting the backup back.' -ForegroundColor Red
        try { Robo $backup $SiteDir @('/XF', 'secrets.config', '/XD', 'App_Data', 'logs') } catch { Write-Host "Restoring also failed: copy $backup into $SiteDir by hand." -ForegroundColor Red }
        Remove-Item $offline -Force -ErrorAction SilentlyContinue
        Fail $_.Exception.Message
    }
    Remove-Item $offline -Force
    if ($AppPool) {
        Import-Module WebAdministration
        if (Test-Path "IIS:\AppPools\$AppPool") { Restart-WebAppPool $AppPool; Write-Host "Recycled the app pool $AppPool." } else { Write-Host "App pool $AppPool not found: recycle it by hand." -ForegroundColor Yellow }
    }

    Step "Checking $Url/api/ping"
    $up = $false
    for ($i = 1; $i -le 30 -and -not $up; $i++) {
        try { if ((Invoke-WebRequest "$Url/api/ping" -UseBasicParsing -TimeoutSec 20).StatusCode -eq 200) { $up = $true } } catch { Start-Sleep -Seconds 2 }
    }
    Add-Content (Join-Path $BackupDir 'deploy-history.log') ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "  $commit  $subject  " + $(if ($up) { 'ok' } else { 'FAILED, backup restored' }))
    if (-not $up) {
        Write-Host 'The site did not answer: putting the backup back.' -ForegroundColor Red
        Robo $backup $SiteDir @('/XF', 'secrets.config', '/XD', 'App_Data', 'logs')
        if ($AppPool) { Restart-WebAppPool $AppPool }
        Fail "The new release did not start. The previous files are back. Look at the site's log folder for the reason."
    }

    # this script travels with the release (in _server): the copy that the scheduled task runs is refreshed from it, for the next run
    $mine = Join-Path $ReleaseDir '_server\pull-release.ps1'
    if ($PSCommandPath -and (Test-Path $mine) -and ($PSCommandPath -ne (Resolve-Path $mine).Path)) {
        try { Copy-Item $mine $PSCommandPath -Force } catch { }
    }
    Write-Host "`nSite is at release $commit." -ForegroundColor Green
} finally {
    if ($Auto) { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue; try { Stop-Transcript | Out-Null } catch { } }
}
exit 0
