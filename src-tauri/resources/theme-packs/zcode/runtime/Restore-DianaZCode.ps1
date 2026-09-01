[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:DIANA_POWERSHELL_EXE = if ($PSVersionTable.PSEdition -eq 'Core') { Join-Path $PSHOME 'pwsh.exe' } else { Join-Path $PSHOME 'powershell.exe' }
$node = (Get-Command node -ErrorAction Stop).Source
& $node (Join-Path $root 'adapter.mjs') disable

Write-Host ''
Write-Host 'Manual restore finish:' -ForegroundColor Yellow
Write-Host '1. Fully exit every ZCode process started by this experiment.'
Write-Host '2. Start ZCode again from its original shortcut.'
Write-Host '3. Confirm that no Diana layer or debug port remains.'
Write-Host ''
Write-Host 'This script does not force-close ZCode or delete user files.'
exit $LASTEXITCODE
