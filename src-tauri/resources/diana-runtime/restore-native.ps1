[CmdletBinding()]
param(
  [switch]$WaitForExistingExit,
  [Parameter(Mandatory = $true)]
  [string]$NodePath
)

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Manifest = Get-Content -LiteralPath (Join-Path $Root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$SessionPath = Join-Path $Root 'state\session.json'

function Get-MainCodexProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -notmatch '--type=' -and
      $_.ExecutablePath -match '(?i)\\OpenAI\.Codex_[^\\]+\\app\\ChatGPT\.exe$'
    })
}

if (Test-Path -LiteralPath $SessionPath) {
  $session = Get-Content -LiteralPath $SessionPath -Raw -Encoding UTF8 | ConvertFrom-Json
  try {
    if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
      throw "未找到受信任的 Node.js 运行时：$NodePath"
    }
    & $NodePath (Join-Path $Root 'adapter.mjs') disable --port ([string]$session.port) --main-pid ([string]$session.mainPid)
  } catch { }
}

$main = Get-MainCodexProcesses
if ($WaitForExistingExit) {
  Write-Host '正在等待当前 Codex 从“文件 > 退出 ChatGPT”正常退出；不会发送关闭或强制结束请求。' -ForegroundColor Cyan
} else {
  foreach ($item in $main) {
    $process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
    if ($process) { [void]$process.CloseMainWindow() }
  }
}
$deadline = (Get-Date).AddSeconds($(if ($WaitForExistingExit) { 90 } else { 45 }))
do {
  $remaining = Get-MainCodexProcesses
  if (-not $remaining) { break }
  Start-Sleep -Milliseconds 400
} while ((Get-Date) -lt $deadline)
if ($remaining) { throw 'Codex 未正常退出；未执行强制结束，也没有启动第二个实例。' }

Start-Process -FilePath 'explorer.exe' -ArgumentList "shell:AppsFolder\$($Manifest.appId)" | Out-Null
$nativeDeadline = (Get-Date).AddSeconds(45)
$native = $null
do {
  $native = Get-MainCodexProcesses | Select-Object -First 1
  if ($native) { break }
  Start-Sleep -Milliseconds 400
} while ((Get-Date) -lt $nativeDeadline)
if (-not $native) { throw '官方入口未在 45 秒内启动 Codex。' }
if ($native.CommandLine -match '--remote-debugging-|--inspect') { throw '恢复后的 Codex 仍带调试参数。' }
if (Test-Path -LiteralPath $SessionPath) {
  $session.status = 'restored_native'
  $session | Add-Member -NotePropertyName restoredAt -NotePropertyValue ([DateTimeOffset]::Now.ToString('o')) -Force
  $session | ConvertTo-Json | Set-Content -LiteralPath $SessionPath -Encoding UTF8
}
Write-Host "已从官方入口正常重开 Codex（PID $($native.ProcessId)）；未携带调试参数。" -ForegroundColor Green
