[CmdletBinding()]
param(
  [switch]$WaitForExistingExit,
  [ValidateSet('dark','light','system')]
  [string]$Mode = 'system',
  [Parameter(Mandatory = $true)]
  [string]$NodePath
)

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Manifest = Get-Content -LiteralPath (Join-Path $Root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$StateDir = Join-Path $Root 'state'
$LogDir = Join-Path $Root 'logs'
$SessionPath = Join-Path $StateDir 'session.json'
$LogPath = Join-Path $LogDir 'events.jsonl'
$script:DetectedCodexVersion = $null

New-Item -ItemType Directory -Path $StateDir,$LogDir -Force | Out-Null

function Write-AdapterEvent {
  param([string]$EventName, [hashtable]$Details = @{})
  $entry = [ordered]@{
    time = [DateTimeOffset]::Now.ToString('o')
    event = $EventName
    adapterVersion = $Manifest.adapterVersion
    compatibilityMode = $Manifest.compatibilityMode
    codexVersion = $script:DetectedCodexVersion
  }
  foreach ($key in $Details.Keys) { $entry[$key] = $Details[$key] }
  ($entry | ConvertTo-Json -Compress) | Add-Content -LiteralPath $LogPath -Encoding UTF8
}

function Get-MainCodexProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -notmatch '--type=' -and
      $_.ExecutablePath -match '(?i)\\OpenAI\.Codex_[^\\]+\\app\\ChatGPT\.exe$'
    })
}

function Wait-ProcessesExit {
  param([int[]]$ProcessIds, [int]$Seconds = 45)
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    $remaining = @($ProcessIds | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    if (-not $remaining) { return $true }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Test-PortFree {
  param([int]$Port)
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) { $listener.Stop() }
  }
}

function Test-TcpEndpointReachable {
  param([string]$Address, [int]$Port, [int]$TimeoutMilliseconds = 1200)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync($Address, $Port)
    return $task.Wait($TimeoutMilliseconds) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Get-CryptoRandomInt {
  param(
    [Parameter(Mandatory = $true)][int]$Minimum,
    [Parameter(Mandatory = $true)][int]$MaximumExclusive
  )
  if ($MaximumExclusive -le $Minimum) { throw 'Invalid cryptographic random range.' }
  $range = [uint64]($MaximumExclusive - $Minimum)
  $fullUInt32Range = [uint64]4294967296
  $acceptBelow = $fullUInt32Range - ($fullUInt32Range % $range)
  $buffer = New-Object byte[] 4
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    do {
      $generator.GetBytes($buffer)
      $value = [uint64][BitConverter]::ToUInt32($buffer, 0)
    } while ($value -ge $acceptBelow)
    return $Minimum + [int]($value % $range)
  } finally {
    $generator.Dispose()
  }
}

function Invoke-CodexExitMenu {
  param([int]$ProcessId)
  try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    if (-not $process.MainWindowHandle) { return $false }
    $window = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    $menuCondition = [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
      'application-menu-trigger-file-menu'
    )
    $fileMenu = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $menuCondition)
    if (-not $fileMenu) { return $false }
    $expand = $fileMenu.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
    $expand.Expand()
    Start-Sleep -Milliseconds 600
    $itemCondition = [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::MenuItem
    )
    $items = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      $itemCondition
    )
    $exitItem = $null
    for ($index = 0; $index -lt $items.Count; $index++) {
      $candidate = $items.Item($index)
      if ($candidate.Current.Name -match '^(退出 ChatGPT|Exit ChatGPT)') {
        $exitItem = $candidate
        break
      }
    }
    if (-not $exitItem -or -not $exitItem.Current.IsEnabled) { return $false }
    $invoke = $exitItem.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
    return $true
  } catch {
    return $false
  }
}

function Get-RandomHighPort {
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    $candidate = Get-CryptoRandomInt `
      -Minimum ([int]$Manifest.portRange.minimum) `
      -MaximumExclusive ([int]$Manifest.portRange.maximumExclusive)
    if (Test-PortFree -Port $candidate) { return $candidate }
  }
  throw 'Could not select a free high loopback port.'
}

function Start-NormalCodex {
  Start-Process -FilePath 'explorer.exe' -ArgumentList "shell:AppsFolder\$($Manifest.appId)" | Out-Null
}

