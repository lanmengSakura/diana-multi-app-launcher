# Read-only discovery. Registry command strings are never executed.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$paths = [System.Collections.Generic.List[string]]::new()
foreach ($hive in @('HKCU:', 'HKLM:')) {
  foreach ($view in @('SOFTWARE', 'SOFTWARE\WOW6432Node')) {
    $appPath = Get-ItemProperty -LiteralPath "$hive\$view\Microsoft\Windows\CurrentVersion\App Paths\ZCode.exe"
    if ($appPath.'(default)') { $paths.Add([Environment]::ExpandEnvironmentVariables($appPath.'(default)').Trim('"')) }
    Get-ChildItem -LiteralPath "$hive\$view\Microsoft\Windows\CurrentVersion\Uninstall" | ForEach-Object {
      $entry = Get-ItemProperty -LiteralPath $_.PSPath
      if ($entry.DisplayName -match '^ZCode(?:\s|$)') {
        if ($entry.InstallLocation) { $paths.Add((Join-Path ([Environment]::ExpandEnvironmentVariables($entry.InstallLocation).Trim('"')) 'ZCode.exe')) }
        if ($entry.DisplayIcon -match '^\s*"?(.+?ZCode\.exe)"?(?:,\s*\d+)?\s*$') {
          $paths.Add([Environment]::ExpandEnvironmentVariables($Matches[1]))
        }
      }
    }
  }
}
ConvertTo-Json -InputObject @($paths | Select-Object -Unique) -Compress
