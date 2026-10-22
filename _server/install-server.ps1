<#
  Run ONCE on the Windows/IIS server, in an elevated PowerShell. After this, every release you publish on your PC goes live on the server
  by itself, about a minute later: nothing else to run on the server, ever.

    powershell -ExecutionPolicy Bypass -File .\install-server.ps1 -Token <read-only GitHub token>

  What it does:
   1. clones the release repository (ReadyToPlay-release) to C:\src\ReadyToPlay-release, using the token (a fine-grained token with
      read-only "Contents" access to that one repository: GitHub, Settings, Developer settings, Fine-grained tokens)
   2. finds your IIS site (or use -SiteDir / -AppPool / -Url), and if the site has no secrets.config yet it makes one from the settings
      that are in the site's current Web.config (the database connection string and the like)
   3. saves the settings, puts pull-release.ps1 where the scheduled task can run it, and deploys the latest release once
   4. makes a scheduled task, "ReadyToPlay auto deploy", that every minute fetches the release repository and, only when there is a new
      release, backs up the site, copies the release, recycles the app pool and checks the site (it puts the backup back if the site
      does not answer). The log is readytoplay-backups\deploy.log next to the site folder.

  -Uninstall  removes the scheduled task (the files stay)
#>
param(
    [string]$RepoUrl = 'https://github.com/yungsheng123/ReadyToPlay-release.git',
    [string]$Token = '',
    [string]$ReleaseDir = 'C:\src\ReadyToPlay-release',
    [string]$SiteDir = '',
    [string]$AppPool = '',
    [string]$Url = '',
    [string]$Ref = 'master',
    [int]$EveryMinutes = 1,
    [string]$TaskName = 'ReadyToPlay auto deploy',
    [string]$StateDir = (Join-Path $env:ProgramData 'ReadyToPlay-deploy'),
    [switch]$SkipTask,
    [switch]$SkipFirstDeploy,
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
function Step($text) { Write-Host ("`n== " + $text) -ForegroundColor Cyan }
function Fail($text) { Write-Host ("FAILED: " + $text) -ForegroundColor Red; exit 1 }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $SkipTask) { Fail 'Run this in an elevated PowerShell (right-click, Run as administrator).' }

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false; Write-Host "Removed the scheduled task '$TaskName'." -ForegroundColor Green } else { Write-Host 'There is no such scheduled task.' }
    exit 0
}

# ---- 1. git and the clone
Step 'Git and the release repository'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git is not installed (or not on the PATH). Install Git for Windows from git-scm.com, then open a new PowerShell and run this again.' }
function WithToken($url, $token) { if ($token) { return $url -replace '^https://', ("https://x-access-token:" + $token + "@") } else { return $url } }
if (-not (Test-Path (Join-Path $ReleaseDir '.git'))) {
    if (-not $Token -and $RepoUrl -match '^https://') {
        if (-not [Environment]::UserInteractive -or [Console]::IsInputRedirected) { Fail 'Pass the token: -Token <read-only GitHub token>.' }
        $secure = Read-Host 'Paste a read-only GitHub token for the release repository (it is kept in the clone, so the scheduled task can fetch)' -AsSecureString
        $Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    }
    New-Item -ItemType Directory -Force (Split-Path $ReleaseDir -Parent) | Out-Null
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & git.exe clone (WithToken $RepoUrl $Token) $ReleaseDir 2>&1 | ForEach-Object { Write-Host ("" + $_ -replace 'x-access-token:[^@]+@', 'x-access-token:***@') }
    $ErrorActionPreference = $old
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $ReleaseDir '.git'))) { Fail 'git clone failed: check the repository address and that the token may read it.' }
} elseif ($Token) {
    & git.exe -C $ReleaseDir remote set-url origin (WithToken $RepoUrl $Token)
}
# the scheduled task runs as SYSTEM, which must be allowed to use a clone made by another user
if ($isAdmin) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & git.exe config --system --add safe.directory ($ReleaseDir -replace '\\', '/') 2>&1 | Out-Null
    $ErrorActionPreference = $old
}
if (-not (Test-Path (Join-Path $ReleaseDir '_server\pull-release.ps1'))) { Fail 'The release has no _server\pull-release.ps1: publish a release again from your PC with the newest deploy\publish-release.ps1, then run this again.' }

