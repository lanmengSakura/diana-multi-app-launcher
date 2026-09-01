mod external_targets;
mod native_appearance;

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;

const SUPPORT_DIRECTORY: &str = "DianaCodexLauncher";
const RUNTIME_CHANNEL: &str = "universal-v1";
const COMPATIBILITY_MODE: &str = "runtime_probe";
const BUNDLED_MUSIC_BYTES: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/hopeful-dreamer.bin"));
const BUNDLED_MUSIC_FILENAME: &str = env!("DIANA_BUNDLED_MUSIC_FILENAME");
const BUNDLED_MUSIC_MIME: &str = env!("DIANA_BUNDLED_MUSIC_MIME");

const RUNTIME_FILES: &[(&str, &[u8])] = &[
    (
        "adapter.mjs",
        include_bytes!("../resources/diana-runtime/adapter.mjs"),
    ),
    (
        "manifest.json",
        include_bytes!("../resources/diana-runtime/manifest.json"),
    ),
    (
        "start-manual.ps1",
        include_bytes!("../resources/diana-runtime/start-manual.ps1"),
    ),
    (
        "restore-native.ps1",
        include_bytes!("../resources/diana-runtime/restore-native.ps1"),
    ),
    (
        "themes/diana-dark.css",
        include_bytes!("../resources/diana-runtime/themes/diana-dark.css"),
    ),
    (
        "themes/diana-light.css",
        include_bytes!("../resources/diana-runtime/themes/diana-light.css"),
    ),
    (
        "assets/acao-cheer-v1.png",
        include_bytes!("../../theme-preview/assets/acao-cheer-v1.png"),
    ),
    (
        "assets/acao-heart-v3.png",
        include_bytes!("../../theme-preview/assets/acao-heart-v3.png"),
    ),
    (
        "assets/diana-candy-lollipop-v1.png",
        include_bytes!("../../theme-preview/assets/diana-candy-lollipop-v1.png"),
    ),
    (
        "assets/diana-candy-wrapped-v1.png",
        include_bytes!("../../theme-preview/assets/diana-candy-wrapped-v1.png"),
    ),
    (
        "assets/diana-corner-cutout-v2.png",
        include_bytes!("../../theme-preview/assets/diana-corner-cutout-v2.png"),
    ),
    (
        "assets/diana-doodle-chalk-v2-approved.png",
        include_bytes!("../../theme-preview/assets/diana-doodle-chalk-v2-approved.png"),
    ),
    (
        "assets/diana-hand-star-reference-v2.png",
        include_bytes!("../../theme-preview/assets/diana-hand-star-reference-v2.png"),
    ),
    (
        "assets/diana-left-top-detailed-corner-mask-v7.png",
        include_bytes!("../../theme-preview/assets/diana-left-top-detailed-corner-mask-v7.png"),
    ),
    (
        "assets/diana-line-art-approved-upper.png",
        include_bytes!("../../theme-preview/assets/diana-line-art-approved-upper.png"),
    ),
    (
        "assets/diana-night-v3.png",
        include_bytes!("../../theme-preview/assets/diana-night-v3.png"),
    ),
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherStatus {
    stage: String,
    codex_running: bool,
    theme_channel_connected: bool,
    process_count: usize,
    main_process_id: Option<u32>,
    codex_version: Option<String>,
    codex_path: Option<String>,
    active_theme_mode: Option<String>,
    debug_port: Option<u16>,
    runtime_root: Option<String>,
    compatibility_mode: String,
    runtime_available: bool,
    native_appearance_managed: bool,
    action_required: Option<String>,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalTargetStatus {
    target: String,
    stage: String,
    running: bool,
    themed: bool,
    theme_state: String,
    theme_scope: String,
    process_count: usize,
    main_process_id: Option<u32>,
    executable: Option<String>,
    theme_root: Option<String>,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MusicTrackStatus {
    available: bool,
    file_name: Option<String>,
    mime_type: Option<String>,
    size_bytes: Option<u64>,
    issue: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InstalledCodexPackage {
    version: String,
    executable: String,
}

#[derive(Default)]
struct InstalledCodexCache {
    package: Option<InstalledCodexPackage>,
    checked_at: Option<Instant>,
}

#[derive(Clone, Default)]
struct CodexProcessSnapshot {
    process_count: usize,
    main_process_id: Option<u32>,
    main_command: Option<String>,
    codex_version: Option<String>,
    codex_path: Option<PathBuf>,
    debug_port: Option<u16>,
    loopback_debug: bool,
}

impl CodexProcessSnapshot {
    fn has_main_process(&self) -> bool {
        self.main_process_id.is_some()
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    status: String,
    adapter_version: String,
    codex_version: String,
    main_pid: u32,
    port: u16,
    #[serde(default = "default_theme_mode")]
    mode: String,
    started_at: String,
    #[serde(default)]
    applied_at: Option<String>,
    #[serde(default)]
    persistence: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherEvent<'a> {
    time_unix_ms: u64,
    event: &'a str,
    launcher_version: &'static str,
    codex_version: Option<String>,
    compatibility_mode: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit_code: Option<i32>,
}

fn default_theme_mode() -> String {
    "system".to_string()
}

fn validate_theme_mode(mode: &str) -> Result<&str, String> {
    match mode {
        "dark" | "light" | "system" => Ok(mode),
        _ => Err("主题模式必须是 dark、light 或 system。".to_string()),
    }
}

fn theme_label(mode: &str) -> &str {
    match mode {
        "dark" => "暗夜",
        "light" => "日间",
        "system" => "跟随系统",
        _ => "未知",
    }
}

fn extract_codex_version(path: &Path) -> Option<String> {
    let normalized = path.to_string_lossy();
    let normalized_lower = normalized.to_ascii_lowercase();
    let marker = "openai.codex_";
    let start = normalized_lower.find(marker)? + marker.len();
    let version = normalized[start..].split('_').next()?;
    if version.is_empty()
        || !version
            .chars()
            .all(|character| character.is_ascii_digit() || character == '.')
    {
        return None;
    }
    Some(version.to_string())
}

fn is_codex_package_process(name: &str, executable: Option<&Path>, command: &str) -> bool {
    let normalized_name = name.to_ascii_lowercase();
    let normalized_path = executable
        .map(|path| path.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let normalized_command = command.to_ascii_lowercase();
    let belongs_to_codex_package =
        normalized_path.contains("openai.codex_") || normalized_command.contains("openai.codex_");
    belongs_to_codex_package
        && matches!(
            normalized_name.as_str(),
            "chatgpt.exe" | "codex.exe" | "codex-code-mode-host.exe"
        )
}

fn is_main_codex_process(name: &str, command: &str) -> bool {
    name.eq_ignore_ascii_case("chatgpt.exe") && !command.to_ascii_lowercase().contains("--type=")
}

fn parse_debug_port(command: &str) -> Option<u16> {
    let marker = "--remote-debugging-port=";
    let lower = command.to_ascii_lowercase();
    let start = lower.find(marker)? + marker.len();
    let value = lower[start..].split_whitespace().next()?.trim_matches('"');
    value.parse().ok()
}

fn query_installed_codex() -> Option<InstalledCodexPackage> {
    let powershell = powershell_runtime().ok()?;
    let script = "$u=New-Object System.Text.UTF8Encoding($false);[Console]::OutputEncoding=$u;$OutputEncoding=$u;$p=Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction Stop;$e=Join-Path $p.InstallLocation 'app\\ChatGPT.exe';[pscustomobject]@{Version=$p.Version.ToString();Executable=$e}|ConvertTo-Json -Compress";
    let mut command = Command::new(powershell);
    configure_windows_powershell_environment(&mut command).ok()?;
    command
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(script);
    hide_console(&mut command);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).replace('\0', "");
    serde_json::from_str(text.trim_start_matches('\u{feff}').trim()).ok()
}

fn package_cache_is_fresh(cache: &InstalledCodexCache, now: Instant) -> bool {
    let Some(checked_at) = cache.checked_at else {
        return false;
    };
    let ttl = if cache.package.is_some() {
        Duration::from_secs(30)
    } else {
        Duration::from_secs(2)
    };
    now.saturating_duration_since(checked_at) < ttl
}

fn installed_codex() -> Option<InstalledCodexPackage> {
    static INSTALLED: OnceLock<Mutex<InstalledCodexCache>> = OnceLock::new();
    let cache = INSTALLED.get_or_init(|| Mutex::new(InstalledCodexCache::default()));
    let now = Instant::now();

    if let Ok(guard) = cache.lock() {
        if package_cache_is_fresh(&guard, now) {
            return guard.package.clone();
        }
    }

    let detected = query_installed_codex();
    if let Ok(mut guard) = cache.lock() {
        guard.package = detected.clone();
        guard.checked_at = Some(now);
    }
    detected
}

fn detect_codex_processes() -> CodexProcessSnapshot {
    let system = System::new_all();
    let mut snapshot = CodexProcessSnapshot::default();
    for (pid, process) in system.processes() {
        let name = process.name().to_string_lossy();
        let command = process
            .cmd()
            .iter()
            .map(|part| part.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ");
        let executable = process.exe();
        if !is_codex_package_process(&name, executable, &command) {
            continue;
        }
        snapshot.process_count += 1;
        if snapshot.codex_path.is_none() {
            snapshot.codex_path = executable.map(Path::to_path_buf);
        }
        if snapshot.codex_version.is_none() {
            snapshot.codex_version = executable.and_then(extract_codex_version);
        }
        if is_main_codex_process(&name, &command) {
            snapshot.main_process_id = Some(pid.as_u32());
            snapshot.main_command = Some(command.clone());
            snapshot.codex_path = executable.map(Path::to_path_buf);
            snapshot.codex_version = executable.and_then(extract_codex_version);
            snapshot.debug_port = parse_debug_port(&command);
            snapshot.loopback_debug = command
                .to_ascii_lowercase()
                .contains("--remote-debugging-address=127.0.0.1");
        }
    }
    if let Some(installed) = installed_codex() {
        if snapshot.codex_version.is_none() {
            snapshot.codex_version = Some(installed.version);
        }
        if snapshot.codex_path.is_none() {
            snapshot.codex_path = Some(PathBuf::from(installed.executable));
        }
    }
    snapshot
}

fn doubao_executable() -> Option<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(r"D:\Doubao\app\Doubao.exe"),
        PathBuf::from(r"D:\Doubao\Doubao.exe"),
    ];
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(local_app_data);
        candidates.push(
            local
                .join("Programs")
                .join("Doubao")
                .join("app")
                .join("Doubao.exe"),
        );
        candidates.push(local.join("Doubao").join("app").join("Doubao.exe"));
    }
    candidates.into_iter().find(|path| path.is_file())
}

fn doubao_theme_root() -> Option<PathBuf> {
    let local_app_data = env::var_os("LOCALAPPDATA")?;
    let versions = PathBuf::from(local_app_data)
        .join("DianaDoubaoTheme")
        .join("versions");
    let mut candidates = fs::read_dir(versions)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("extension"))
        .filter(|path| path.join("manifest.json").is_file())
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.pop()
}

fn detect_doubao_status() -> ExternalTargetStatus {
    let executable = doubao_executable();
    let theme_root = doubao_theme_root();
    let theme_hint = theme_root
        .as_ref()
        .map(|path| path.to_string_lossy().to_ascii_lowercase());
    let system = System::new_all();
    let mut process_count = 0usize;
    let mut main_process_id = None;
    let mut running_executable = None;
    let mut themed = false;

    for (pid, process) in system.processes() {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        if name != "doubao.exe" {
            continue;
        }
        process_count += 1;
        let command = process
            .cmd()
            .iter()
            .map(|part| part.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ");
        let command_lower = command.to_ascii_lowercase();
        if !command_lower.contains("--type=") {
            main_process_id = Some(pid.as_u32());
            running_executable = process.exe().map(Path::to_path_buf);
        }
        if command_lower.contains("--load-extension=")
            && (command_lower.contains("dianadoubaotheme")
                || theme_hint
                    .as_ref()
                    .map(|hint| command_lower.contains(hint))
                    .unwrap_or(false))
        {
            themed = true;
        }
    }

    let running = process_count > 0;
    let resolved_executable = running_executable.or(executable);
    let (stage, message) = if resolved_executable.is_none() {
        (
            "doubao_not_installed",
            "未检测到豆包浏览器；当前没有执行启动操作。".to_string(),
        )
    } else if theme_root.is_none() {
        (
            "doubao_theme_missing",
            "已检测到豆包浏览器，但尚未安装 Diana 豆包主题文件。".to_string(),
        )
    } else if themed {
        (
            "doubao_diana_running",
            "Diana 豆包正在运行；主题只作用于 doubao.com 工作区，不修改浏览器安装目录。"
                .to_string(),
        )
    } else if running {
        (
            "doubao_plain_running",
            "普通豆包正在运行。请完整退出豆包后再从这里启动，Chromium 单实例才能加载 Diana 扩展。"
                .to_string(),
        )
    } else {
        (
            "doubao_ready",
            "豆包与 Diana 主题文件均已就绪，可直接启动。日间/暗夜跟随豆包原生外观。".to_string(),
        )
    };

    ExternalTargetStatus {
        target: "doubao".to_string(),
        stage: stage.to_string(),
        running,
        themed,
        theme_state: if resolved_executable.is_none() {
            "unavailable"
        } else if theme_root.is_none() {
            "available"
        } else if themed {
            "mounted"
        } else if running {
            "plain"
        } else {
            "installed"
        }
        .to_string(),
        theme_scope: "browser_extension".to_string(),
        process_count,
        main_process_id,
        executable: resolved_executable.map(|path| path.to_string_lossy().into_owned()),
        theme_root: theme_root.map(|path| path.to_string_lossy().into_owned()),
        message,
    }
}

fn launch_doubao(themed: bool) -> Result<ExternalTargetStatus, String> {
    if themed {
        external_targets::ensure_doubao_theme()?;
    }
    let before = detect_doubao_status();
    if before.running {
        if themed && !before.themed {
            return Ok(before);
        }
        if !themed && before.themed {
            let mut status = before;
            status.message =
                "Diana 豆包正在运行。若要打开原版，请先完整退出豆包，再点击“打开原版”。"
                    .to_string();
            return Ok(status);
        }
    }

    let executable = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到豆包浏览器可执行文件。".to_string())?;
    let mut command = Command::new(&executable);
    if themed {
        let theme_root = before
            .theme_root
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| "未检测到 Diana 豆包主题文件。".to_string())?;
        command.arg(format!("--load-extension={}", theme_root.display()));
    }
    command.arg("https://www.doubao.com/chat/");
    command
        .spawn()
        .map_err(|error| format!("无法启动豆包浏览器：{error}"))?;
    std::thread::sleep(Duration::from_millis(1400));
    Ok(detect_doubao_status())
}

fn current_music_track_status() -> MusicTrackStatus {
    if BUNDLED_MUSIC_BYTES.is_empty() {
        return MusicTrackStatus {
            available: false,
            file_name: None,
            mime_type: None,
            size_bytes: None,
            issue: Some("当前安装包尚未内置《Hopeful Dreamer》音频。".to_string()),
        };
    }

    MusicTrackStatus {
        available: true,
        file_name: Some(BUNDLED_MUSIC_FILENAME.to_string()),
        mime_type: Some(BUNDLED_MUSIC_MIME.to_string()),
        size_bytes: Some(BUNDLED_MUSIC_BYTES.len() as u64),
        issue: None,
    }
}

fn support_root() -> Result<PathBuf, String> {
    let local_app_data = env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "无法确定当前用户的 LocalAppData 目录。".to_string())?;
    Ok(PathBuf::from(local_app_data)
        .join(SUPPORT_DIRECTORY)
        .join(RUNTIME_CHANNEL))
}

fn session_path() -> Result<PathBuf, String> {
    Ok(support_root()?.join("state").join("session.json"))
}

fn read_session() -> Option<SessionRecord> {
    let path = session_path().ok()?;
    let contents = fs::read_to_string(path).ok()?;
    parse_session(&contents)
}

fn parse_session(contents: &str) -> Option<SessionRecord> {
    serde_json::from_str(contents.trim_start_matches('\u{feff}')).ok()
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};

    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn verify_bundled_runtime_integrity() -> Result<(), String> {
    use std::collections::{HashMap, HashSet};

    let mut embedded_files = HashMap::new();
    for (relative, contents) in RUNTIME_FILES {
        let normalized = relative.replace('\\', "/");
        if embedded_files
            .insert(normalized.clone(), *contents)
            .is_some()
        {
            return Err(format!("启动器内置主题包包含重复路径：{normalized}"));
        }
    }

    let manifest_bytes = embedded_files
        .get("manifest.json")
        .ok_or_else(|| "启动器内置主题包缺少 manifest.json。".to_string())?;
    let manifest: serde_json::Value = serde_json::from_slice(manifest_bytes)
        .map_err(|error| format!("无法读取启动器内置主题清单：{error}"))?;
    let expected_hashes = manifest
        .get("sha256")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "启动器内置主题清单缺少 sha256 表。".to_string())?;

    let mut protected_paths = HashSet::new();
    for (relative, expected_value) in expected_hashes {
        let normalized = relative.replace('\\', "/");
        let expected = expected_value
            .as_str()
            .ok_or_else(|| format!("主题清单哈希格式无效：{relative}"))?;
        let contents = embedded_files
            .get(&normalized)
            .ok_or_else(|| format!("启动器内置主题包缺少受保护文件：{relative}"))?;
        let actual = sha256_hex(contents);
        if actual != expected {
            return Err(format!(
                "启动器内置主题包校验失败：SHA-256 mismatch: {relative}。请更新或重新下载启动器。"
            ));
        }
        protected_paths.insert(normalized);
    }

    for relative in embedded_files.keys() {
        if (relative.starts_with("themes/") || relative.starts_with("assets/"))
            && !protected_paths.contains(relative)
        {
            return Err(format!("主题清单未覆盖内置资源：{relative}"));
        }
    }

    Ok(())
}

