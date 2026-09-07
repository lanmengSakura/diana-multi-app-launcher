//! Local application associations. Reading, choosing and saving a path never
//! executes the selected application, extracts a theme or grants CDP consent.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_CONFIG_BYTES: u64 = 64 * 1024;
const TARGETS: &[&str] = &[
    "codex", "cursor", "grokbot", "zcode", "doubao", "vscode", "terminal", "deepseek",
];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedLink {
    path: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkConfig {
    schema_version: u32,
    targets: BTreeMap<String, SavedLink>,
    #[serde(flatten)]
    extra: BTreeMap<String, serde_json::Value>,
}

impl Default for LinkConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            targets: BTreeMap::new(),
            extra: BTreeMap::new(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LinkStatus {
    target: String,
    state: String,
    path: Option<String>,
    saved_path: Option<String>,
    can_choose: bool,
    kind: &'static str,
    expected: &'static str,
    message: String,
}

pub(crate) fn check_target(target: &str) -> Result<(), String> {
    if TARGETS.contains(&target) {
        Ok(())
    } else {
        Err("未知应用，未更改关联。".into())
    }
}

fn expected_names(target: &str) -> &'static [&'static str] {
    match target {
        "cursor" => &["Cursor.exe"],
        "grokbot" => &["Grok Bot.exe"],
        "zcode" => &["ZCode.exe"],
        "doubao" => &["Doubao.exe"],
        "vscode" => &["Code.exe"],
        "terminal" => &["wt.exe", "WindowsTerminal.exe"],
        _ => &[],
    }
}

fn expected(target: &str) -> &'static str {
    match target {
        "codex" => "Windows 已注册的官方 Codex 安装包",
        "cursor" => "Cursor.exe",
        "grokbot" => "Grok Bot.exe",
        "zcode" => "ZCode.exe",
        "doubao" => "Doubao.exe",
        "vscode" => "Code.exe",
        "terminal" => "wt.exe 或 WindowsTerminal.exe",
        "deepseek" => "包含 package.json 和 apps/web/package.json 的项目根目录",
        _ => "",
    }
}

fn config_path() -> Result<PathBuf, String> {
    std::env::var_os("LOCALAPPDATA")
        .map(|base| {
            PathBuf::from(base)
                .join("DianaCodexLauncher")
                .join("app-links.json")
        })
        .ok_or_else(|| "无法确定当前用户的关联设置目录。".into())
}

// Do not follow a replacement settings-file symlink/junction while writing.
fn check_config_location(path: &Path) -> Result<(), String> {
    for entry in path.ancestors() {
        match fs::symlink_metadata(entry) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("关联设置路径包含链接，请先检查该文件；未覆盖原设置。".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("无法检查关联设置：{error}")),
        }
    }
    Ok(())
}

fn read_config(path: &Path) -> Result<LinkConfig, String> {
    check_config_location(path)?;
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LinkConfig::default())
        }
        Err(error) => return Err(format!("无法读取关联设置：{error}")),
    };
    let mut bytes = Vec::new();
    file.take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err("关联设置过大，未覆盖原文件。".into());
    }
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let config: LinkConfig = serde_json::from_slice(bytes)
        .map_err(|_| "关联设置格式损坏，请保留原文件排查；未重置其他应用的关联。".to_string())?;
    if config.schema_version != 1 {
        return Err("关联设置来自不支持的版本，未覆盖原文件。".into());
    }
    Ok(config)
}

fn local_absolute_path(value: &str) -> Result<PathBuf, String> {
    let value = value.trim();
    let value = if value.starts_with('"') && value.ends_with('"') && value.len() > 1 {
        &value[1..value.len() - 1]
    } else {
        value
    };
    if value.is_empty()
        || value
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '*' | '?' | '|'))
    {
        return Err("请选择本机的完整路径，不要填写启动命令、参数或通配符。".into());
    }
    if value.starts_with("\\\\") || value.starts_with("//") || value.contains("://") {
        return Err("这里只关联本机文件，不接受网址、网络共享或设备路径。".into());
    }
    let path = PathBuf::from(value);
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("请填写完整的本机绝对路径，不使用相对目录。".into());
    }
    #[cfg(windows)]
    if value.get(2..).is_some_and(|tail| tail.contains(':')) {
        return Err("路径包含无效的数据流或启动参数。".into());
    }
    Ok(path)
}