# ---- 2. the site
Step 'The IIS site'
if (-not $SiteDir) {
    Import-Module WebAdministration -ErrorAction Stop
    $sites = @(Get-Website)
    if ($sites.Count -eq 0) { Fail 'No IIS sites found: pass -SiteDir.' }
    $pick = $sites | Where-Object { $_.Name -ne 'Default Web Site' }
    if (@($pick).Count -eq 1) { $site = @($pick)[0] }
    elseif ($sites.Count -eq 1) { $site = $sites[0] }
    else {
        $i = 0; $sites | ForEach-Object { $i++; Write-Host ("  {0}. {1}  ({2})" -f $i, $_.Name, $_.PhysicalPath) }
        $n = [int](Read-Host 'Which site is ReadyToPlay? (number)')
        $site = $sites[$n - 1]
    }
    $SiteDir = [Environment]::ExpandEnvironmentVariables($site.PhysicalPath)
    if (-not $AppPool) { $AppPool = $site.ApplicationPool }
    if (-not $Url) {
        $b = $site.Bindings.Collection | Where-Object { $_.protocol -eq 'http' } | Select-Object -First 1
        if ($b) { $parts = $b.bindingInformation.Split(':'); $h = if ($parts[2]) { $parts[2] } else { 'localhost' }; $Url = if ($parts[1] -eq '80') { "http://$h" } else { "http://${h}:$($parts[1])" } }
    }
}
if (-not $Url) { $Url = 'http://localhost' }
if (-not (Test-Path $SiteDir)) { Fail "The site folder $SiteDir does not exist." }
Write-Host "Site folder: $SiteDir`nApp pool:    $AppPool`nAddress:     $Url"

# secrets.config: kept on the server only. Made from the site's current Web.config when it is missing.
$secretsFile = Join-Path $SiteDir 'secrets.config'
if (-not (Test-Path $secretsFile)) {
    $webConfig = Join-Path $SiteDir 'Web.config'
    $keys = 'MongoConnectionString', 'MongoDatabaseName', 'APIURL', 'LoginPassword', 'BotToken', 'BotToken2', 'GroupID'
    $found = [ordered]@{}
    if (Test-Path $webConfig) {
        try { [xml]$x = Get-Content $webConfig -Raw; foreach ($a in $x.configuration.appSettings.add) { if ($keys -contains $a.key -and $a.value) { $found[$a.key] = $a.value } } } catch { }
    }
    if (-not $found.Contains('MongoConnectionString')) { Fail "There is no secrets.config in $SiteDir and the site's Web.config has no MongoConnectionString to make one from. Copy AutoBot_Web\secrets.config from your PC into $SiteDir and run this again." }
    $xml = New-Object System.Text.StringBuilder
    [void]$xml.AppendLine('<?xml version="1.0" encoding="utf-8"?>')
    [void]$xml.AppendLine('<!-- The settings that are not in git. Made by install-server.ps1 from the site''s Web.config of that time. -->')
    [void]$xml.AppendLine('<appSettings>')
    foreach ($k in $found.Keys) { [void]$xml.AppendLine('  <add key="' + $k + '" value="' + [Security.SecurityElement]::Escape($found[$k]) + '" />') }
    [void]$xml.AppendLine('</appSettings>')
    [IO.File]::WriteAllText($secretsFile, $xml.ToString(), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Made $secretsFile from the site's current Web.config ($($found.Count) settings)." -ForegroundColor Green
} else { Write-Host 'secrets.config is already there: kept.' }

# ---- 3. the settings, the script, the first deploy
Step 'Settings and the first deploy'
$home2 = $StateDir
New-Item -ItemType Directory -Force $home2 | Out-Null
$backupDir = Join-Path (Split-Path $SiteDir -Parent) 'readytoplay-backups'
@{ SiteDir = $SiteDir; ReleaseDir = $ReleaseDir; AppPool = $AppPool; Url = $Url; Ref = $Ref; BackupDir = $backupDir } | ConvertTo-Json | Set-Content (Join-Path $home2 'config.json') -Encoding UTF8
$pull = Join-Path $home2 'pull-release.ps1'
Copy-Item (Join-Path $ReleaseDir '_server\pull-release.ps1') $pull -Force
if (-not $SkipFirstDeploy) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pull -Config (Join-Path $home2 'config.json')
    if ($LASTEXITCODE -ne 0) { Fail 'The first deploy failed (see above). Nothing was scheduled.' }
}

# ---- 4. the scheduled task
if (-not $SkipTask) {
    Step "Scheduling '$TaskName' (every $EveryMinutes minute(s))"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $pull + '" -Config "' + (Join-Path $home2 'config.json') + '" -Auto')
    $every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
    $boot = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable -AllowStartIfOnBatteries
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($every, $boot) -Principal $principal -Settings $settings -Description 'Deploys the newest ReadyToPlay release when one has been published.' | Out-Null
    Write-Host "Scheduled. Look at $backupDir\deploy.log to see what it did." -ForegroundColor Green
}
Write-Host "`nDone. From now on, publishing on your PC is all it takes: the server follows within about a minute." -ForegroundColor Green
exit 0