fn write_session(session: &SessionRecord) -> Result<(), String> {
    let path = session_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建会话状态目录：{error}"))?;
    }
    let contents = serde_json::to_vec_pretty(session)
        .map_err(|error| format!("无法序列化会话状态：{error}"))?;
    fs::write(path, contents).map_err(|error| format!("无法保存会话状态：{error}"))
}

fn session_matches(snapshot: &CodexProcessSnapshot, session: &SessionRecord) -> bool {
    snapshot.main_process_id == Some(session.main_pid)
        && snapshot.debug_port == Some(session.port)
        && snapshot.loopback_debug
        && snapshot.codex_version.as_deref() == Some(session.codex_version.as_str())
}

fn ensure_runtime_files() -> Result<PathBuf, String> {
    verify_bundled_runtime_integrity()?;
    let root = support_root()?;
    for (relative, contents) in RUNTIME_FILES {
        let destination = root.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建 Diana 本机目录：{error}"))?;
        }
        let current = fs::read(&destination).ok();
        if current.as_deref() != Some(*contents) {
            fs::write(&destination, contents)
                .map_err(|error| format!("无法写入 Diana 本机运行文件：{error}"))?;
        }
    }
    fs::create_dir_all(root.join("logs"))
        .map_err(|error| format!("无法创建 Diana 日志目录：{error}"))?;
    fs::create_dir_all(root.join("state"))
        .map_err(|error| format!("无法创建 Diana 状态目录：{error}"))?;
    Ok(root)
}