function Start-PackagedCodex {
  param(
    [Parameter(Mandatory = $true)][string]$AppUserModelId,
    [Parameter(Mandatory = $true)][string]$Arguments
  )

  if (-not ('Diana.Launch.PackagedAppActivation' -as [type])) {
    $source = @'
using System;
using System.Runtime.InteropServices;

namespace Diana.Launch {
  [ComImport]
  [Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IApplicationActivationManager {
    int ActivateApplication(
      [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      [MarshalAs(UnmanagedType.LPWStr)] string arguments,
      uint options,
      out uint processId);
  }

  [ComImport]
  [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
  class ApplicationActivationManager {}

  public static class PackagedAppActivation {
    public static int Activate(string appUserModelId, string arguments) {
      var manager = (IApplicationActivationManager)new ApplicationActivationManager();
      uint processId;
      int result = manager.ActivateApplication(appUserModelId, arguments, 0, out processId);
      if (result < 0) Marshal.ThrowExceptionForHR(result);
      return checked((int)processId);
    }
  }
}
'@
    Add-Type -TypeDefinition $source -Language CSharp
  }

  [Diana.Launch.PackagedAppActivation]::Activate($AppUserModelId, $Arguments)
}

try {
  Write-Host 'Diana 首次手动挂载：正在进行安全预检……' -ForegroundColor Magenta
  Write-AdapterEvent 'manual_mount_started' @{ mode = $Mode }
  $package = Get-AppxPackage -Name $Manifest.packageName -ErrorAction Stop
  $version = $package.Version.ToString()
  $script:DetectedCodexVersion = $version
  Write-AdapterEvent 'installed_codex_detected' @{ codexVersion = $version }
  $executable = Join-Path $package.InstallLocation $Manifest.executableRelativePath
  if (-not (Test-Path -LiteralPath $executable)) { throw '未找到官方 Codex 可执行文件。' }

  if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw "未找到受信任的 Node.js 运行时：$NodePath"
  }
  & $NodePath (Join-Path $Root 'adapter.mjs') self-test | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '本机适配器静态验证失败。' }

  $legacyWatchers = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'diana-runtime\.mjs' -and $_.CommandLine -match '--watch' })
  $task = Get-ScheduledTask -TaskName 'Diana Codex Theme' -ErrorAction SilentlyContinue
  $activeLegacyTask = $task -and $task.State -ne 'Disabled'
  if ($legacyWatchers -or $activeLegacyTask) {
    Write-AdapterEvent 'legacy_runtime_detected' @{ legacyWatcherCount = $legacyWatchers.Count; legacyTaskActive = [bool]$activeLegacyTask }
    throw '检测到旧 Diana watcher 或仍启用的计划任务。候选启动器不会擅自停止或修改它们；请先用旧版的恢复/卸载入口清理后再试。'
  }

  $mainProcesses = Get-MainCodexProcesses
  $mainIds = @($mainProcesses.ProcessId)
  if ($WaitForExistingExit) {
    Write-AdapterEvent 'waiting_for_verified_normal_exit' @{ processCount = $mainIds.Count }
    Write-Host '正在等待当前 Codex 从“文件 > 退出 ChatGPT”正常退出；不会发送关闭或强制结束请求。' -ForegroundColor Cyan
    if ($mainIds -and -not (Wait-ProcessesExit -ProcessIds $mainIds -Seconds 90)) {
      throw '等待 90 秒后 Codex 仍未正常退出；未发送关闭或强制结束请求。'
    }
  } else {
    if ($mainIds) { throw '普通 Codex 正在运行。候选启动器不会自动关闭它，请从“文件 > 退出 ChatGPT”完整退出后重试。' }
  }

  $legacyListener = @(Get-NetTCPConnection -State Listen -LocalPort 9336 -ErrorAction SilentlyContinue)
  if ($legacyListener) {
    $visibleOwners = @($legacyListener.OwningProcess | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    $reachable = (Test-TcpEndpointReachable -Address '127.0.0.1' -Port 9336) -or
      (Test-TcpEndpointReachable -Address '::1' -Port 9336)
    if ($visibleOwners -or $reachable) {
      throw '旧 9336 调试端口仍可连接或仍有可见所有者；为避免叠加暴露，本次挂载已中止。'
    }
    Write-AdapterEvent 'stale_legacy_tcp_records_ignored' @{ recordCount = $legacyListener.Count }
  }

  $port = Get-RandomHighPort
  Write-Host "正在使用一次性高位回环端口 $port 启动官方 Codex……" -ForegroundColor Cyan
  $launchArguments = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$port"
  $activationPid = Start-PackagedCodex -AppUserModelId $Manifest.appId -Arguments $launchArguments
  Write-AdapterEvent 'msix_activation_requested' @{ activationPid = $activationPid; port = $port }

  $deadline = (Get-Date).AddSeconds(50)
  $ready = $false
  $codexPid = [int]$activationPid
  do {
    Start-Sleep -Milliseconds 350
    $process = Get-Process -Id $codexPid -ErrorAction SilentlyContinue
    $windowReady = $process -and $process.MainWindowHandle -ne 0
    $portReady = Test-TcpEndpointReachable -Address '127.0.0.1' -Port $port -TimeoutMilliseconds 250
    if ($windowReady -and $portReady) { $ready = $true }
  } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready -or -not $codexPid) { throw '通过 MSIX 激活后，Codex 调试端口或主窗口未在时限内就绪。' }

  # Heavy CIM/TCP-table checks run only once after the cheap readiness probe succeeds.
  $mainProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$codexPid" -ErrorAction Stop
  if ($mainProcess.ExecutablePath -ine $executable) {
    throw 'MSIX 激活返回的进程不是预期的官方 Codex 可执行文件。'
  }
  $verifiedCommandLine = [string]$mainProcess.CommandLine
  if (-not $verifiedCommandLine.Contains("--remote-debugging-port=$port") -or
      -not $verifiedCommandLine.Contains('--remote-debugging-address=127.0.0.1')) {
    throw 'Codex 主进程没有携带本次受控回环调试参数。'
  }

  $listeners = @()
  for ($attempt = 0; $attempt -lt 5 -and -not $listeners; $attempt++) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    if (-not $listeners) { Start-Sleep -Milliseconds 250 }
  }
  if (-not $listeners) { throw '调试端口可以连接，但 Windows TCP 表未返回监听所有者。' }
  $badAddress = @($listeners | Where-Object LocalAddress -NotIn @('127.0.0.1','::1'))
  if ($badAddress) { throw '调试端口出现非回环监听地址。' }
  $badOwner = @($listeners | Where-Object OwningProcess -ne $codexPid)
  if ($badOwner) { throw '调试端口监听所有者不是本次 Codex 主进程。' }

  Write-Host "正在检查 Codex v$version 的当前界面结构……" -ForegroundColor Cyan
  $probeReady = $false
  $probeDeadline = (Get-Date).AddSeconds(15)
  do {
    & $NodePath (Join-Path $Root 'adapter.mjs') probe --port $port --main-pid $codexPid | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $probeReady = $true
      break
    }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $probeDeadline)
  if (-not $probeReady) {
    throw '当前 Codex 界面没有通过 Diana 安全挂载探测；未注入主题。'
  }

  $session = [ordered]@{
    status = 'launching'
    adapterVersion = $Manifest.adapterVersion
    codexVersion = $version
    mainPid = $codexPid
    port = $port
    mode = $Mode
    startedAt = [DateTimeOffset]::Now.ToString('o')
    persistence = $false
  }
  $session | ConvertTo-Json | Set-Content -LiteralPath $SessionPath -Encoding UTF8

  & $NodePath (Join-Path $Root 'adapter.mjs') apply --port $port --main-pid $codexPid --mode $Mode
  if ($LASTEXITCODE -ne 0) { throw '主题注入失败。' }

  $session.status = 'applied'
  $session.appliedAt = [DateTimeOffset]::Now.ToString('o')
  $session | ConvertTo-Json | Set-Content -LiteralPath $SessionPath -Encoding UTF8
  Write-AdapterEvent 'manual_mount_complete' @{ mainPid = $codexPid; port = $port; mode = $Mode }
  Write-Host 'Diana 首次手动挂载已完成。当前没有自启动或后台 watcher。' -ForegroundColor Green
  Start-Sleep -Seconds 3
} catch {
  Write-AdapterEvent 'manual_mount_failed' @{ code = $_.Exception.Message.Substring(0, [Math]::Min(240, $_.Exception.Message.Length)) }
  Write-Host "挂载失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host '不会强制关闭进程。若实验性 Codex 已打开，请退出后从开始菜单正常重开。' -ForegroundColor Yellow
  Start-Sleep -Seconds 12
  exit 1
}