fn terminal_alias(path: &Path) -> bool {
    std::env::var_os("LOCALAPPDATA")
        .is_some_and(|base| path == PathBuf::from(base).join("Microsoft/WindowsApps/wt.exe"))
}

fn validate_path(target: &str, value: &str) -> Result<PathBuf, String> {
    check_target(target)?;
    if target == "codex" {
        return Err(
            "Codex 按官方安装包自动关联并跟踪更新，无需绑定某一版本的 EXE。请使用重新检测。".into(),
        );
    }
    let path = local_absolute_path(value)?;
    if target == "deepseek" {
        if !path.is_dir()
            || !path.join("package.json").is_file()
            || !path.join("apps/web/package.json").is_file()
        {
            return Err(format!(
                "未找到 Harness 项目结构，请选择{}。",
                expected(target)
            ));
        }
    } else {
        if !path.is_file() {
            return Err("关联的程序不存在或无法读取；请重新选择安装目录中的程序。".into());
        }
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if !expected_names(target)
            .iter()
            .any(|expected| name.eq_ignore_ascii_case(expected))
        {
            return Err(format!(
                "文件不匹配，请选择 {}，不要选择安装包、卸载器或其他程序。",
                expected(target)
            ));
        }
        // App execution aliases are reparse entries, not ordinary PE files.
        if !(target == "terminal" && terminal_alias(&path)) {
            let mut header = [0; 2];
            fs::File::open(&path)
                .and_then(|mut file| file.read_exact(&mut header))
                .map_err(|_| "无法读取该程序，请检查文件是否完整。".to_string())?;
            if &header != b"MZ" {
                return Err("未识别到 Windows 程序文件头，未保存关联。".into());
            }
        }
    }
    Ok(path)
}

/// A broken explicit association is an error, never permission to launch a
/// different copy from a fallback directory.
fn saved_path_at(config: &Path, target: &str) -> Result<Option<PathBuf>, String> {
    check_target(target)?;
    if target == "codex" {
        return Ok(None);
    }
    read_config(config)?
        .targets
        .get(target)
        .map(|link| validate_path(target, &link.path))
        .transpose()
}

pub(crate) fn saved_path(target: &str) -> Result<Option<PathBuf>, String> {
    saved_path_at(&config_path()?, target)
}

pub(crate) fn preflight(target: &str) -> Result<(), String> {
    if target == "codex" {
        return Ok(());
    }
    saved_path(target)
        .map(|_| ())
        .map_err(|error| format!("应用关联需要处理：{error} 请点击状态栏旁的“关联”。"))
}

fn describe(
    target: &str,
    config: Result<LinkConfig, String>,
    detected: Option<PathBuf>,
) -> LinkStatus {
    let mut result = LinkStatus {
        target: target.into(),
        state: "missing".into(),
        path: None,
        saved_path: None,
        can_choose: target != "codex",
        kind: if target == "deepseek" {
            "directory"
        } else {
            "file"
        },
        expected: expected(target),
        message: String::new(),
    };
    if target == "codex" {
        result.kind = "system";
        result.path = detected.map(|p| p.to_string_lossy().into_owned());
        result.state = if result.path.is_some() {
            "automatic"
        } else {
            "missing"
        }
        .into();
        result.message =
            "通过 Windows 官方安装包定位，更新后自动跟踪新目录。重新检测不会启动 Codex。".into();
        return result;
    }
    match config {
        Err(error) => {
            result.state = "error".into();
            result.message = error;
        }
        Ok(config) => {
            if let Some(link) = config.targets.get(target) {
                result.saved_path = Some(link.path.clone());
                match validate_path(target, &link.path) {
                    Ok(path) => {
                        result.path = Some(path.to_string_lossy().into_owned());
                        result.state = "linked".into();
                        result.message = "已使用你选择的位置；重新打开启动器后仍会保留。关联不代表已挂载或通过版本兼容性检查。".into();
                    }
                    Err(error) => {
                        result.state = "invalid".into();
                        result.message = error;
                    }
                }
            } else if let Some(path) = detected {
                result.path = Some(path.to_string_lossy().into_owned());
                result.state = "automatic".into();
                result.message =
                    "已自动找到本机位置，无需手动设置；如需使用另一份安装，可在下方选择。".into();
            } else {
                result.message = format!("尚未自动找到应用，请选择 {}。", expected(target));
            }
        }
    }
    result
}

