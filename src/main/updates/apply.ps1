# Swaps the PDFx program folder after PDFx has closed. Started by PDFx itself
# (hidden PowerShell, see updates/updater.ts).
#
# For each top-level name in InDir (the version coming in), moves the item of
# that name in AppDir to OutDir, then the incoming one into AppDir. Only the
# program's own names move: other files next to pdfx.exe (the ZIP has no
# root folder, so it may be unpacked among the user's files) and `data` stay.
# On success InDir is removed and OutDir becomes KeepDir (the version kept
# for a rollback). Any error puts the old files back.
# Moves stay on one volume (InDir/OutDir live under AppDir\data), so each is
# a rename, not a copy. The outcome goes to ResultFile for the next start,
# each step to update.log next to it.
#
# Cmdlets only, no .NET calls: on managed machines PowerShell often runs in
# Constrained Language mode, which refuses them.
param(
  [string]$AppDir,
  [string]$InDir,
  [string]$OutDir,
  [string]$KeepDir,
  [int]$WaitPid = 0,
  [string]$Relaunch = '',
  [string]$ResultFile,
  [string]$Version
)
$ErrorActionPreference = 'Stop'
# PDFx passes the parameters in apply.json next to this script, so no path
# has to survive cmd.exe quoting.
if (-not $AppDir) {
  $p = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'apply.json') | ConvertFrom-Json
  $AppDir = $p.AppDir
  $InDir = $p.InDir
  $OutDir = $p.OutDir
  $KeepDir = $p.KeepDir
  $WaitPid = [int]$p.WaitPid
  $Relaunch = $p.Relaunch
  $ResultFile = $p.ResultFile
  $Version = $p.Version
}
$log = Join-Path (Split-Path -Parent $ResultFile) 'update.log'

function Write-Log([string]$text) {
  try { Add-Content -LiteralPath $log -Value ('{0} {1}' -f (Get-Date -Format s), $text) -Encoding UTF8 } catch {}
}

function Write-Result([bool]$ok, [string]$message) {
  $json = @{ ok = $ok; version = $Version; message = $message } | ConvertTo-Json -Compress
  Set-Content -LiteralPath $ResultFile -Value $json -Encoding UTF8
}

# Antivirus scanners and the exiting process hold files for a moment.
function Move-Retry([string]$from, [string]$to) {
  for ($i = 0; ; $i++) {
    try {
      Move-Item -LiteralPath $from -Destination $to -Force
      return
    } catch {
      if ($i -ge 60) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
}

Write-Log "swap to $Version started (PowerShell $($PSVersionTable.PSVersion), $($ExecutionContext.SessionState.LanguageMode))"
if ($WaitPid -gt 0) {
  try { Wait-Process -Id $WaitPid -Timeout 120 -ErrorAction Stop } catch {}
}
Write-Log 'PDFx has closed'

$moved = @()
$placed = @()
try {
  if (-not (Test-Path -LiteralPath (Join-Path $InDir 'pdfx.exe'))) { throw "pdfx.exe is missing in $InDir" }
  if (Test-Path -LiteralPath $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
  New-Item -ItemType Directory -Path $OutDir | Out-Null
  $names = @(Get-ChildItem -LiteralPath $InDir -Force | Where-Object { $_.Name -ne 'data' } | ForEach-Object { $_.Name })
  foreach ($name in $names) {
    $current = Join-Path $AppDir $name
    if (Test-Path -LiteralPath $current) {
      Move-Retry $current (Join-Path $OutDir $name)
      $moved += $name
    }
  }
  foreach ($name in $names) {
    Move-Retry (Join-Path $InDir $name) (Join-Path $AppDir $name)
    $placed += $name
  }
  Remove-Item -LiteralPath $InDir -Recurse -Force -ErrorAction SilentlyContinue
  if ($KeepDir) {
    if (Test-Path -LiteralPath $KeepDir) { Remove-Item -LiteralPath $KeepDir -Recurse -Force }
    Move-Item -LiteralPath $OutDir -Destination $KeepDir
  }
  Write-Result $true ''
  Write-Log "swap done: $($names.Count) items"
} catch {
  $reason = $_.Exception.Message
  Write-Log "swap failed, restoring: $reason"
  foreach ($name in $placed) {
    try {
      if (-not (Test-Path -LiteralPath $InDir)) { New-Item -ItemType Directory -Path $InDir | Out-Null }
      Move-Retry (Join-Path $AppDir $name) (Join-Path $InDir $name)
    } catch {}
  }
  foreach ($name in $moved) {
    try { Move-Retry (Join-Path $OutDir $name) (Join-Path $AppDir $name) } catch {}
  }
  try { Write-Result $false $reason } catch {}
}

if ($Relaunch) {
  Write-Log 'starting PDFx'
  Start-Process -FilePath (Join-Path $AppDir 'pdfx.exe') -WorkingDirectory $AppDir
}
