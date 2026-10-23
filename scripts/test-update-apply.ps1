# Windows CI: runs the folder swap of the updater (src/main/updates/apply.ps1)
# exactly as PDFx starts it (powershell.exe -EncodedCommand), on a copy of the
# real unpacked build. Usage: test-update-apply.ps1 dist/win-unpacked
param([string]$Build = 'dist/win-unpacked')
$ErrorActionPreference = 'Stop'

$root = Join-Path ([IO.Path]::GetTempPath()) "pdfx-update-test-$PID"
$app = Join-Path $root 'Новая папка\PDFx'
$updates = Join-Path $app 'data\updates'
$staged = Join-Path $updates 'staged'
$previous = Join-Path $updates 'previous'
$result = Join-Path $updates 'result.json'
$apply = Get-Content -Raw (Join-Path $PSScriptRoot '..\src\main\updates\apply.ps1')

function Check([bool]$ok, [string]$what) {
  if (-not $ok) { throw "update test failed: $what" }
  Write-Host "ok - $what"
}
function Version([string]$dir) {
  (Get-Content -Raw (Join-Path $dir 'version.json') | ConvertFrom-Json).version
}
function Quote([string]$text) { "'" + $text.Replace("'", "''") + "'" }
function Start-Swap([string]$in, [string]$out, [string]$keep, [string]$version, [int]$waitPid, [string]$relaunch) {
  $call = "-AppDir $(Quote $app) -InDir $(Quote $in) -OutDir $(Quote $out) -KeepDir $(Quote $keep) " +
    "-ResultFile $(Quote $result) -Version $(Quote $version) -Relaunch $(Quote $relaunch) -WaitPid $waitPid"
  $script = "& {`n$apply`n} $call"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  Start-Process powershell.exe -PassThru -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', $encoded)
}

New-Item -ItemType Directory -Force $app | Out-Null
Copy-Item -Recurse -Force (Join-Path $Build '*') $app
$old = Version $app
New-Item -ItemType Directory -Force $staged | Out-Null
Copy-Item -Recurse -Force (Join-Path $Build '*') $staged
Remove-Item -Recurse -Force (Join-Path $staged 'data') -ErrorAction SilentlyContinue
'{"version":"9.9.9","commit":"test","channel":"stable"}' | Set-Content (Join-Path $staged 'version.json')
'new' | Set-Content (Join-Path $staged 'NEW.txt')
'keep me' | Set-Content (Join-Path $app 'data\keep.txt')
# Unpacked among other files: they are not the program's and must stay.
'mine' | Set-Content (Join-Path $app 'my-notes.txt')

# 1. Install: waits for the running PDFx, then swaps.
$pdfx = Start-Process (Join-Path $app 'pdfx.exe') -PassThru
Start-Sleep -Seconds 8
$swap = Start-Swap $staged (Join-Path $updates 'previous.new') $previous '9.9.9' $pdfx.Id ''
Start-Sleep -Seconds 3
Check ((Version $app) -eq $old) 'nothing is touched while PDFx runs'
taskkill /F /T /PID $pdfx.Id | Out-Null
$swap.WaitForExit(120000) | Out-Null
$outcome = Get-Content -Raw $result | ConvertFrom-Json
Check ($outcome.ok -eq $true) "the swap reports success ($($outcome.message))"
Check ((Version $app) -eq '9.9.9') 'the new version is in the program folder'
Check (Test-Path (Join-Path $app 'NEW.txt')) 'new files arrived'
Check ((Get-Content (Join-Path $app 'data\keep.txt')) -eq 'keep me') 'the data folder is untouched'
Check ((Get-Content (Join-Path $app 'my-notes.txt')) -eq 'mine') 'files that are not the program stay'
Check ((Version $previous) -eq $old) 'the old version is kept for a rollback'
Check (-not (Test-Path $staged)) 'the staged folder is gone'
Check (Test-Path (Join-Path $app 'resources\app.asar')) 'app.asar is in place'

# 2. Rollback, then start PDFx again as "Restart now" does.
Remove-Item $result
$swap = Start-Swap $previous (Join-Path $updates 'previous.swap') $previous $old 0 '1'
$swap.WaitForExit(120000) | Out-Null
Check ((Get-Content -Raw $result | ConvertFrom-Json).ok -eq $true) 'the rollback reports success'
Check ((Version $app) -eq $old) 'the old version is back'
Check ((Version $previous) -eq '9.9.9') 'the newer version is kept, so the rollback can be undone'
Start-Sleep -Seconds 8
$running = @(Get-Process pdfx -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$app*" })
Check ($running.Count -gt 0) 'PDFx was started again'
$running | ForEach-Object { taskkill /F /T /PID $_.Id 2>$null | Out-Null }

# 3. A broken update (no pdfx.exe) changes nothing.
Remove-Item $result
New-Item -ItemType Directory -Force $staged | Out-Null
'x' | Set-Content (Join-Path $staged 'junk.txt')
$swap = Start-Swap $staged (Join-Path $updates 'previous.new') $previous '9.9.10' 0 ''
$swap.WaitForExit(120000) | Out-Null
Check ((Get-Content -Raw $result | ConvertFrom-Json).ok -eq $false) 'a broken update is refused'
Check ((Version $app) -eq $old) 'the program folder is unchanged'
Check (Test-Path (Join-Path $app 'pdfx.exe')) 'pdfx.exe is still there'

Start-Sleep -Seconds 2
Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
Write-Host 'update swap: all checks passed'