pub(crate) fn status(target: &str, rescan: bool) -> Result<LinkStatus, String> {
    check_target(target)?;
    let detected = if target == "codex" && rescan {
        crate::installed_codex_with_refresh(true).map(|package| PathBuf::from(package.executable))
    } else {
        crate::external_targets::application_path(target)
    };
    Ok(describe(
        target,
        config_path().and_then(|path| read_config(&path)),
        detected,
    ))
}

fn save_at(config_path: &Path, target: &str, value: Option<&str>) -> Result<(), String> {
    check_target(target)?;
    if target == "codex" {
        return Err("Codex 使用系统自动关联，不保存固定安装路径。".into());
    }
    // Validate before touching any existing configuration.
    let validated = value
        .map(|value| validate_path(target, value))
        .transpose()?;
    static WRITES: OnceLock<Mutex<()>> = OnceLock::new();
    let _guard = WRITES
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "关联设置正忙，请重试。")?;
    let mut config = read_config(config_path)?;
    match validated {
        Some(path) => {
            config.targets.insert(
                target.into(),
                SavedLink {
                    path: path.to_string_lossy().into_owned(),
                },
            );
        }
        None => {
            if config.targets.remove(target).is_none() {
                return Ok(());
            }
        }
    }
    let bytes = serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err("关联设置过大，原文件未更改。".into());
    }
    let parent = config_path.parent().ok_or("无效的关联设置目录。")?;
    check_config_location(config_path)?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temporary = parent.join(format!("app-links-{}-{stamp}.tmp", std::process::id()));
    let mut created_temporary = false;
    let outcome = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        created_temporary = true;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        check_config_location(config_path)?;
        if config_path.exists() {
            let backup = parent.join(format!("app-links-before-{stamp}.json"));
            fs::copy(config_path, backup).map_err(|e| format!("无法备份关联设置，未覆盖：{e}"))?;
        }
        fs::rename(&temporary, config_path).map_err(|e| format!("无法保存关联，原文件保留：{e}"))
    })();
    if outcome.is_err() && created_temporary {
        let _ = fs::remove_file(&temporary);
    }
    outcome
}

pub(crate) fn save(target: &str, path: Option<&str>) -> Result<LinkStatus, String> {
    save_at(&config_path()?, target, path)?;
    status(target, false)
}

// The script is constant. User paths are never concatenated into PowerShell.
const PICKER_SCRIPT: &str = r#"
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner=New-Object System.Windows.Forms.Form
$owner.ShowInTaskbar=$false
$owner.TopMost=$true
try {
  if ($env:DIANA_LINK_PICKER_KIND -eq 'directory') {
    $picker=New-Object System.Windows.Forms.FolderBrowserDialog
    $picker.Description='Select the DeepSeek Harness project folder'
    $picker.ShowNewFolderButton=$false
  } else {
    $picker=New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title='Select installed application - Diana Launcher'
    $picker.Filter='Windows application (*.exe)|*.exe'
    $picker.CheckFileExists=$true
    $picker.CheckPathExists=$true
    $picker.Multiselect=$false
    $picker.RestoreDirectory=$true
    $picker.DereferenceLinks=$true
  }
  try {
    $selected=$null
    if ($picker.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
      if ($env:DIANA_LINK_PICKER_KIND -eq 'directory') { $selected=$picker.SelectedPath }
      else { $selected=$picker.FileName }
    }
    @{path=$selected}|ConvertTo-Json -Compress
  } finally { $picker.Dispose() }
} finally { $owner.Dispose() }
"#;

