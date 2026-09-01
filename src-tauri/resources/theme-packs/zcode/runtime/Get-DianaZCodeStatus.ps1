[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:DIANA_POWERSHELL_EXE = if ($PSVersionTable.PSEdition -eq 'Core') { Join-Path $PSHOME 'pwsh.exe' } else { Join-Path $PSHOME 'powershell.exe' }
$node = (Get-Command node -ErrorAction Stop).Source
& $node (Join-Path $root 'adapter.mjs') status
exit $LASTEXITCODE
