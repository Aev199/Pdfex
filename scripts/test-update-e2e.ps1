# Windows CI: the whole in-app update on the real build. pdfx.exe, unpacked
# into a folder with Cyrillic and a space in its path, finds version 9.9.9 in
# a feed folder, downloads and unpacks it, closes, PowerShell swaps the
# program files, and the new version starts. Usage: test-update-e2e.ps1 dist/win-unpacked
param([string]$Build = 'dist/win-unpacked')
$ErrorActionPreference = 'Stop'

$root = Join-Path ([IO.Path]::GetTempPath()) "pdfx-update-e2e-$PID"
$app = Join-Path $root 'Программа PDFx'
$next = Join-Path $root 'next'
$feed = Join-Path $root 'feed'
$updates = Join-Path $app 'data\updates'

function Check([bool]$ok, [string]$what) {
  if (-not $ok) { throw "update e2e failed: $what" }
  Write-Host "ok - $what"
}
function Version([string]$dir) {
  (Get-Content -Raw (Join-Path $dir 'version.json') | ConvertFrom-Json).version
}
function Running() {
  @(Get-Process pdfx -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$app*" })
}

New-Item -ItemType Directory -Force $app, $next, $feed | Out-Null
Copy-Item -Recurse -Force (Join-Path $Build '*') $app
Copy-Item -Recurse -Force (Join-Path $Build '*') $next
Remove-Item -Recurse -Force (Join-Path $app 'data'), (Join-Path $next 'data') -ErrorAction SilentlyContinue
$old = Version $app
'{"version":"9.9.9","commit":"e2e","channel":"stable"}' | Set-Content (Join-Path $next 'version.json')
'new' | Set-Content (Join-Path $next 'NEW.txt')
$zip = Join-Path $feed 'PDFx-Windows-Portable.zip'
Compress-Archive -Path (Join-Path $next '*') -DestinationPath $zip
$sha = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
@{ version = '9.9.9'; commit = 'e2e'; channel = 'stable'; sha256 = $sha; notes = @('update e2e') } |
  ConvertTo-Json | Set-Content (Join-Path $feed 'latest.json')

$env:PDFX_UPDATE_FEED = $feed
$env:PDFX_UPDATE_SELFTEST = '1'
Start-Process (Join-Path $app 'pdfx.exe') -WorkingDirectory $app | Out-Null

$done = $false
for ($i = 0; $i -lt 120 -and -not $done; $i++) {
  Start-Sleep -Seconds 2
  $done = (Test-Path (Join-Path $app 'NEW.txt')) -and ((Running).Count -gt 0)
}
Start-Sleep -Seconds 5
Write-Host '--- update.log'
Get-Content (Join-Path $updates 'update.log') -ErrorAction SilentlyContinue | Write-Host
Write-Host '--- powershell.log'
Get-Content (Join-Path $updates 'powershell.log') -ErrorAction SilentlyContinue | Write-Host
Write-Host '---'
Check ((Version $app) -eq '9.9.9') 'the new version is in the program folder'
Check (Test-Path (Join-Path $app 'NEW.txt')) 'its files arrived'
Check ((Running).Count -gt 0) 'PDFx started again'
Check ((Version (Join-Path $updates 'previous')) -eq $old) 'the old version is kept for a rollback'
Check (-not (Test-Path (Join-Path $updates 'staged\pdfx.exe'))) 'nothing is left staged'
Check ((Get-Content -Raw (Join-Path $updates 'update.log')) -match 'swap done') 'the swap logged success'

Running | ForEach-Object { taskkill /F /T /PID $_.Id 2>$null | Out-Null }
Start-Sleep -Seconds 2
Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
Write-Host 'update e2e: all checks passed'
exit 0