pub(crate) fn pick(target: &str) -> Result<Option<String>, String> {
    check_target(target)?;
    if target == "codex" {
        return Err("Codex 使用系统自动关联。".into());
    }
    static PICKER: OnceLock<Mutex<()>> = OnceLock::new();
    let _guard = PICKER
        .get_or_init(|| Mutex::new(()))
        .try_lock()
        .map_err(|_| "已有路径选择窗口，请先完成或取消。")?;
    let powershell = crate::powershell_runtime()?;
    let mut command = Command::new(powershell);
    crate::configure_windows_powershell_environment(&mut command)?;
    command
        .args(["-NoProfile", "-STA", "-Command", PICKER_SCRIPT])
        .env(
            "DIANA_LINK_PICKER_KIND",
            if target == "deepseek" {
                "directory"
            } else {
                "file"
            },
        );
    crate::hide_console(&mut command);
    let output = command
        .output()
        .map_err(|_| "无法打开文件选择窗口；也可以直接粘贴完整路径。".to_string())?;
    if !output.status.success() {
        return Err("文件选择窗口未能完成；也可以直接粘贴完整路径。".into());
    }
    #[derive(Deserialize)]
    struct Picked {
        path: Option<String>,
    }
    let selected: Picked = serde_json::from_str(crate::clean_output(&output.stdout).trim())
        .map_err(|_| "未能读取所选路径，请重新选择或手动粘贴。".to_string())?;
    selected
        .path
        .map(|path| validate_path(target, &path).map(|path| path.to_string_lossy().into_owned()))
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static IDS: AtomicU64 = AtomicU64::new(0);
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "diana-app-link-test-{}-{stamp}-{}",
                std::process::id(),
                IDS.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn exe(&self, name: &str) -> PathBuf {
            let path = self.0.join("中文 空格 & $目录").join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, b"MZ-fixture-not-executable").unwrap();
            path
        }
        fn config(&self) -> PathBuf {
            self.0.join("settings/app-links.json")
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            // Only the unique, test-owned directory created above.
            assert!(self.0.starts_with(std::env::temp_dir()));
            assert!(self
                .0
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("diana-app-link-test-"));
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn first_read_is_read_only_and_never_creates_a_config() {
        let f = Fixture::new();
        assert!(saved_path_at(&f.config(), "cursor").unwrap().is_none());
        assert!(!f.config().exists());
    }
    #[test]
    fn stores_unicode_and_space_paths_and_preserves_other_targets() {
        let f = Fixture::new();
        let cursor = f.exe("Cursor.exe");
        let zcode = f.exe("ZCode.exe");
        save_at(
            &f.config(),
            "cursor",
            Some(&format!("\"{}\"", cursor.display())),
        )
        .unwrap();
        save_at(&f.config(), "zcode", Some(zcode.to_str().unwrap())).unwrap();
        assert_eq!(saved_path_at(&f.config(), "cursor").unwrap(), Some(cursor));
        assert_eq!(saved_path_at(&f.config(), "zcode").unwrap(), Some(zcode));
        save_at(&f.config(), "cursor", None).unwrap();
        assert!(saved_path_at(&f.config(), "cursor").unwrap().is_none());
        assert!(saved_path_at(&f.config(), "zcode").unwrap().is_some());
    }
    #[test]
    fn invalid_selection_does_not_overwrite_good_link() {
        let f = Fixture::new();
        let cursor = f.exe("Cursor.exe");
        save_at(&f.config(), "cursor", Some(cursor.to_str().unwrap())).unwrap();
        let before = fs::read(f.config()).unwrap();
        let wrong = f.exe("setup.exe");
        assert!(save_at(&f.config(), "cursor", Some(wrong.to_str().unwrap())).is_err());
        assert_eq!(before, fs::read(f.config()).unwrap());
    }
    #[test]
    fn removed_app_keeps_association_and_blocks_fallback() {
        let f = Fixture::new();
        let path = f.exe("Cursor.exe");
        save_at(&f.config(), "cursor", Some(path.to_str().unwrap())).unwrap();
        fs::remove_file(&path).unwrap();
        assert!(saved_path_at(&f.config(), "cursor").is_err());
        let report = describe(
            "cursor",
            read_config(&f.config()),
            Some(f.exe("another.exe")),
        );
        assert_eq!(report.state, "invalid");
        assert!(report.path.is_none());
        assert_eq!(report.saved_path.as_deref(), path.to_str());
    }
    #[test]
    fn malformed_and_future_configs_are_not_replaced() {
        let f = Fixture::new();
        let path = f.exe("Code.exe");
        fs::create_dir_all(f.config().parent().unwrap()).unwrap();
        for text in ["broken json", r#"{"schemaVersion":99,"targets":{}}"#] {
            fs::write(f.config(), text).unwrap();
            assert!(save_at(&f.config(), "vscode", Some(path.to_str().unwrap())).is_err());
            assert_eq!(text.as_bytes(), fs::read(f.config()).unwrap());
        }
    }
    #[test]
    fn rejects_urls_relative_paths_arguments_devices_and_streams() {
        for value in [
            "Cursor.exe",
            "../Cursor.exe",
            "https://example.com/Cursor.exe",
            r"\\server\share\Cursor.exe",
            r"\\?\C:\Cursor.exe",
            "C:\\Cursor.exe\n",
            r#""C:\Cursor.exe" --arg"#,
        ] {
            // A trailing newline is trimmed as paste whitespace, but still no such file exists.
            assert!(validate_path("cursor", value).is_err(), "{value}");
        }
        #[cfg(windows)]
        assert!(local_absolute_path(r"C:\Cursor.exe:stream").is_err());
    }
    #[test]
    fn requires_exe_name_and_header_without_executing_it() {
        let f = Fixture::new();
        for (target, name) in [
            ("cursor", "Cursor.exe"),
            ("grokbot", "Grok Bot.exe"),
            ("zcode", "ZCode.exe"),
            ("doubao", "Doubao.exe"),
            ("vscode", "Code.exe"),
            ("terminal", "WindowsTerminal.exe"),
        ] {
            let path = f.exe(name);
            assert!(validate_path(target, path.to_str().unwrap()).is_ok());
            fs::write(&path, b"not an exe").unwrap();
            assert!(validate_path(target, path.to_str().unwrap()).is_err());
        }
    }
    #[test]
    fn harness_requires_project_root_not_documents_or_web_subfolder() {
        let f = Fixture::new();
        assert!(validate_path("deepseek", f.0.to_str().unwrap()).is_err());
        fs::create_dir_all(f.0.join("apps/web")).unwrap();
        fs::write(f.0.join("package.json"), "{}").unwrap();
        fs::write(f.0.join("apps/web/package.json"), "{}").unwrap();
        assert!(validate_path("deepseek", f.0.to_str().unwrap()).is_ok());
        assert!(validate_path("deepseek", f.0.join("apps/web").to_str().unwrap()).is_err());
    }
    #[test]
    fn codex_is_system_managed_and_unknown_targets_are_rejected() {
        let f = Fixture::new();
        assert!(save_at(&f.config(), "codex", Some("C:\\ChatGPT.exe")).is_err());
        assert!(save_at(&f.config(), "../cursor", None).is_err());
        assert!(!f.config().exists());
        assert!(!describe("codex", Ok(LinkConfig::default()), None).can_choose);
    }
    #[test]
    fn writes_keep_metadata_and_backup_previous_settings() {
        let f = Fixture::new();
        fs::create_dir_all(f.config().parent().unwrap()).unwrap();
        let old = r#"{"schemaVersion":1,"targets":{},"note":"preserve"}"#;
        fs::write(f.config(), old).unwrap();
        save_at(
            &f.config(),
            "cursor",
            Some(f.exe("Cursor.exe").to_str().unwrap()),
        )
        .unwrap();
        assert_eq!(
            read_config(&f.config()).unwrap().extra.get("note").unwrap(),
            "preserve"
        );
        let backup = fs::read_dir(f.config().parent().unwrap())
            .unwrap()
            .filter_map(Result::ok)
            .find(|item| {
                item.file_name()
                    .to_string_lossy()
                    .starts_with("app-links-before-")
            })
            .unwrap();
        assert_eq!(fs::read_to_string(backup.path()).unwrap(), old);
    }
    #[test]
    fn cancel_is_not_a_save_and_picker_cannot_mount_or_start_target() {
        assert!(PICKER_SCRIPT.contains("$selected=$null"));
        for forbidden in [
            "Start-Process",
            "Stop-Process",
            "remote-debugging",
            "Set-Content",
            "Out-File",
            "Invoke-Expression",
        ] {
            assert!(!PICKER_SCRIPT.contains(forbidden));
        }
    }
}
