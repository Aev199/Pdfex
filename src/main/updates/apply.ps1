# Swaps the PDFx program folder after PDFx has closed. Started by PDFx itself
# (hidden PowerShell), see updates/install.ts.
#
# For each top-level name in InDir (the version coming in), moves the item of
# that name in AppDir to OutDir, then the incoming one into AppDir. Only the
# program's own names move: other files next to pdfx.exe (the ZIP has no
# root folder, so it may be unpacked among the user's files) and `data` stay.
# On success InDir is removed and OutDir becomes KeepDir (the version kept
# for a rollback). Any error puts the old files back.
# Moves stay on one volume (InDir/OutDir live under AppDir\data), so each is
# a rename, not a copy. The outcome goes to ResultFile for the next start.
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

function Write-Result([bool]$ok, [string]$message) {
  $json = [ordered]@{ ok = $ok; version = $Version; message = $message } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($ResultFile, $json, [Text.UTF8Encoding]::new($false))
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

if ($WaitPid -gt 0) {
  try { Wait-Process -Id $WaitPid -Timeout 120 -ErrorAction Stop } catch {}
}

$moved = New-Object System.Collections.Generic.List[string]
$placed = New-Object System.Collections.Generic.List[string]
try {
  if (-not (Test-Path -LiteralPath (Join-Path $InDir 'pdfx.exe'))) { throw "pdfx.exe is missing in $InDir" }
  if (Test-Path -LiteralPath $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
  New-Item -ItemType Directory -Path $OutDir | Out-Null
  $names = @(Get-ChildItem -LiteralPath $InDir -Force | Where-Object { $_.Name -ne 'data' } | ForEach-Object { $_.Name })
  foreach ($name in $names) {
    $current = Join-Path $AppDir $name
    if (Test-Path -LiteralPath $current) {
      Move-Retry $current (Join-Path $OutDir $name)
      $moved.Add($name)
    }
  }
  foreach ($name in $names) {
    Move-Retry (Join-Path $InDir $name) (Join-Path $AppDir $name)
    $placed.Add($name)
  }
  Remove-Item -LiteralPath $InDir -Recurse -Force -ErrorAction SilentlyContinue
  if ($KeepDir) {
    if (Test-Path -LiteralPath $KeepDir) { Remove-Item -LiteralPath $KeepDir -Recurse -Force }
    Move-Item -LiteralPath $OutDir -Destination $KeepDir
  }
  Write-Result $true ''
} catch {
  $reason = $_.Exception.Message
  foreach ($name in $placed) {
    try {
      if (-not (Test-Path -LiteralPath $InDir)) { New-Item -ItemType Directory -Path $InDir | Out-Null }
      Move-Retry (Join-Path $AppDir $name) (Join-Path $InDir $name)
    } catch {}
  }
  foreach ($name in $moved) {
    try { Move-Retry (Join-Path $OutDir $name) (Join-Path $AppDir $name) } catch {}
  }
  Write-Result $false $reason
}

if ($Relaunch) {
  Start-Process -FilePath (Join-Path $AppDir 'pdfx.exe') -WorkingDirectory $AppDir
}