fn find_node_runtime() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(user_profile) = env::var_os("USERPROFILE") {
        candidates.push(
            PathBuf::from(user_profile)
                .join(".cache")
                .join("codex-runtimes")
                .join("codex-primary-runtime")
                .join("dependencies")
                .join("node")
                .join("bin")
                .join("node.exe"),
        );
    }
    if let Some(program_files) = env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("nodejs").join("node.exe"));
    }
    if let Some(path_value) = env::var_os("PATH") {
        candidates
            .extend(env::split_paths(&path_value).map(|directory| directory.join("node.exe")));
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| "没有找到可用的 Node.js 运行时。".to_string())
}

fn powershell_runtime() -> Result<PathBuf, String> {
    let system_root =
        env::var_os("SystemRoot").ok_or_else(|| "无法确定 Windows 系统目录。".to_string())?;
    let candidate = PathBuf::from(system_root)
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if candidate.is_file() {
        Ok(candidate)
    } else {
        Err("没有找到 Windows PowerShell。".to_string())
    }
}

fn windows_powershell_module_path_for(system_root: &Path, program_files: &Path) -> String {
    format!(
        r"{}\WindowsPowerShell\Modules;{}\System32\WindowsPowerShell\v1.0\Modules",
        program_files.display(),
        system_root.display()
    )
}

