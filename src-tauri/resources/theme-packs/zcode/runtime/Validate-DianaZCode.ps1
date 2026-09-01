[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $root 'manifest.sha256'
$exe = if ($env:DIANA_ZCODE_EXE) { $env:DIANA_ZCODE_EXE } else { 'C:\Program Files\ZCode\ZCode.exe' }
$expectedVersion = '3.6.5.4145'
$expectedThumbprint = '6F7B147DC610F91425750D2449C46002C3385BCF'

$hashFailures = @()
foreach ($line in Get-Content -LiteralPath $manifestPath) {
  if ($line -notmatch '^([0-9A-F]{64}) \*(.+)$') {
    throw "Invalid manifest line: $line"
  }
  $expectedHash = $Matches[1]
  $relativePath = $Matches[2]
  $path = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $path)) {
    $hashFailures += "missing:$relativePath"
    continue
  }
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
  if ($actualHash -ne $expectedHash) {
    $hashFailures += "hash:$relativePath"
  }
}

$node = (Get-Command node -ErrorAction Stop).Source
& $node --check (Join-Path $root 'adapter.mjs')
if ($LASTEXITCODE -ne 0) { throw 'adapter.mjs syntax check failed' }
& $node --check (Join-Path $root 'runtime-template.js')
if ($LASTEXITCODE -ne 0) { throw 'runtime-template.js syntax check failed' }

$parseFailures = @()
Get-ChildItem -LiteralPath $root -Filter '*.ps1' | Where-Object { $_.Name -ne 'Validate-DianaZCode.ps1' } | ForEach-Object {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { $parseFailures += $_.Name }
}

$item = Get-Item -LiteralPath $exe
$signature = Get-AuthenticodeSignature -LiteralPath $exe
$scheduledTaskMatches = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
  ($_.Actions | Out-String) -like "*$root*"
})
$serviceMatches = @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object {
  $_.PathName -like "*$root*"
})
$startupMatches = @(
  Get-ChildItem -LiteralPath ([Environment]::GetFolderPath('Startup')) -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '*Diana*ZCode*' }
)

$result = [ordered]@{
  root = $root
  hashFailures = $hashFailures
  powerShellParseFailures = $parseFailures
  targetVersion = $item.VersionInfo.FileVersion
  signature = [string]$signature.Status
  signerThumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { '' }
  scheduledTaskMatches = $scheduledTaskMatches.Count
  serviceMatches = $serviceMatches.Count
  startupMatches = $startupMatches.Count
  appAsarModified = $false
  ready = (
    $hashFailures.Count -eq 0 -and
    $parseFailures.Count -eq 0 -and
    $item.VersionInfo.FileVersion -eq $expectedVersion -and
    [string]$signature.Status -eq 'Valid' -and
    $signature.SignerCertificate.Thumbprint -eq $expectedThumbprint -and
    $scheduledTaskMatches.Count -eq 0 -and
    $serviceMatches.Count -eq 0 -and
    $startupMatches.Count -eq 0
  )
}

$result | ConvertTo-Json -Depth 4
if (-not $result.ready) { exit 1 }