pub(crate) fn windows_powershell_module_path() -> Result<String, String> {
    let system_root =
        env::var_os("SystemRoot").ok_or_else(|| "无法确定 Windows 系统目录。".to_string())?;
    let program_files = env::var_os("ProgramFiles")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));
    Ok(windows_powershell_module_path_for(
        &PathBuf::from(system_root),
        &program_files,
    ))
}

pub(crate) fn configure_windows_powershell_environment(
    command: &mut Command,
) -> Result<(), String> {
    command.env("PSModulePath", windows_powershell_module_path()?);
    Ok(())
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

fn clean_output(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .replace('\0', "")
        .trim()
        .chars()
        .take(1200)
        .collect()
}

fn check_output(output: Output, context: &str) -> Result<String, String> {
    let stdout = clean_output(&output.stdout);
    let stderr = clean_output(&output.stderr);
    if output.status.success() {
        Ok(stdout)
    } else {
        let details = if !stderr.is_empty() { stderr } else { stdout };
        Err(if details.is_empty() {
            format!("{context}失败，退出码 {:?}。", output.status.code())
        } else {
            format!("{context}失败：{details}")
        })
    }
}

fn append_launcher_event(root: &Path, event: &str, mode: Option<&str>, exit_code: Option<i32>) {
    let time_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    let entry = LauncherEvent {
        time_unix_ms,
        event,
        launcher_version: env!("CARGO_PKG_VERSION"),
        codex_version: installed_codex().map(|package| package.version),
        compatibility_mode: COMPATIBILITY_MODE,
        mode,
        exit_code,
    };
    let Ok(serialized) = serde_json::to_string(&entry) else {
        return;
    };
    let log_dir = root.join("logs");
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }
    let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("launcher-events.jsonl"))
    else {
        return;
    };
    let _ = writeln!(file, "{serialized}");
}

fn invoke_adapter(
    root: &Path,
    command_name: &str,
    session: &SessionRecord,
    mode: Option<&str>,
) -> Result<String, String> {
    let node = find_node_runtime()?;
    let powershell = powershell_runtime()?;
    let mut command = Command::new(node);
    command
        .arg(root.join("adapter.mjs"))
        .arg(command_name)
        .arg("--port")
        .arg(session.port.to_string())
        .arg("--main-pid")
        .arg(session.main_pid.to_string())
        .env("DIANA_POWERSHELL_EXE", powershell);
    configure_windows_powershell_environment(&mut command)?;
    if let Some(mode) = mode {
        command.arg("--mode").arg(mode);
    }
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("无法启动 Diana 适配器：{error}"))?;
    check_output(output, "Diana 适配器")
}

fn run_mount_script(root: &Path, mode: &str) -> Result<String, String> {
    let node = find_node_runtime()?;
    let powershell = powershell_runtime()?;
    let mut command = Command::new(&powershell);
    configure_windows_powershell_environment(&mut command)?;
    command
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-STA")
        .arg("-File")
        .arg(root.join("start-manual.ps1"))
        .arg("-Mode")
        .arg(mode)
        .arg("-NodePath")
        .arg(node)
        .env("DIANA_POWERSHELL_EXE", powershell);
    hide_console(&mut command);
    append_launcher_event(root, "mount_script_started", Some(mode), None);
    let output = match command.output() {
        Ok(output) => output,
        Err(error) => {
            append_launcher_event(root, "mount_script_spawn_failed", Some(mode), None);
            return Err(format!("无法启动 Diana 挂载流程：{error}"));
        }
    };
    append_launcher_event(
        root,
        if output.status.success() {
            "mount_script_finished"
        } else {
            "mount_script_failed"
        },
        Some(mode),
        output.status.code(),
    );
    check_output(output, "启动并挂载 Diana")
}

fn run_restore_script(root: &Path) -> Result<String, String> {
    let node = find_node_runtime()?;
    let powershell = powershell_runtime()?;
    let mut command = Command::new(&powershell);
    configure_windows_powershell_environment(&mut command)?;
    command
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-STA")
        .arg("-File")
        .arg(root.join("restore-native.ps1"))
        .arg("-NodePath")
        .arg(node)
        .env("DIANA_POWERSHELL_EXE", powershell);
    hide_console(&mut command);
    append_launcher_event(root, "restore_script_started", None, None);
    let output = match command.output() {
        Ok(output) => output,
        Err(error) => {
            append_launcher_event(root, "restore_script_spawn_failed", None, None);
            return Err(format!("无法启动恢复流程：{error}"));
        }
    };
    append_launcher_event(
        root,
        if output.status.success() {
            "restore_script_finished"
        } else {
            "restore_script_failed"
        },
        None,
        output.status.code(),
    );
    check_output(output, "恢复原版 Codex")
}

fn status_from_snapshot(
    snapshot: CodexProcessSnapshot,
    action: Option<&str>,
    session: Option<&SessionRecord>,
) -> LauncherStatus {
    let session_connected = session
        .map(|record| session_matches(&snapshot, record))
        .unwrap_or(false);
    let runtime_available = find_node_runtime().is_ok();
    let stage = if snapshot.codex_version.is_none() {
        "codex_not_installed"
    } else if !runtime_available {
        "runtime_missing"
    } else if session_connected {
        "diana_session_active"
    } else if snapshot.has_main_process() && snapshot.debug_port.is_some() {
        "unmanaged_debug_session"
    } else if snapshot.has_main_process() {
        "plain_codex_running"
    } else if snapshot.process_count > 0 {
        "codex_closing"
    } else {
        "codex_stopped"
    };
    let active_mode = if session_connected {
        session.map(|record| record.mode.clone())
    } else {
        None
    };
    let pid_text = snapshot
        .main_process_id
        .map(|pid| pid.to_string())
        .unwrap_or_else(|| "未知".to_string());
    let version_text = snapshot
        .codex_version
        .clone()
        .unwrap_or_else(|| "未知版本".to_string());
    let (message, action_required) = match stage {
        "codex_not_installed" => (
            "暂未检测到 Microsoft Store 版 Codex；启动器会自动重试安装检测，不需要先手动打开 Codex。".to_string(),
            Some("install_codex".to_string()),
        ),
        "runtime_missing" => (
            "没有找到可用的本机 Node.js 运行组件；本次不会启动调试通道或挂载主题。".to_string(),
            Some("install_runtime".to_string()),
        ),
        "diana_session_active" => {
            let record = session.expect("connected session must exist");
            (
                format!(
                    "Diana {}已挂载到 Codex v{}（PID {}，本次端口 {}）。启动器没有常驻后台。",
                    theme_label(&record.mode),
                    version_text,
                    pid_text,
                    record.port
                ),
                None,
            )
        }
        "unmanaged_debug_session" => (
            format!(
                "检测到带调试参数的 Codex（PID {}），但它不属于当前 Diana 会话；为避免误接管，本次没有操作。",
                pid_text
            ),
            Some("reopen_native".to_string()),
        ),
        "plain_codex_running" => {
            let prefix = if action == Some("mount") { "尚未挂载：" } else { "" };
            (
                format!(
                    "{}普通 Codex v{} 正在运行（PID {}，共 {} 个相关进程）。请先从“文件 > 退出 ChatGPT”完整退出，再点击启动；现有任务没有被关闭。",
                    prefix, version_text, pid_text, snapshot.process_count
                ),
                Some("exit_codex".to_string()),
            )
        }
        "codex_closing" => (
            format!(
                "Codex 主窗口已经退出，但仍有 {} 个相关进程正在收尾；稍后再试。",
                snapshot.process_count
            ),
            Some("wait".to_string()),
        ),
        _ => (
            format!(
                "已检测到 Codex v{}；可直接启动，挂载前会自动检查当前界面结构。",
                version_text
            ),
            None,
        ),
    };
    LauncherStatus {
        stage: stage.to_string(),
        codex_running: snapshot.has_main_process(),
        theme_channel_connected: session_connected,
        process_count: snapshot.process_count,
        main_process_id: snapshot.main_process_id,
        codex_version: snapshot.codex_version,
        codex_path: snapshot
            .codex_path
            .map(|path| path.to_string_lossy().into_owned()),
        active_theme_mode: active_mode,
        debug_port: if session_connected {
            snapshot.debug_port
        } else {
            None
        },
        runtime_root: support_root()
            .ok()
            .map(|path| path.to_string_lossy().into_owned()),
        compatibility_mode: COMPATIBILITY_MODE.to_string(),
        runtime_available,
        native_appearance_managed: native_appearance::is_managed(),
        action_required,
        message,
    }
}

fn current_status(action: Option<&str>) -> LauncherStatus {
    let snapshot = detect_codex_processes();
    let session = read_session();
    status_from_snapshot(snapshot, action, session.as_ref())
}

fn mount_or_switch(mode: &str) -> Result<LauncherStatus, String> {
    validate_theme_mode(mode)?;
    let snapshot = detect_codex_processes();
    if snapshot.codex_version.is_none() || find_node_runtime().is_err() {
        let session = read_session();
        return Ok(status_from_snapshot(
            snapshot,
            Some("mount"),
            session.as_ref(),
        ));
    }
    let root = ensure_runtime_files()?;
    let mut session = read_session();
    if snapshot.has_main_process() {
        if let Some(record) = session.as_mut() {
            if session_matches(&snapshot, record) {
                if record.mode != mode {
                    let mut status = status_from_snapshot(snapshot, Some("mount"), Some(record));
                    status.action_required = Some("exit_codex".to_string());
                    status.message = format!(
                        "为完整切换到 Diana {}，请从“文件 > 退出 ChatGPT”退出；全部进程结束后，启动器会同步原生日/夜配色，再重新启动并挂载。",
                        theme_label(mode)
                    );
                    return Ok(status);
                }
                invoke_adapter(&root, "apply", record, Some(mode))?;
                record.mode = mode.to_string();
                record.status = "applied".to_string();
                write_session(record)?;
                return Ok(current_status(Some("mount")));
            }
        }
        return Ok(status_from_snapshot(
            snapshot,
            Some("mount"),
            session.as_ref(),
        ));
    }
    if snapshot.process_count > 0 {
        return Ok(status_from_snapshot(
            snapshot,
            Some("mount"),
            session.as_ref(),
        ));
    }
    let guard = detect_codex_processes();
    if guard.process_count > 0 {
        return Ok(status_from_snapshot(guard, Some("mount"), session.as_ref()));
    }
    let backup_created = native_appearance::apply(mode)?;
    append_launcher_event(
        &root,
        if backup_created {
            "native_appearance_backed_up_and_applied"
        } else {
            "native_appearance_applied"
        },
        Some(mode),
        None,
    );
    run_mount_script(&root, mode)?;
    let status = current_status(Some("mount"));
    if !status.theme_channel_connected {
        return Err(format!(
            "启动流程结束，但没有验证到 Diana 挂载会话：{}",
            status.message
        ));
    }
    Ok(status)
}

fn restore_native() -> Result<LauncherStatus, String> {
    let root = ensure_runtime_files()?;
    let snapshot = detect_codex_processes();
    let session = read_session();
    if snapshot.has_main_process() {
        let mut status = status_from_snapshot(snapshot, Some("restore"), session.as_ref());
        status.action_required = Some("exit_codex".to_string());
        status.message = "请先从“文件 > 退出 ChatGPT”完整退出；全部进程结束后，启动器会恢复原生外观配置并从官方入口重开。".to_string();
        return Ok(status);
    }
    if snapshot.process_count > 0 {
        return Ok(status_from_snapshot(
            snapshot,
            Some("restore"),
            session.as_ref(),
        ));
    }
    let restored = native_appearance::restore()?;
    append_launcher_event(
        &root,
        if restored {
            "native_appearance_restored"
        } else {
            "native_appearance_restore_not_needed"
        },
        None,
        None,
    );
    run_restore_script(&root)?;
    let mut status = current_status(Some("restore"));
    if status.theme_channel_connected {
        return Err("恢复流程结束后仍检测到 Diana 调试会话。".to_string());
    }
    status.message = format!(
        "已撤下 Diana 样式，并从官方入口正常重开 Codex{}。",
        status
            .main_process_id
            .map(|pid| format!("（PID {pid}）"))
            .unwrap_or_default()
    );
    Ok(status)
}

#[tauri::command]
fn get_launcher_status() -> LauncherStatus {
    current_status(None)
}

#[tauri::command]
async fn run_launcher_action(action: String, theme_mode: String) -> Result<LauncherStatus, String> {
    tauri::async_runtime::spawn_blocking(move || match action.as_str() {
        "mount" => mount_or_switch(&theme_mode),
        "restore" => restore_native(),
        _ => Err("未知启动器操作。".to_string()),
    })
    .await
    .map_err(|error| format!("启动器后台任务异常：{error}"))?
}

#[tauri::command]
fn get_external_target_status(target: String) -> Result<ExternalTargetStatus, String> {
    match target.as_str() {
        "doubao" => Ok(detect_doubao_status()),
        _ => external_targets::get_status(&target),
    }
}

#[tauri::command]
async fn run_external_target_action(
    target: String,
    action: String,
    theme_mode: Option<String>,
) -> Result<ExternalTargetStatus, String> {
    tauri::async_runtime::spawn_blocking(move || match (target.as_str(), action.as_str()) {
        ("doubao", "launch_theme") => launch_doubao(true),
        ("doubao", "launch_native") => launch_doubao(false),
        _ => external_targets::run_action(&target, &action, theme_mode.as_deref()),
    })
    .await
    .map_err(|error| format!("目标应用启动任务异常：{error}"))?
}

#[tauri::command]
fn get_music_track_status() -> MusicTrackStatus {
    current_music_track_status()
}

#[tauri::command]
fn load_music_track() -> Result<tauri::ipc::Response, String> {
    if BUNDLED_MUSIC_BYTES.is_empty() {
        return Err("当前安装包尚未内置《Hopeful Dreamer》音频。".to_string());
    }
    Ok(tauri::ipc::Response::new(BUNDLED_MUSIC_BYTES.to_vec()))
}

#[tauri::command]
fn quit_launcher(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_launcher_status,
            run_launcher_action,
            get_external_target_status,
            run_external_target_action,
            get_music_track_status,
            load_music_track,
            quit_launcher
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Diana Multi-App Launcher");
}

#[cfg(test)]
mod tests {
    use super::{
        append_launcher_event, current_music_track_status, extract_codex_version,
        is_codex_package_process, is_main_codex_process, package_cache_is_fresh, parse_debug_port,
        parse_session, validate_theme_mode, verify_bundled_runtime_integrity,
        windows_powershell_module_path_for, InstalledCodexCache, InstalledCodexPackage,
        BUNDLED_MUSIC_BYTES, BUNDLED_MUSIC_FILENAME, BUNDLED_MUSIC_MIME,
    };
    use std::fs;
    use std::path::Path;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    #[test]
    fn extracts_store_package_version() {
        let path = Path::new(
            r"C:\Program Files\WindowsApps\OpenAI.Codex_26.818.5229.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe",
        );
        assert_eq!(
            extract_codex_version(path).as_deref(),
            Some("26.818.5229.0")
        );
    }

    #[test]
    fn ignores_regular_chatgpt_processes() {
        let path = Path::new(
            r"C:\Program Files\WindowsApps\OpenAI.ChatGPT_1.0.0.0_x64__example\app\ChatGPT.exe",
        );
        assert!(!is_codex_package_process("ChatGPT.exe", Some(path), ""));
    }

    #[test]
    fn identifies_codex_desktop_main_process() {
        let path = Path::new(
            r"C:\Program Files\WindowsApps\OpenAI.Codex_26.818.5229.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe",
        );
        assert!(is_codex_package_process("ChatGPT.exe", Some(path), ""));
        assert!(is_main_codex_process("ChatGPT.exe", "ChatGPT.exe"));
        assert!(!is_main_codex_process(
            "ChatGPT.exe",
            "ChatGPT.exe --type=renderer"
        ));
    }

    #[test]
    fn reads_debug_port_from_launcher_command() {
        assert_eq!(
            parse_debug_port(
                "ChatGPT.exe --remote-debugging-address=127.0.0.1 --remote-debugging-port=53122"
            ),
            Some(53122)
        );
        assert_eq!(parse_debug_port("ChatGPT.exe"), None);
    }

    #[test]
    fn accepts_only_supported_theme_modes() {
        assert!(validate_theme_mode("dark").is_ok());
        assert!(validate_theme_mode("light").is_ok());
        assert!(validate_theme_mode("system").is_ok());
        assert!(validate_theme_mode("pink").is_err());
    }

    #[test]
    fn bundled_runtime_manifest_matches_embedded_bytes() {
        verify_bundled_runtime_integrity()
            .expect("embedded Diana runtime must match its SHA-256 manifest");
    }

    #[test]
    fn retries_failed_package_detection_but_temporarily_caches_success() {
        let now = Instant::now();
        let failed = InstalledCodexCache {
            package: None,
            checked_at: Some(now - Duration::from_secs(3)),
        };
        assert!(!package_cache_is_fresh(&failed, now));

        let recent_failure = InstalledCodexCache {
            package: None,
            checked_at: Some(now - Duration::from_secs(1)),
        };
        assert!(package_cache_is_fresh(&recent_failure, now));

        let successful = InstalledCodexCache {
            package: Some(InstalledCodexPackage {
                version: "26.820.9563.0".to_string(),
                executable: "C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\ChatGPT.exe"
                    .to_string(),
            }),
            checked_at: Some(now - Duration::from_secs(20)),
        };
        assert!(package_cache_is_fresh(&successful, now));
    }

    #[test]
    fn reads_windows_powershell_utf8_bom_session() {
        let record = parse_session(
            "\u{feff}{\"status\":\"applied\",\"adapterVersion\":\"1.2.0-launcher-rc7\",\"codexVersion\":\"26.820.7780.0\",\"mainPid\":10852,\"port\":65427,\"mode\":\"dark\",\"startedAt\":\"2026-08-27T02:49:39+08:00\",\"appliedAt\":\"2026-08-27T02:49:45+08:00\",\"persistence\":false}",
        )
        .expect("PowerShell UTF-8 BOM session should parse");
        assert_eq!(record.main_pid, 10852);
        assert_eq!(record.port, 65427);
        assert_eq!(record.mode, "dark");
    }

    #[test]
    fn isolates_windows_powershell_module_path() {
        let module_path = windows_powershell_module_path_for(
            Path::new(r"C:\Windows"),
            Path::new(r"C:\Program Files"),
        );
        assert_eq!(
            module_path,
            r"C:\Program Files\WindowsPowerShell\Modules;C:\Windows\System32\WindowsPowerShell\v1.0\Modules"
        );
        assert!(!module_path.contains("codex-primary-runtime"));
    }

    #[test]
    fn writes_redacted_launcher_event_log() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("diana-launcher-log-{unique}"));
        append_launcher_event(&root, "mount_script_failed", Some("dark"), Some(1));

        let log_dir = root.join("logs");
        let log_path = log_dir.join("launcher-events.jsonl");
        let content = fs::read_to_string(&log_path).expect("launcher event log should exist");
        assert!(content.contains("mount_script_failed"));
        assert!(content.contains("\"mode\":\"dark\""));
        assert!(content.contains("\"exitCode\":1"));
        assert!(!content.contains("NodePath"));
        assert!(!content.contains("127.0.0.1"));

        fs::remove_file(log_path).expect("test log file should be removable");
        fs::remove_dir(log_dir).expect("test log directory should be removable");
        fs::remove_dir(root).expect("test root directory should be removable");
    }

    #[test]
    fn bundled_music_status_matches_compiled_payload() {
        let status = current_music_track_status();
        assert_eq!(status.available, !BUNDLED_MUSIC_BYTES.is_empty());
        if status.available {
            assert_eq!(status.file_name.as_deref(), Some(BUNDLED_MUSIC_FILENAME));
            assert_eq!(status.mime_type.as_deref(), Some(BUNDLED_MUSIC_MIME));
            assert_eq!(status.size_bytes, Some(BUNDLED_MUSIC_BYTES.len() as u64));
            assert!(status.issue.is_none());
        } else {
            assert!(status.issue.is_some());
        }
    }
}
