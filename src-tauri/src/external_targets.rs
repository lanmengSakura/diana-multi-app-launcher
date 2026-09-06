use crate::{
    clean_output, configure_windows_powershell_environment, find_node_runtime, hide_console,
    powershell_runtime, ExternalTargetStatus, RUNTIME_FILES,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use sysinfo::System;

const MULTI_APP_CHANNEL: &str = "multi-app-v1";
const DOUBAO_THEME_VERSION: &str = "0.1.1";
const VSCODE_THEME_VERSION: &str = "0.2.0";
const CURSOR_THEME_VERSION: &str = "0.1.0";
const EXPECTED_CURSOR_VERSION: &str = "3.17.21";
const CURSOR_ADAPTER_VERSION: &str = "experimental-cursor-3.17.21-v1";
// Keep the previously verified bundle usable while accepting the day-art repair.
// Both entries still require an exact manifest and every listed file hash.
const CURSOR_ADAPTER_MANIFEST_SHA256: &[&str] = &[
    "D0FE9031D40C7D7C08BBBCBA15E263014195B39429B3ED399452A356613ED8E5",
    "00117864949FA9F37C8902B1E64D55E44A60E8F869CE4FF8C80BFF8A6FCF0A03",
];
const EXPECTED_GROK_VERSION: &str = "0.28.0";
const GROK_ADAPTER_VERSION: &str = "experimental-grok-bot-0.28.0-v2";
const GROK_ADAPTER_MANIFEST_SHA256: &str =
    "0823F21D31FBE0CC3407747689DBA3FDA33E6EB56609313EC451AE606D98A653";
const EXPECTED_ZCODE_VERSION: &str = "3.6.5.4145";
const EXPECTED_ZCODE_SIGNER_THUMBPRINT: &str = "6F7B147DC610F91425750D2449C46002C3385BCF";
const ZCODE_ADAPTER_VERSION: &str = "experimental-3.6.5-v3";

const CATALOG: &[u8] = include_bytes!("../resources/theme-packs/catalog.json");

const DOUBAO_FILES: &[(&str, &[u8])] = &[
    (
        "manifest.json",
        include_bytes!("../resources/theme-packs/doubao/extension/manifest.json"),
    ),
    (
        "diana.js",
        include_bytes!("../resources/theme-packs/doubao/extension/diana.js"),
    ),
    (
        "diana.css",
        include_bytes!("../resources/theme-packs/doubao/extension/diana.css"),
    ),
];

const TERMINAL_FILES: &[(&str, &[u8])] = &[
    (
        "diana-terminal.json",
        include_bytes!("../resources/theme-packs/terminal/diana-terminal.json"),
    ),
    (
        "diana-terminal-bg-v2.png",
        include_bytes!("../resources/theme-packs/terminal/diana-terminal-bg-v2.png"),
    ),
];

const VSCODE_FILES: &[(&str, &[u8])] = &[
    (
        "package.json",
        include_bytes!("../resources/theme-packs/vscode/package.json"),
    ),
    (
        "themes/diana-night-color-theme.json",
        include_bytes!("../resources/theme-packs/vscode/themes/diana-night-color-theme.json"),
    ),
    (
        "themes/diana-day-color-theme.json",
        include_bytes!("../resources/theme-packs/vscode/themes/diana-day-color-theme.json"),
    ),
    (
        "visual-layer/diana-workbench.css",
        include_bytes!("../resources/theme-packs/vscode/visual-layer/diana-workbench.css"),
    ),
    (
        "visual-layer/diana-doodle-color.png",
        include_bytes!("../resources/theme-packs/vscode/visual-layer/diana-doodle-color.png"),
    ),
    (
        "assets/diana-pixel-dango.png",
        include_bytes!("../icons/128x128.png"),
    ),
];

const CURSOR_FILES: &[(&str, &[u8])] = &[
    (
        "package.json",
        include_bytes!("../resources/theme-packs/cursor/package.json"),
    ),
    (
        "themes/diana-night-color-theme.json",
        include_bytes!("../resources/theme-packs/cursor/themes/diana-night-color-theme.json"),
    ),
    (
        "themes/diana-day-color-theme.json",
        include_bytes!("../resources/theme-packs/cursor/themes/diana-day-color-theme.json"),
    ),
];

const DEEPSEEK_FILES: &[(&str, &[u8])] = &[(
    "diana.css",
    include_bytes!("../resources/theme-packs/deepseek/diana.css"),
)];

const ZCODE_FILES: &[(&str, &[u8])] = &[
    (
        "zcode-tokens.css",
        include_bytes!("../resources/theme-packs/zcode/zcode-tokens.css"),
    ),
    (
        "zcode-artwork-contract.css",
        include_bytes!("../resources/theme-packs/zcode/zcode-artwork-contract.css"),
    ),
];

const ZCODE_RUNTIME_FILES: &[(&str, &[u8])] = &[
    (
        "adapter.mjs",
        include_bytes!("../resources/theme-packs/zcode/runtime/adapter.mjs"),
    ),
    (
        "runtime-template.js",
        include_bytes!("../resources/theme-packs/zcode/runtime/runtime-template.js"),
    ),
    (
        "theme.css",
        include_bytes!("../resources/theme-packs/zcode/runtime/theme.css"),
    ),
    (
        "Start-DianaZCode.ps1",
        include_bytes!("../resources/theme-packs/zcode/runtime/Start-DianaZCode.ps1"),
    ),
    (
        "Disable-DianaZCode.ps1",
        include_bytes!("../resources/theme-packs/zcode/runtime/Disable-DianaZCode.ps1"),
    ),
    (
        "Get-DianaZCodeStatus.ps1",
        include_bytes!("../resources/theme-packs/zcode/runtime/Get-DianaZCodeStatus.ps1"),
    ),
    (
        "Restore-DianaZCode.ps1",
        include_bytes!("../resources/theme-packs/zcode/runtime/Restore-DianaZCode.ps1"),
    ),
    (
        "README-LOCAL.txt",
        include_bytes!("../resources/theme-packs/zcode/runtime/README-LOCAL.txt"),
    ),
    (
        "Validate-DianaZCode.ps1",
        include_bytes!("../resources/theme-packs/zcode/runtime/Validate-DianaZCode.ps1"),
    ),
    (
        "manifest.sha256",
        include_bytes!("../resources/theme-packs/zcode/runtime/manifest.sha256"),
    ),
];

const SHARED_ASSET_MAP: &[(&str, &str)] = &[
    ("acao-cheer-v1.png", "assets/acao-cheer-v1.png"),
    ("acao-heart-v3.png", "assets/acao-heart-v3.png"),
    (
        "diana-candy-lollipop-v1.png",
        "assets/diana-candy-lollipop-v1.png",
    ),
    (
        "diana-candy-wrapped-v1.png",
        "assets/diana-candy-wrapped-v1.png",
    ),
    (
        "diana-corner-cutout-v2.png",
        "assets/diana-corner-cutout-v2.png",
    ),
    (
        "diana-doodle-chalk-v2-approved.png",
        "assets/diana-doodle-chalk-v2-approved.png",
    ),
    (
        "diana-hand-star-reference-v2.png",
        "assets/diana-hand-star-reference-v2.png",
    ),
    (
        "diana-left-top-detailed-corner-mask-v7.png",
        "assets/diana-left-top-detailed-corner-mask-v7.png",
    ),
    (
        "diana-line-art-approved-upper.png",
        "assets/diana-line-art-approved-upper.png",
    ),
    ("diana-night-v3.png", "assets/diana-night-v3.png"),
];

const DOUBAO_ASSET_MAP: &[(&str, &str)] = &[
    ("acao-cheer.png", "assets/acao-cheer-v1.png"),
    ("acao-heart.png", "assets/acao-heart-v3.png"),
    ("diana-candy.png", "assets/diana-candy-wrapped-v1.png"),
    (
        "diana-corner-line.png",
        "assets/diana-left-top-detailed-corner-mask-v7.png",
    ),
    (
        "diana-doodle.png",
        "assets/diana-doodle-chalk-v2-approved.png",
    ),
    ("diana-lollipop.png", "assets/diana-candy-lollipop-v1.png"),
    (
        "diana-portrait-day.png",
        "assets/diana-corner-cutout-v2.png",
    ),
    ("diana-portrait-night.png", "assets/diana-night-v3.png"),
    ("diana-star.png", "assets/diana-hand-star-reference-v2.png"),
    (
        "diana-upper-line.png",
        "assets/diana-line-art-approved-upper.png",
    ),
];

const VSCODE_ART_MAP: &[(&str, &str)] = &[
    ("diana-portrait.png", "assets/diana-night-v3.png"),
    (
        "diana-portrait-day.png",
        "assets/diana-corner-cutout-v2.png",
    ),
    (
        "diana-doodle-chalk.png",
        "assets/diana-doodle-chalk-v2-approved.png",
    ),
    (
        "diana-corner-line.png",
        "assets/diana-left-top-detailed-corner-mask-v7.png",
    ),
    ("diana-star.png", "assets/diana-hand-star-reference-v2.png"),
    ("diana-candy.png", "assets/diana-candy-wrapped-v1.png"),
    ("diana-lollipop.png", "assets/diana-candy-lollipop-v1.png"),
];

#[derive(Default)]
struct ProcessSnapshot {
    process_count: usize,
    main_process_id: Option<u32>,
    executable: Option<PathBuf>,
    main_command: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZcodeSessionRecord {
    status: String,
    adapter_version: String,
    version: String,
    pid: u32,
    port: u16,
    theme: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorAdapterRegistration {
    root: String,
    adapter_version: String,
    tested_version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorSessionRecord {
    status: String,
    adapter_version: String,
    version: String,
    pid: u32,
    port: u16,
    mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrokAdapterRegistration {
    root: String,
    adapter_version: String,
    tested_version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrokSessionRecord {
    status: String,
    adapter_version: String,
    version: String,
    pid: u32,
    port: u16,
    mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZcodeTrustReport {
    file_version: String,
    product_version: String,
    signature: String,
    signer_thumbprint: String,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct EditorManagedState {
    settings_path: String,
    previous_values: BTreeMap<String, Option<String>>,
}

fn local_app_data() -> Result<PathBuf, String> {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定当前用户的 LocalAppData 目录。".to_string())
}

fn multi_app_root() -> Result<PathBuf, String> {
    Ok(local_app_data()?
        .join("DianaCodexLauncher")
        .join(MULTI_APP_CHANNEL))
}

fn state_root() -> Result<PathBuf, String> {
    Ok(multi_app_root()?.join("state"))
}

fn write_if_changed(path: &Path, contents: &[u8]) -> Result<(), String> {
    if fs::read(path).ok().as_deref() == Some(contents) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建主题目录 {}：{error}", parent.display()))?;
    }
    fs::write(path, contents)
        .map_err(|error| format!("无法写入主题文件 {}：{error}", path.display()))
}

fn runtime_bytes(relative: &str) -> Result<&'static [u8], String> {
    RUNTIME_FILES
        .iter()
        .find(|(candidate, _)| *candidate == relative)
        .map(|(_, contents)| *contents)
        .ok_or_else(|| format!("内置共享素材缺失：{relative}"))
}

fn write_files(root: &Path, files: &[(&str, &[u8])]) -> Result<(), String> {
    for (relative, contents) in files {
        write_if_changed(&root.join(relative), contents)?;
    }
    Ok(())
}

fn write_shared_assets(root: &Path, mapping: &[(&str, &str)]) -> Result<(), String> {
    for (destination, source) in mapping {
        write_if_changed(&root.join(destination), runtime_bytes(source)?)?;
    }
    Ok(())
}

fn ensure_catalog() -> Result<PathBuf, String> {
    let root = multi_app_root()?;
    write_if_changed(&root.join("catalog.json"), CATALOG)?;
    Ok(root)
}

fn extract_pack(target: &str) -> Result<PathBuf, String> {
    let root = ensure_catalog()?.join("packs").join(target);
    match target {
        "doubao" => {
            write_files(&root, DOUBAO_FILES)?;
            write_shared_assets(&root.join("assets"), DOUBAO_ASSET_MAP)?;
        }
        "terminal" => write_files(&root, TERMINAL_FILES)?,
        "vscode" => {
            write_files(&root, VSCODE_FILES)?;
            write_shared_assets(&root.join("assets/artwork"), VSCODE_ART_MAP)?;
        }
        "deepseek" => {
            write_files(&root, DEEPSEEK_FILES)?;
            write_shared_assets(&root.join("assets"), SHARED_ASSET_MAP)?;
        }
        "zcode" => {
            write_files(&root, ZCODE_FILES)?;
            write_shared_assets(&root.join("assets"), SHARED_ASSET_MAP)?;
        }
        _ => return Err("未知主题资源包。".to_string()),
    }
    Ok(root)
}

fn find_in_path(file_name: &str) -> Option<PathBuf> {
    env::var_os("PATH").and_then(|value| {
        env::split_paths(&value)
            .map(|directory| directory.join(file_name))
            .find(|candidate| candidate.is_file())
    })
}

fn is_primary_app_command(command: &str) -> bool {
    !command.contains("--type=") && !command.contains("resources\\glm\\zcode.cjs")
}

fn detect_named_processes(names: &[&str], preferred_path: Option<&Path>) -> ProcessSnapshot {
    let system = System::new_all();
    let preferred = preferred_path.map(|path| path.to_string_lossy().to_ascii_lowercase());
    let mut snapshot = ProcessSnapshot::default();
    for (pid, process) in system.processes() {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        if !names
            .iter()
            .any(|candidate| name == candidate.to_ascii_lowercase())
        {
            continue;
        }
        if let Some(expected) = preferred.as_ref() {
            let actual = process
                .exe()
                .map(|path| path.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if !actual.is_empty() && actual != *expected {
                continue;
            }
        }
        snapshot.process_count += 1;
        if snapshot.main_process_id.is_none() {
            snapshot.main_process_id = Some(pid.as_u32());
            snapshot.executable = process.exe().map(Path::to_path_buf);
        }
        let command = process
            .cmd()
            .iter()
            .map(|part| part.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_lowercase();
        if is_primary_app_command(&command) {
            snapshot.main_process_id = Some(pid.as_u32());
            snapshot.executable = process.exe().map(Path::to_path_buf);
            snapshot.main_command = Some(command);
        }
    }
    snapshot
}

fn is_cursor_main_command(command: &str) -> bool {
    !command.contains("--type=")
        && !command.contains("resources\\app\\extensions\\")
        && !command.contains("resources/app/extensions/")
}

fn cursor_debug_port(command: &str) -> Option<u16> {
    command
        .split_whitespace()
        .find_map(|part| part.strip_prefix("--remote-debugging-port="))
        .and_then(|value| value.parse::<u16>().ok())
}

fn cursor_has_loopback_debug(command: &str) -> bool {
    command.contains("--remote-debugging-address=127.0.0.1") && cursor_debug_port(command).is_some()
}

fn detect_cursor_processes(preferred_path: Option<&Path>) -> ProcessSnapshot {
    let system = System::new_all();
    let preferred = preferred_path.map(|path| path.to_string_lossy().to_ascii_lowercase());
    let mut snapshot = ProcessSnapshot::default();
    for (pid, process) in system.processes() {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        if name != "cursor.exe" {
            continue;
        }
        if let Some(expected) = preferred.as_ref() {
            let actual = process
                .exe()
                .map(|path| path.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if !actual.is_empty() && actual != *expected {
                continue;
            }
        }
        snapshot.process_count += 1;
        let command = process
            .cmd()
            .iter()
            .map(|part| part.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_lowercase();
        if is_cursor_main_command(&command) {
            snapshot.main_process_id = Some(pid.as_u32());
            snapshot.executable = process.exe().map(Path::to_path_buf);
            snapshot.main_command = Some(command);
        } else if snapshot.executable.is_none() {
            snapshot.executable = process.exe().map(Path::to_path_buf);
        }
    }
    snapshot
}

fn spawn_detached(executable: &Path, args: &[String]) -> Result<(), String> {
    let mut command = Command::new(executable);
    command.args(args);
    if let Some(parent) = executable.parent() {
        command.current_dir(parent);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法启动 {}：{error}", executable.display()))
}

fn browser_open_command(url: &str) -> Result<Command, String> {
    let parsed = tauri::Url::parse(url).map_err(|_| "网页地址无效。".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || url.chars().any(char::is_control)
    {
        return Err("仅允许通过默认浏览器打开 HTTP(S) 网页。".to_string());
    }
    // Let the registered URL handler open the page, rather than passing it to
    // explorer.exe as a filesystem target. Keep DSH's bootstrap token out of
    // the PowerShell command line and any errors.
    let mut command = Command::new(powershell_runtime()?);
    configure_windows_powershell_environment(&mut command)?;
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            r#"$ErrorActionPreference='Stop'; try { $launch=[System.Diagnostics.ProcessStartInfo]::new(); $launch.FileName=$env:DIANA_BROWSER_URL; $launch.UseShellExecute=$true; [System.Diagnostics.Process]::Start($launch) | Out-Null } catch { exit 1 }"#,
        ])
        .env("DIANA_BROWSER_URL", url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console(&mut command);
    Ok(command)
}

fn open_url(url: &str) -> Result<(), String> {
    let result = browser_open_command(url)?
        .status()
        .map_err(|_| "无法调用 Windows 默认浏览器。".to_string())?;
    if result.success() {
        Ok(())
    } else {
        Err("Windows 未能打开默认浏览器，请检查 HTTP(S) 默认应用关联。".to_string())
    }
}

pub(crate) fn ensure_doubao_theme() -> Result<PathBuf, String> {
    let root = local_app_data()?
        .join("DianaDoubaoTheme")
        .join("versions")
        .join(DOUBAO_THEME_VERSION)
        .join("extension");
    write_files(&root, DOUBAO_FILES)?;
    write_shared_assets(&root.join("assets"), DOUBAO_ASSET_MAP)?;
    let _ = extract_pack("doubao")?;
    Ok(root)
}

fn terminal_fragment_root() -> Result<PathBuf, String> {
    Ok(local_app_data()?
        .join("Microsoft")
        .join("Windows Terminal")
        .join("Fragments")
        .join("DianaCodexTheme"))
}

fn terminal_theme_state(available: bool, installed: bool) -> &'static str {
    if !available {
        "unavailable"
    } else if installed {
        "installed"
    } else {
        "available"
    }
}

fn terminal_status() -> ExternalTargetStatus {
    let executable = find_in_path("wt.exe").or_else(|| {
        local_app_data()
            .ok()
            .map(|root| root.join("Microsoft/WindowsApps/wt.exe"))
            .filter(|path| path.exists())
    });
    let fragment = terminal_fragment_root().ok();
    let installed = fragment
        .as_ref()
        .map(|root| {
            root.join("diana-terminal.json").is_file()
                && root.join("diana-terminal-bg-v2.png").is_file()
        })
        .unwrap_or(false);
    let snapshot = detect_named_processes(&["windowsterminal.exe"], None);
    let (stage, message) = if executable.is_none() {
        (
            "terminal_not_installed",
            "未检测到 Windows Terminal（wt.exe）。".to_string(),
        )
    } else if installed {
        (
            "terminal_ready",
            "Diana PowerShell / CMD 已安装。主题与原版均新开窗口，不会改动已有终端会话。"
                .to_string(),
        )
    } else {
        (
            "terminal_pack_ready",
            "暗夜终端皮肤已内置，点击后会安装到当前用户的 Windows Terminal Fragment 目录。"
                .to_string(),
        )
    };
    ExternalTargetStatus {
        target: "terminal".to_string(),
        stage: stage.to_string(),
        running: snapshot.process_count > 0,
        themed: installed,
        theme_state: terminal_theme_state(executable.is_some(), installed).to_string(),
        theme_scope: "native_fragment".to_string(),
        process_count: snapshot.process_count,
        main_process_id: snapshot.main_process_id,
        executable: executable.map(|path| path.to_string_lossy().into_owned()),
        theme_root: fragment.map(|path| path.to_string_lossy().into_owned()),
        message,
    }
}

const DIANA_TERMINAL_PROFILES: [&str; 2] = [
    "{9f604e64-7bc5-4f8a-9d55-7fe0a6fe27d1}",
    "{376e4b97-e3c1-42ea-a6ee-5605714340e7}",
];
const NATIVE_POWERSHELL_PROFILE: &str = "{61c54bbd-c2c6-5271-96e7-009a87ff44bf}";

fn native_terminal_profile(current: Option<&str>, previous: Option<&str>) -> String {
    current
        .filter(|id| !DIANA_TERMINAL_PROFILES.contains(id))
        .or_else(|| previous.filter(|id| !DIANA_TERMINAL_PROFILES.contains(id)))
        .unwrap_or(NATIVE_POWERSHELL_PROFILE)
        .to_string()
}

fn restore_terminal_default() -> Result<String, String> {
    let local = local_app_data()?;
    let legacy: serde_json::Value =
        fs::read(terminal_fragment_root()?.join("diana-terminal.state"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
    let candidates = [
        local.join("Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json"),
        local.join("Microsoft/Windows Terminal/settings.json"),
    ];
    let Some(settings) = candidates.into_iter().find(|path| path.is_file()) else {
        return Ok(NATIVE_POWERSHELL_PROFILE.to_string());
    };
    let contents =
        fs::read_to_string(&settings).map_err(|error| format!("无法读取终端设置：{error}"))?;
    let current = jsonc_raw_value(&contents, "defaultProfile")
        .and_then(|raw| serde_json::from_str::<String>(&raw).ok());
    // The old installer already recorded this field. Never replay its whole settings backup.
    let previous = legacy
        .get("SettingsPath")
        .and_then(|v| v.as_str())
        .filter(|path| Path::new(path) == settings)
        .and_then(|_| {
            legacy
                .get("PreviousDefaultProfile")
                .and_then(|v| v.as_str())
        });
    let native = native_terminal_profile(current.as_deref(), previous);
    if current
        .as_deref()
        .is_some_and(|id| DIANA_TERMINAL_PROFILES.contains(&id))
    {
        let backup = settings.with_extension("json.diana-before-native.bak");
        if !backup.exists() {
            write_if_changed(&backup, contents.as_bytes())?;
        }
        let updated = replace_jsonc_raw(
            &contents,
            "defaultProfile",
            &serde_json::to_string(&native).unwrap(),
        );
        write_if_changed(&settings, updated.as_bytes())?;
    }
    Ok(native)
}

fn launch_terminal(themed: bool) -> Result<ExternalTargetStatus, String> {
    let before = terminal_status();
    let executable = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到 Windows Terminal。".to_string())?;
    let args = if themed {
        let fragment = terminal_fragment_root()?;
        write_files(&fragment, TERMINAL_FILES)?;
        let _ = extract_pack("terminal")?;
        vec![
            "-w".to_string(),
            "new".to_string(),
            "-p".to_string(),
            "Diana PowerShell".to_string(),
        ]
    } else {
        vec![
            "-w".to_string(),
            "new".to_string(),
            "new-tab".to_string(),
            "-p".to_string(),
            restore_terminal_default()?,
        ]
    };
    spawn_detached(&executable, &args)?;
    std::thread::sleep(Duration::from_millis(650));
    let mut status = terminal_status();
    if !themed {
        status.message =
            "已按原生配置新开终端；旧 Diana 窗口保留，避免中断其中的命令。Diana 配置仍可再次使用。"
                .to_string();
    }
    Ok(status)
}

fn vscode_executable() -> Option<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(r"D:\Apps\Visual Studio Code\Code.exe"),
        PathBuf::from(r"C:\Program Files\Microsoft VS Code\Code.exe"),
    ];
    if let Some(local) = env::var_os("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local)
                .join("Programs")
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .or_else(|| find_in_path("code.exe"))
}

fn vscode_settings_path(executable: &Path) -> Result<PathBuf, String> {
    let root = executable
        .parent()
        .ok_or_else(|| "VS Code 安装路径无效。".to_string())?;
    let portable = root
        .join("data")
        .join("user-data")
        .join("User")
        .join("settings.json");
    if root.join("data").is_dir() || portable.is_file() {
        return Ok(portable);
    }
    let app_data = env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定 VS Code 用户设置目录。".to_string())?;
    Ok(app_data.join("Code").join("User").join("settings.json"))
}

fn vscode_extensions_root(executable: &Path) -> Result<PathBuf, String> {
    let root = executable
        .parent()
        .ok_or_else(|| "VS Code 安装路径无效。".to_string())?;
    let portable = root.join("data").join("extensions");
    if root.join("data").is_dir() || portable.is_dir() {
        return Ok(portable);
    }
    let profile = env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定 VS Code 扩展目录。".to_string())?;
    Ok(profile.join(".vscode").join("extensions"))
}

fn vscode_extension_path(executable: &Path) -> Result<PathBuf, String> {
    Ok(vscode_extensions_root(executable)?.join(format!(
        "lanmengsakura.diana-vscode-theme-{VSCODE_THEME_VERSION}"
    )))
}

fn jsonc_raw_value(contents: &str, key: &str) -> Option<String> {
    let marker = format!("\"{key}\"");
    let start = contents.find(&marker)? + marker.len();
    let colon = contents[start..].find(':')? + start + 1;
    let value_start = contents[colon..]
        .char_indices()
        .find(|(_, character)| !character.is_whitespace())
        .map(|(offset, _)| colon + offset)?;
    let bytes = contents.as_bytes();
    if bytes.get(value_start) == Some(&b'\"') {
        let mut escaped = false;
        for index in value_start + 1..bytes.len() {
            match bytes[index] {
                b'\\' if !escaped => escaped = true,
                b'\"' if !escaped => return Some(contents[value_start..=index].to_string()),
                _ => escaped = false,
            }
        }
        return None;
    }
    let end = contents[value_start..]
        .find(|character: char| character == ',' || character == '\n' || character == '}')
        .map(|offset| value_start + offset)
        .unwrap_or(contents.len());
    Some(contents[value_start..end].trim().to_string())
}

fn replace_jsonc_raw(contents: &str, key: &str, raw_value: &str) -> String {
    let marker = format!("\"{key}\"");
    if let Some(key_index) = contents.find(&marker) {
        let after_key = key_index + marker.len();
        if let Some(colon_offset) = contents[after_key..].find(':') {
            let colon = after_key + colon_offset + 1;
            if let Some((value_offset, _)) = contents[colon..]
                .char_indices()
                .find(|(_, character)| !character.is_whitespace())
            {
                let value_start = colon + value_offset;
                let bytes = contents.as_bytes();
                let value_end = if bytes.get(value_start) == Some(&b'\"') {
                    let mut escaped = false;
                    let mut end = value_start + 1;
                    for index in value_start + 1..bytes.len() {
                        match bytes[index] {
                            b'\\' if !escaped => escaped = true,
                            b'\"' if !escaped => {
                                end = index + 1;
                                break;
                            }
                            _ => escaped = false,
                        }
                    }
                    end
                } else {
                    contents[value_start..]
                        .find(|character: char| {
                            character == ',' || character == '\n' || character == '}'
                        })
                        .map(|offset| value_start + offset)
                        .unwrap_or(contents.len())
                };
                return format!(
                    "{}{}{}",
                    &contents[..value_start],
                    raw_value,
                    &contents[value_end..]
                );
            }
        }
    }

    let closing = contents.rfind('}').unwrap_or(contents.len());
    let before = &contents[..closing];
    let needs_comma = before
        .chars()
        .rev()
        .find(|character| !character.is_whitespace())
        .map(|character| character != '{' && character != ',')
        .unwrap_or(false);
    format!(
        "{}{}\n  \"{}\": {}\n{}",
        before.trim_end(),
        if needs_comma { "," } else { "" },
        key,
        raw_value,
        &contents[closing..]
    )
}

fn remove_jsonc_property(contents: &str, key: &str) -> String {
    let marker = format!("\"{key}\"");
    let Some(index) = contents.find(&marker) else {
        return contents.to_string();
    };
    let line_start = contents[..index]
        .rfind('\n')
        .map(|position| position + 1)
        .unwrap_or(0);
    let line_end = contents[index..]
        .find('\n')
        .map(|offset| index + offset + 1)
        .unwrap_or(contents.len());
    let mut updated = format!("{}{}", &contents[..line_start], &contents[line_end..]);
    if updated.contains(",\n}") {
        updated = updated.replace(",\n}", "\n}");
    }
    updated
}

fn vscode_state_path() -> Result<PathBuf, String> {
    Ok(state_root()?.join("vscode-managed-settings.json"))
}

fn ensure_vscode_extension(executable: &Path) -> Result<PathBuf, String> {
    let extension = vscode_extension_path(executable)?;
    write_files(&extension, VSCODE_FILES)?;
    write_shared_assets(&extension.join("assets/artwork"), VSCODE_ART_MAP)?;
    let _ = extract_pack("vscode")?;
    Ok(extension)
}

fn set_editor_theme(
    settings: &Path,
    state_path: &Path,
    product_name: &str,
    mode: &str,
) -> Result<PathBuf, String> {
    if let Some(parent) = settings.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建 {product_name} 设置目录：{error}"))?;
    }
    let original = fs::read_to_string(&settings).unwrap_or_else(|_| "{}\n".to_string());
    let managed_keys = [
        "workbench.colorTheme",
        "workbench.preferredDarkColorTheme",
        "workbench.preferredLightColorTheme",
        "window.autoDetectColorScheme",
    ];
    if !state_path.is_file() {
        let previous_values = managed_keys
            .iter()
            .map(|key| {
                let raw = jsonc_raw_value(&original, key);
                let previous = if product_name == "VS Code" {
                    raw.map(|value| native_vscode_theme_value(&value))
                } else {
                    raw
                };
                ((*key).to_string(), previous)
            })
            .collect::<BTreeMap<_, _>>();
        let state = EditorManagedState {
            settings_path: settings.to_string_lossy().into_owned(),
            previous_values,
        };
        write_if_changed(
            &state_path,
            &serde_json::to_vec_pretty(&state)
                .map_err(|error| format!("无法保存 {product_name} 恢复状态：{error}"))?,
        )?;
    }

    let mut updated = original;
    updated = replace_jsonc_raw(
        &updated,
        "workbench.preferredDarkColorTheme",
        "\"Diana Night\"",
    );
    updated = replace_jsonc_raw(
        &updated,
        "workbench.preferredLightColorTheme",
        "\"Diana Day\"",
    );
    match mode {
        "light" => {
            updated = replace_jsonc_raw(&updated, "workbench.colorTheme", "\"Diana Day\"");
            updated = replace_jsonc_raw(&updated, "window.autoDetectColorScheme", "false");
        }
        "system" => {
            updated = replace_jsonc_raw(&updated, "window.autoDetectColorScheme", "true");
        }
        _ => {
            updated = replace_jsonc_raw(&updated, "workbench.colorTheme", "\"Diana Night\"");
            updated = replace_jsonc_raw(&updated, "window.autoDetectColorScheme", "false");
        }
    }
    write_if_changed(&settings, updated.as_bytes())?;
    Ok(settings.to_path_buf())
}

fn restore_editor_theme(
    settings: &Path,
    state_path: &Path,
    product_name: &str,
) -> Result<(), String> {
    if !state_path.is_file() {
        if product_name == "VS Code" {
            // Older manual installs did not save a pre-Diana theme. Keep every unrelated setting.
            let mut contents = fs::read_to_string(settings)
                .map_err(|error| format!("无法读取 VS Code 设置：{error}"))?;
            let original = contents.clone();
            for key in [
                "workbench.colorTheme",
                "workbench.preferredDarkColorTheme",
                "workbench.preferredLightColorTheme",
            ] {
                if let Some(raw) = jsonc_raw_value(&contents, key) {
                    let native = native_vscode_theme_value(&raw);
                    if native != raw {
                        contents = replace_jsonc_raw(&contents, key, &native);
                    }
                }
            }
            if contents != original {
                let backup = settings.with_extension("json.diana-before-native.bak");
                if !backup.exists() {
                    write_if_changed(&backup, original.as_bytes())?;
                }
                write_if_changed(settings, contents.as_bytes())?;
            }
        }
        return Ok(());
    }
    let state: EditorManagedState = serde_json::from_slice(
        &fs::read(&state_path)
            .map_err(|error| format!("无法读取 {product_name} 恢复状态：{error}"))?,
    )
    .map_err(|error| format!("{product_name} 恢复状态无效：{error}"))?;
    if settings.to_string_lossy() != state.settings_path {
        return Err(format!(
            "{product_name} 设置路径已经变化，未自动覆盖新的用户配置。"
        ));
    }
    let mut updated = fs::read_to_string(&settings).unwrap_or_else(|_| "{}\n".to_string());
    for (key, previous) in state.previous_values {
        updated = if let Some(raw) = previous {
            let raw = if product_name == "VS Code" {
                native_vscode_theme_value(&raw)
            } else {
                raw
            };
            replace_jsonc_raw(&updated, &key, &raw)
        } else {
            remove_jsonc_property(&updated, &key)
        };
    }
    write_if_changed(&settings, updated.as_bytes())?;
    fs::remove_file(&state_path)
        .map_err(|error| format!("无法完成 VS Code 恢复状态收尾：{error}"))?;
    Ok(())
}

fn native_vscode_theme_value(raw: &str) -> String {
    match raw {
        "\"Diana Night\"" => "\"Dark Modern\"".to_string(),
        "\"Diana Day\"" => "\"Light Modern\"".to_string(),
        _ => raw.to_string(),
    }
}

fn set_vscode_theme(executable: &Path, mode: &str) -> Result<PathBuf, String> {
    set_editor_theme(
        &vscode_settings_path(executable)?,
        &vscode_state_path()?,
        "VS Code",
        mode,
    )
}

fn restore_vscode_theme(executable: &Path) -> Result<(), String> {
    restore_editor_theme(
        &vscode_settings_path(executable)?,
        &vscode_state_path()?,
        "VS Code",
    )
}

fn vscode_visual_layer_present(executable: &Path) -> bool {
    let Some(root) = executable.parent() else {
        return false;
    };
    let mut roots = vec![root.to_path_buf()];
    // Current portable builds keep resources under a commit-named child directory.
    if let Ok(entries) = fs::read_dir(root) {
        roots.extend(
            entries
                .flatten()
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .chars()
                        .all(|c| c.is_ascii_hexdigit())
                        && entry.path().is_dir()
                })
                .map(|entry| entry.path()),
        );
    }
    roots.into_iter().any(|root| {
        fs::read_to_string(root.join("resources/app/out/vs/workbench/workbench.desktop.main.css"))
            .map(|contents| contents.contains("DIANA_VSCODE_VISUAL_LAYER_START"))
            .unwrap_or(false)
    })
}

fn vscode_theme_state(
    available: bool,
    extension_installed: bool,
    selected: bool,
    visual_layer: bool,
) -> &'static str {
    if !available {
        "unavailable"
    } else if extension_installed && selected && visual_layer {
        "deployed"
    } else if extension_installed && selected {
        "selected"
    } else if extension_installed {
        "installed"
    } else {
        "available"
    }
}

fn vscode_status() -> ExternalTargetStatus {
    let executable = vscode_executable();
    let snapshot = detect_named_processes(&["code.exe"], executable.as_deref());
    let extension = executable
        .as_deref()
        .and_then(|path| vscode_extension_path(path).ok());
    let settings = executable
        .as_deref()
        .and_then(|path| vscode_settings_path(path).ok());
    let selected = settings
        .as_ref()
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|contents| {
            matches!(
                jsonc_raw_value(&contents, "workbench.colorTheme").as_deref(),
                Some("\"Diana Night\"") | Some("\"Diana Day\"")
            )
        })
        .unwrap_or(false);
    let extension_installed = extension
        .as_ref()
        .map(|path| path.join("package.json").is_file())
        .unwrap_or(false);
    let visual_layer = executable
        .as_deref()
        .map(vscode_visual_layer_present)
        .unwrap_or(false);
    let (stage, message) = if executable.is_none() {
        (
            "vscode_not_installed",
            "未检测到 Visual Studio Code。".to_string(),
        )
    } else if extension_installed && selected {
        (
            "vscode_diana_ready",
            if visual_layer {
                "Diana 日夜配色已选择；美术层跟随颜色主题。先选日间 / 暗夜，再点击主按钮应用。"
                    .to_string()
            } else {
                "Diana 官方颜色主题已就绪；完整美术蓝图已随启动器携带，但不会默认改写 VS Code 安装资源。"
                    .to_string()
            },
        )
    } else {
        (
            "vscode_pack_ready",
            "Diana VS Code 日夜颜色主题已内置，点击后安装到当前用户扩展目录。".to_string(),
        )
    };
    ExternalTargetStatus {
        target: "vscode".to_string(),
        stage: stage.to_string(),
        running: snapshot.process_count > 0,
        themed: extension_installed && selected,
        theme_state: vscode_theme_state(
            executable.is_some(),
            extension_installed,
            selected,
            visual_layer,
        )
        .to_string(),
        theme_scope: if visual_layer {
            "legacy_visual_layer"
        } else {
            "color_theme"
        }
        .to_string(),
        process_count: snapshot.process_count,
        main_process_id: snapshot.main_process_id,
        executable: executable.map(|path| path.to_string_lossy().into_owned()),
        theme_root: extension.map(|path| path.to_string_lossy().into_owned()),
        message,
    }
}

fn launch_vscode(themed: bool, mode: &str) -> Result<ExternalTargetStatus, String> {
    let before = vscode_status();
    let executable = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到 Visual Studio Code。".to_string())?;
    if themed {
        ensure_vscode_extension(&executable)?;
        set_vscode_theme(&executable, mode)?;
    } else {
        restore_vscode_theme(&executable)?;
    }
    spawn_detached(&executable, &["--reuse-window".to_string()])?;
    std::thread::sleep(Duration::from_millis(850));
    let mut status = vscode_status();
    if !themed {
        status.message = "已恢复原生颜色主题；Diana 美术层仅在 Diana 主题下显示。旧安装没有恢复记录时使用对应的内置 Modern 主题。".to_string();
    }
    Ok(status)
}

fn cursor_executable() -> Option<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(r"D:\Apps\Cursor\Cursor.exe"),
        PathBuf::from(r"C:\Program Files\Cursor\Cursor.exe"),
    ];
    if let Some(local) = env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(local);
        candidates.push(local.join("Programs").join("cursor").join("Cursor.exe"));
        candidates.push(local.join("Programs").join("Cursor").join("Cursor.exe"));
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn cursor_settings_path(executable: &Path) -> Result<PathBuf, String> {
    let root = executable
        .parent()
        .ok_or_else(|| "Cursor 安装路径无效。".to_string())?;
    let portable = root
        .join("data")
        .join("user-data")
        .join("User")
        .join("settings.json");
    if root.join("data").is_dir() || portable.is_file() {
        return Ok(portable);
    }
    let app_data = env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定 Cursor 用户设置目录。".to_string())?;
    Ok(app_data.join("Cursor").join("User").join("settings.json"))
}

fn cursor_extensions_root(executable: &Path) -> Result<PathBuf, String> {
    let root = executable
        .parent()
        .ok_or_else(|| "Cursor 安装路径无效。".to_string())?;
    let portable = root.join("data").join("extensions");
    if root.join("data").is_dir() || portable.is_dir() {
        return Ok(portable);
    }
    let profile = env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定 Cursor 扩展目录。".to_string())?;
    Ok(profile.join(".cursor").join("extensions"))
}

fn cursor_extension_path(executable: &Path) -> Result<PathBuf, String> {
    Ok(cursor_extensions_root(executable)?.join(format!(
        "lanmengsakura.diana-cursor-theme-{CURSOR_THEME_VERSION}"
    )))
}

fn cursor_state_path() -> Result<PathBuf, String> {
    Ok(state_root()?.join("cursor-managed-settings.json"))
}

fn cursor_adapter_registration_path() -> Result<PathBuf, String> {
    Ok(state_root()?.join("cursor-adapter.json"))
}

fn cursor_adapter_is_complete(root: &Path) -> bool {
    root.join("adapter.mjs").is_file()
        && root.join("theme.css").is_file()
        && root.join("SHA256SUMS.txt").is_file()
        && root.join("README-LOCAL.txt").is_file()
}

fn cursor_adapter_root() -> Option<PathBuf> {
    if let Some(explicit) = env::var_os("DIANA_CURSOR_ADAPTER_ROOT") {
        let root = PathBuf::from(explicit);
        if cursor_adapter_is_complete(&root) {
            return Some(root);
        }
    }

    let registration_path = cursor_adapter_registration_path().ok()?;
    let registration: CursorAdapterRegistration = fs::read_to_string(registration_path)
        .ok()
        .and_then(|contents| serde_json::from_str(contents.trim_start_matches('\u{feff}')).ok())?;
    if registration.adapter_version != CURSOR_ADAPTER_VERSION
        || registration.tested_version != EXPECTED_CURSOR_VERSION
    {
        return None;
    }
    let root = PathBuf::from(registration.root);
    cursor_adapter_is_complete(&root).then_some(root)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let contents = fs::read(path)
        .map_err(|error| format!("无法读取本机适配器文件 {}：{error}", path.display()))?;
    let mut hasher = Sha256::new();
    hasher.update(contents);
    Ok(format!("{:X}", hasher.finalize()))
}

fn verify_cursor_adapter(root: &Path) -> Result<(), String> {
    let manifest_path = root.join("SHA256SUMS.txt");
    let manifest_hash = sha256_file(&manifest_path)?;
    if !CURSOR_ADAPTER_MANIFEST_SHA256.contains(&manifest_hash.as_str()) {
        return Err("本机 Cursor 适配器清单与已验证版本不一致；本次不会执行。".to_string());
    }
    let manifest = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("无法读取本机 Cursor 适配器清单：{error}"))?;
    for line in manifest
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let (expected, relative) = line
            .split_once("  ")
            .ok_or_else(|| "本机 Cursor 适配器清单格式无效。".to_string())?;
        let relative = Path::new(relative.trim());
        if relative.is_absolute()
            || !relative
                .components()
                .all(|component| matches!(component, std::path::Component::Normal(_)))
        {
            return Err("本机 Cursor 适配器清单包含越界路径；本次不会执行。".to_string());
        }
        let actual = sha256_file(&root.join(relative))?;
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            return Err(format!(
                "本机 Cursor 适配器文件校验失败：{}；本次不会执行。",
                relative.display()
            ));
        }
    }
    Ok(())
}

fn read_cursor_session(root: &Path) -> Option<CursorSessionRecord> {
    let contents = fs::read_to_string(root.join("state").join("session.json")).ok()?;
    serde_json::from_str(contents.trim_start_matches('\u{feff}')).ok()
}

fn cursor_session_matches(snapshot: &ProcessSnapshot, session: &CursorSessionRecord) -> bool {
    session.adapter_version == CURSOR_ADAPTER_VERSION
        && session.version == EXPECTED_CURSOR_VERSION
        && snapshot.main_process_id == Some(session.pid)
        && snapshot
            .main_command
            .as_deref()
            .map(|command| {
                cursor_has_loopback_debug(command)
                    && cursor_debug_port(command) == Some(session.port)
            })
            .unwrap_or(false)
}

fn run_cursor_adapter(root: &Path, action: &str, mode: &str) -> Result<String, String> {
    verify_cursor_adapter(root)?;
    let node = find_node_runtime()?;
    let mut command = Command::new(node);
    command.arg(root.join("adapter.mjs")).arg(action);
    if action == "start" || action == "apply" {
        command.arg(mode);
    }
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("无法启动 Cursor Diana 挂载器：{error}"))?;
    let stdout = clean_output(&output.stdout);
    let stderr = clean_output(&output.stderr);
    if output.status.success() {
        return Ok(stdout);
    }
    let details = if !stderr.is_empty() { stderr } else { stdout };
    let message = if details.contains("CURSOR_ALREADY_RUNNING") {
        "普通 Cursor 仍在运行。请完整退出后再挂载 Diana。".to_string()
    } else if details.contains("VERSION_MISMATCH") {
        format!(
            "当前 Cursor 尚未通过完整 Diana 挂载验证；已验证版本为 {}。本次没有开启调试端口。",
            EXPECTED_CURSOR_VERSION
        )
    } else if details.contains("SIGNATURE_MISMATCH") {
        "Cursor 数字签名与已验证发布者不一致，本次没有开启调试端口。".to_string()
    } else if details.contains("MOUNT_VERIFICATION_FAILED")
        || details.contains("MANAGED_CURSOR_NOT_FOUND")
        || details.contains("EXPECTED_RENDERER")
    {
        "Cursor 已启动，但当前界面结构未通过 Diana 能力探测；未继续挂载。请完整退出 Cursor 关闭本次端口。"
            .to_string()
    } else {
        format!("Cursor Diana 挂载失败：{details}")
    };
    Err(message)
}

fn ensure_cursor_extension(executable: &Path) -> Result<PathBuf, String> {
    let extension = cursor_extension_path(executable)?;
    write_files(&extension, CURSOR_FILES)?;
    let _ = extract_pack("cursor")?;
    Ok(extension)
}

fn set_cursor_theme(executable: &Path, mode: &str) -> Result<PathBuf, String> {
    set_editor_theme(
        &cursor_settings_path(executable)?,
        &cursor_state_path()?,
        "Cursor",
        mode,
    )
}

fn restore_cursor_theme(executable: &Path) -> Result<(), String> {
    restore_editor_theme(
        &cursor_settings_path(executable)?,
        &cursor_state_path()?,
        "Cursor",
    )
}

fn cursor_status() -> ExternalTargetStatus {
    let executable = cursor_executable();
    let snapshot = detect_cursor_processes(executable.as_deref());
    let extension = executable
        .as_deref()
        .and_then(|path| cursor_extension_path(path).ok());
    let settings = executable
        .as_deref()
        .and_then(|path| cursor_settings_path(path).ok());
    let selected = settings
        .as_ref()
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|contents| contents.contains("\"Diana Night\"") || contents.contains("\"Diana Day\""))
        .unwrap_or(false);
    let extension_installed = extension
        .as_ref()
        .map(|path| path.join("package.json").is_file())
        .unwrap_or(false);
    let adapter_root = cursor_adapter_root();
    let session = adapter_root.as_deref().and_then(read_cursor_session);
    let managed_debug = session
        .as_ref()
        .map(|record| cursor_session_matches(&snapshot, record))
        .unwrap_or(false);
    let themed = managed_debug
        && session
            .as_ref()
            .map(|record| record.status == "mounted")
            .unwrap_or(false);
    let unmanaged_debug = snapshot
        .main_command
        .as_deref()
        .map(cursor_has_loopback_debug)
        .unwrap_or(false)
        && !managed_debug;
    let adapter_ready = adapter_root.is_some() && find_node_runtime().is_ok();
    let restore_pending = session
        .as_ref()
        .map(|record| record.status == "disabled" || record.status == "restore_ready_for_exit")
        .unwrap_or(false);
    let (stage, message) = if executable.is_none() {
        ("cursor_not_installed", "未检测到 Cursor。".to_string())
    } else if themed {
        let mode = session
            .as_ref()
            .map(|record| record.mode.as_str())
            .unwrap_or("system");
        (
            "cursor_diana_running",
            format!(
                "Diana Cursor 已完整挂载（{}）。完整退出所有 Cursor 后，本次临时调试端口会一并关闭。",
                match mode {
                    "dark" => "暗夜",
                    "light" => "日间",
                    _ => "跟随 Cursor",
                }
            ),
        )
    } else if managed_debug {
        (
            "cursor_theme_disabled",
            "Diana 视觉层已撤下，但本次 Cursor 仍持有临时调试端口；正常退出全部 Cursor 后，再点一次“恢复 / 原版”即可还原磁盘设置并普通启动。"
                .to_string(),
        )
    } else if unmanaged_debug {
        (
            "cursor_unmanaged_debug",
            "检测到不属于当前 Diana 会话的 Cursor 调试实例；启动器不会接管。请完整退出后再挂载。"
                .to_string(),
        )
    } else if snapshot.process_count > 0 {
        (
            "cursor_plain_running",
            "普通 Cursor 正在运行。请先完整退出，再从这里启动并挂载完整 Diana 美术。".to_string(),
        )
    } else if adapter_root.is_some() && !adapter_ready {
        (
            "cursor_runtime_missing",
            "已登记本机 Cursor 完整美术适配器，但没有找到 Node.js 运行组件；本次不会开启调试端口。"
                .to_string(),
        )
    } else if adapter_ready && restore_pending {
        (
            "cursor_restore_ready",
            "Cursor 已完整退出，Diana 视觉层也已撤下；点击右侧“恢复 / 原版”即可还原受管设置并从普通入口启动。"
                .to_string(),
        )
    } else if adapter_ready {
        (
            "cursor_adapter_ready",
            format!(
                "Cursor {} 完整 Diana 适配器已就绪；点击后会先校验本机适配器、精确版本与官方签名，再优先挂载完整日夜美术。",
                EXPECTED_CURSOR_VERSION
            ),
        )
    } else if extension_installed && selected {
        (
            "cursor_color_ready",
            "Diana 日夜配色已通过 Cursor 用户扩展启用；本机未登记完整美术适配器，因此当前状态只标记为 COLOR。"
                .to_string(),
        )
    } else {
        (
            "cursor_pack_ready",
            "Diana Cursor 日夜颜色主题已内置；本机未登记版本限定适配器时，会安全降级为官方配色入口。"
                .to_string(),
        )
    };
    ExternalTargetStatus {
        target: "cursor".to_string(),
        stage: stage.to_string(),
        running: snapshot.process_count > 0,
        themed,
        theme_state: if executable.is_none() {
            "unavailable"
        } else if themed {
            "mounted"
        } else if managed_debug {
            "disabled"
        } else if unmanaged_debug {
            "unmanaged"
        } else if snapshot.process_count > 0 {
            "plain"
        } else if adapter_root.is_some() && !adapter_ready {
            "blocked"
        } else if restore_pending {
            "disabled"
        } else if adapter_ready {
            "available"
        } else if extension_installed && selected {
            "selected"
        } else {
            "available"
        }
        .to_string(),
        theme_scope: if adapter_root.is_some() {
            "full_artwork_adapter"
        } else {
            "color_theme_fallback"
        }
        .to_string(),
        process_count: snapshot.process_count,
        main_process_id: snapshot.main_process_id,
        executable: executable.map(|path| path.to_string_lossy().into_owned()),
        theme_root: adapter_root
            .or(extension)
            .map(|path| path.to_string_lossy().into_owned()),
        message,
    }
}

fn launch_cursor_theme(mode: &str) -> Result<ExternalTargetStatus, String> {
    let before = cursor_status();
    let executable = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到 Cursor。".to_string())?;
    if let Some(root) = cursor_adapter_root() {
        if before.running
            && before.stage != "cursor_diana_running"
            && before.stage != "cursor_theme_disabled"
        {
            return Ok(before);
        }
        let action = if before.running { "apply" } else { "start" };
        run_cursor_adapter(&root, action, mode)?;
        std::thread::sleep(Duration::from_millis(450));
        let status = cursor_status();
        if !status.themed {
            return Err(
                "Cursor 挂载器已经返回，但完整主题状态未通过复核；请完整退出 Cursor 后再试。"
                    .to_string(),
            );
        }
        return Ok(status);
    }

    ensure_cursor_extension(&executable)?;
    set_cursor_theme(&executable, mode)?;
    spawn_detached(&executable, &[])?;
    std::thread::sleep(Duration::from_millis(850));
    Ok(cursor_status())
}

fn launch_cursor_native() -> Result<ExternalTargetStatus, String> {
    let before = cursor_status();
    let executable = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到 Cursor。".to_string())?;

    if let Some(root) = cursor_adapter_root() {
        if let Some(session) = read_cursor_session(&root) {
            if before.running {
                if before.stage != "cursor_diana_running" && before.stage != "cursor_theme_disabled"
                {
                    return Ok(before);
                }
                run_cursor_adapter(&root, "restore", "system")?;
                std::thread::sleep(Duration::from_millis(250));
                return Ok(cursor_status());
            }
            if session.status != "restored" {
                run_cursor_adapter(&root, "restore", "system")?;
            }
        }
        if cursor_state_path()?.is_file() {
            restore_cursor_theme(&executable)?;
        }
    } else {
        restore_cursor_theme(&executable)?;
    }

    if before.running {
        return Ok(before);
    }
    spawn_detached(&executable, &[])?;
    std::thread::sleep(Duration::from_millis(850));
    Ok(cursor_status())
}

fn grok_executable() -> Option<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(r"D:\Program Files\Grok Bot\Grok Bot.exe"),
        PathBuf::from(r"C:\Program Files\Grok Bot\Grok Bot.exe"),
    ];
    if let Some(local) = env::var_os("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local)
                .join("Programs")
                .join("Grok Bot")
                .join("Grok Bot.exe"),
        );
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn grok_adapter_registration_path() -> Result<PathBuf, String> {
    Ok(state_root()?.join("grokbot-adapter.json"))
}

fn grok_adapter_is_complete(root: &Path) -> bool {
    root.join("adapter.mjs").is_file()
        && root.join("theme.css").is_file()
        && root.join("SHA256SUMS.txt").is_file()
        && root.join("README-LOCAL.txt").is_file()
}

fn grok_adapter_root() -> Option<PathBuf> {
    if let Some(explicit) = env::var_os("DIANA_GROK_ADAPTER_ROOT") {
        let root = PathBuf::from(explicit);
        if grok_adapter_is_complete(&root) {
            return Some(root);
        }
    }

    let registration_path = grok_adapter_registration_path().ok()?;
    let registration: GrokAdapterRegistration = fs::read_to_string(registration_path)
        .ok()
        .and_then(|contents| serde_json::from_str(contents.trim_start_matches('\u{feff}')).ok())?;
    if registration.adapter_version != GROK_ADAPTER_VERSION
        || registration.tested_version != EXPECTED_GROK_VERSION
    {
        return None;
    }
    let root = PathBuf::from(registration.root);
    grok_adapter_is_complete(&root).then_some(root)
}

fn verify_grok_adapter(root: &Path) -> Result<(), String> {
    let manifest_path = root.join("SHA256SUMS.txt");
    let manifest_hash = sha256_file(&manifest_path)?;
    if manifest_hash != GROK_ADAPTER_MANIFEST_SHA256 {
        return Err("本机 Grok Bot 适配器清单与已验证版本不一致；本次不会执行。".to_string());
    }
    let manifest = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("无法读取本机 Grok Bot 适配器清单：{error}"))?;
    for line in manifest
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let (expected, relative) = line
            .split_once("  ")
            .ok_or_else(|| "本机 Grok Bot 适配器清单格式无效。".to_string())?;
        let relative = Path::new(relative.trim());
        if relative.is_absolute()
            || !relative
                .components()
                .all(|component| matches!(component, std::path::Component::Normal(_)))
        {
            return Err("本机 Grok Bot 适配器清单包含越界路径；本次不会执行。".to_string());
        }
        let actual = sha256_file(&root.join(relative))?;
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            return Err(format!(
                "本机 Grok Bot 适配器文件校验失败：{}；本次不会执行。",
                relative.display()
            ));
        }
    }
    Ok(())
}

fn read_grok_session(root: &Path) -> Option<GrokSessionRecord> {
    let contents = fs::read_to_string(root.join("state").join("session.json")).ok()?;
    serde_json::from_str(contents.trim_start_matches('\u{feff}')).ok()
}

fn is_grok_main_command(command: &str) -> bool {
    !command.contains("--type=")
        && !command.contains("local-exec-daemon")
        && !command.contains("local_exec_daemon")
}

fn grok_debug_port(command: &str) -> Option<u16> {
    command
        .split_whitespace()
        .find_map(|part| part.strip_prefix("--remote-debugging-port="))
        .and_then(|value| value.parse::<u16>().ok())
}

fn grok_has_loopback_debug(command: &str) -> bool {
    command.contains("--remote-debugging-address=127.0.0.1") && grok_debug_port(command).is_some()
}

fn detect_grok_processes(preferred_path: Option<&Path>) -> ProcessSnapshot {
    let system = System::new_all();
    let preferred = preferred_path.map(|path| path.to_string_lossy().to_ascii_lowercase());
    let mut snapshot = ProcessSnapshot::default();
    for (pid, process) in system.processes() {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        if name != "grok bot.exe" {
            continue;
        }
        if let Some(expected) = preferred.as_ref() {
            let actual = process
                .exe()
                .map(|path| path.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if !actual.is_empty() && actual != *expected {
                continue;
            }
        }
        snapshot.process_count += 1;
        let command = process
            .cmd()
            .iter()
            .map(|part| part.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_lowercase();
        if is_grok_main_command(&command) {
            snapshot.main_process_id = Some(pid.as_u32());
            snapshot.executable = process.exe().map(Path::to_path_buf);
            snapshot.main_command = Some(command);
        } else if snapshot.executable.is_none() {
            snapshot.executable = process.exe().map(Path::to_path_buf);
        }
    }
    snapshot
}

fn grok_session_matches(snapshot: &ProcessSnapshot, session: &GrokSessionRecord) -> bool {
    session.adapter_version == GROK_ADAPTER_VERSION
        && session.version == EXPECTED_GROK_VERSION
        && snapshot.main_process_id == Some(session.pid)
        && snapshot
            .main_command
            .as_deref()
            .map(|command| {
                grok_has_loopback_debug(command) && grok_debug_port(command) == Some(session.port)
            })
            .unwrap_or(false)
}

fn run_grok_adapter(root: &Path, action: &str, mode: &str) -> Result<String, String> {
    verify_grok_adapter(root)?;
    let node = find_node_runtime()?;
    let mut command = Command::new(node);
    command.arg(root.join("adapter.mjs")).arg(action);
    if action == "start" || action == "apply" {
        command.arg(mode);
    }
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("无法启动 Grok Bot Diana 挂载器：{error}"))?;
    let stdout = clean_output(&output.stdout);
    let stderr = clean_output(&output.stderr);
    if output.status.success() {
        return Ok(stdout);
    }
    let details = if !stderr.is_empty() { stderr } else { stdout };
    let message = if details.contains("GROK_ALREADY_RUNNING") {
        "普通 Grok Bot 仍在运行。请完整退出后再挂载 Diana。".to_string()
    } else if details.contains("VERSION_MISMATCH") {
        format!(
            "当前 Grok Bot 尚未通过完整 Diana 挂载验证；已验证版本为 {}。本次没有开启调试端口。",
            EXPECTED_GROK_VERSION
        )
    } else if details.contains("SIGNATURE_MISMATCH") {
        "Grok Bot 数字签名与已核验发布者不一致，本次没有开启调试端口。".to_string()
    } else if details.contains("MOUNT_VERIFICATION_FAILED")
        || details.contains("MANAGED_GROK_NOT_FOUND")
        || details.contains("EXPECTED_RENDERER")
    {
        "Grok Bot 已启动，但当前界面结构未通过 Diana 能力探测；未继续挂载。请完整退出 Grok Bot 关闭本次端口。"
            .to_string()
    } else {
        format!("Grok Bot Diana 挂载失败：{details}")
    };
    Err(message)
}

fn grok_status() -> ExternalTargetStatus {
    let executable = grok_executable();
    let snapshot = detect_grok_processes(executable.as_deref());
    let adapter_root = grok_adapter_root();
    let adapter_verified = adapter_root
        .as_deref()
        .map(verify_grok_adapter)
        .transpose()
        .is_ok();
    let session = adapter_root.as_deref().and_then(read_grok_session);
    let managed_debug = session
        .as_ref()
        .map(|record| grok_session_matches(&snapshot, record))
        .unwrap_or(false);
    let themed = managed_debug
        && session
            .as_ref()
            .map(|record| record.status == "mounted")
            .unwrap_or(false);
    let unmanaged_debug = snapshot
        .main_command
        .as_deref()
        .map(grok_has_loopback_debug)
        .unwrap_or(false)
        && !managed_debug;
    let adapter_ready = adapter_root.is_some() && adapter_verified && find_node_runtime().is_ok();
    let (stage, message) = if executable.is_none() {
        ("grokbot_not_installed", "未检测到 Grok Bot。".to_string())
    } else if themed {
        let mode = session
            .as_ref()
            .map(|record| record.mode.as_str())
            .unwrap_or("system");
        (
            "grokbot_diana_running",
            format!(
                "Diana Grok Bot 已完整挂载（{}）。完整退出所有 Grok Bot 进程后，本次临时调试端口会一并关闭。",
                match mode {
                    "dark" => "暗夜",
                    "light" => "日间",
                    _ => "跟随系统",
                }
            ),
        )
    } else if managed_debug {
        (
            "grokbot_theme_disabled",
            "Diana 视觉层已撤下并恢复首次记录的原生外观；当前 Grok Bot 仍持有临时调试端口，完整退出后端口才会关闭。"
                .to_string(),
        )
    } else if unmanaged_debug {
        (
            "grokbot_unmanaged_debug",
            "检测到不属于当前 Diana 会话的 Grok Bot 调试实例；启动器不会接管。请完整退出后再挂载。"
                .to_string(),
        )
    } else if snapshot.process_count > 0 {
        (
            "grokbot_plain_running",
            "普通 Grok Bot 正在运行。请先完整退出，再从这里启动并挂载完整 Diana 美术。".to_string(),
        )
    } else if adapter_root.is_some() && !adapter_verified {
        (
            "grokbot_adapter_invalid",
            "本机 Grok Bot 适配器未通过 SHA-256 清单复核；本次不会执行或开启调试端口。".to_string(),
        )
    } else if adapter_root.is_some() && !adapter_ready {
        (
            "grokbot_runtime_missing",
            "已登记本机 Grok Bot 适配器，但没有找到 Node.js 运行组件；本次不会开启调试端口。"
                .to_string(),
        )
    } else if adapter_ready {
        (
            "grokbot_adapter_ready",
            format!(
                "Grok Bot {} 完整 Diana 适配器已就绪；点击后会再次核验清单、精确版本与官方签名，再挂载完整日夜美术。",
                EXPECTED_GROK_VERSION
            ),
        )
    } else {
        (
            "grokbot_runtime_missing",
            "本机尚未登记经过验证的 Grok Bot Diana 适配器；启动器不会尝试注入。".to_string(),
        )
    };
    ExternalTargetStatus {
        target: "grokbot".to_string(),
        stage: stage.to_string(),
        running: snapshot.process_count > 0,
        themed,
        theme_state: if executable.is_none() {
            "unavailable"
        } else if themed {
            "mounted"
        } else if managed_debug {
            "disabled"
        } else if unmanaged_debug {
            "unmanaged"
        } else if snapshot.process_count > 0 {
            "plain"
        } else if !adapter_ready {
            "blocked"
        } else {
            "available"
        }
        .to_string(),
        theme_scope: "full_artwork_adapter".to_string(),
        process_count: snapshot.process_count,
        main_process_id: snapshot.main_process_id,
        executable: executable.map(|path| path.to_string_lossy().into_owned()),
        theme_root: adapter_root.map(|path| path.to_string_lossy().into_owned()),
        message,
    }
}

fn launch_grok_theme(mode: &str) -> Result<ExternalTargetStatus, String> {
    let before = grok_status();
    if before.executable.is_none() {
        return Err("未检测到 Grok Bot。".to_string());
    }
    let root = grok_adapter_root()
        .ok_or_else(|| "本机没有已登记的 Grok Bot Diana 适配器。".to_string())?;
    if before.running
        && before.stage != "grokbot_diana_running"
        && before.stage != "grokbot_theme_disabled"
    {
        return Ok(before);
    }
    let action = if before.running { "apply" } else { "start" };
    run_grok_adapter(&root, action, mode)?;
    std::thread::sleep(Duration::from_millis(500));
    let status = grok_status();
    if !status.themed {
        return Err(
            "Grok Bot 挂载器已经返回，但完整主题状态未通过复核；请完整退出 Grok Bot 后再试。"
                .to_string(),
        );
    }
    Ok(status)
}

fn launch_grok_native() -> Result<ExternalTargetStatus, String> {
    let before = grok_status();
    let executable = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到 Grok Bot。".to_string())?;
    if before.running {
        if before.stage == "grokbot_diana_running" || before.stage == "grokbot_theme_disabled" {
            let root = grok_adapter_root().ok_or_else(|| {
                "本机 Grok Bot Diana 适配器登记已丢失；无法安全恢复。".to_string()
            })?;
            run_grok_adapter(&root, "restore", "system")?;
            std::thread::sleep(Duration::from_millis(300));
            return Ok(grok_status());
        }
        return Ok(before);
    }
    spawn_detached(&executable, &[])?;
    std::thread::sleep(Duration::from_millis(900));
    Ok(grok_status())
}

fn deepseek_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(explicit) = env::var_os("DIANA_DEEPSEEK_HARNESS_ROOT") {
        candidates.push(PathBuf::from(explicit));
    }
    candidates.push(PathBuf::from(r"D:\deepseek-harness"));
    if let Some(profile) = env::var_os("USERPROFILE") {
        let profile = PathBuf::from(profile);
        candidates.push(profile.join("deepseek-harness"));
        candidates.push(profile.join("source").join("deepseek-harness"));
    }
    candidates.into_iter().find(|candidate| {
        candidate.join("package.json").is_file()
            && candidate
                .join("apps")
                .join("web")
                .join("package.json")
                .is_file()
    })
}

fn deepseek_theme_ready(root: &Path) -> bool {
    let css = root
        .join("packages")
        .join("client")
        .join("ui-theme")
        .join("src")
        .join("styles")
        .join("diana.css");
    let styles = root
        .join("packages")
        .join("client")
        .join("ui-theme")
        .join("src")
        .join("client")
        .join("styles.ts");
    css.is_file()
        && fs::read_to_string(styles)
            .map(|contents| contents.contains("diana.css"))
            .unwrap_or(false)
}

fn deepseek_theme_state(available: bool, ready: bool, running: bool) -> &'static str {
    if !available {
        "unavailable"
    } else if !ready {
        "available"
    } else if running {
        "running"
    } else {
        "deployed"
    }
}

fn deepseek_processes(root: Option<&Path>) -> ProcessSnapshot {
    let system = System::new_all();
    let hint = root.map(|path| path.to_string_lossy().to_ascii_lowercase());
    let mut snapshot = ProcessSnapshot::default();
    for (pid, process) in system.processes() {
        let command = process
            .cmd()
            .iter()
            .map(|part| part.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_lowercase();
        let matches = process
            .name()
            .to_string_lossy()
            .eq_ignore_ascii_case("node.exe")
            && hint
                .as_ref()
                .map(|expected| command.contains(expected))
                .unwrap_or(false)
            && (command.contains("apps\\cli\\lib\\bin.js")
                || command.contains("apps/cli/lib/bin.js"))
            && command.split_whitespace().any(|arg| arg == "web");
        if !matches {
            continue;
        }
        snapshot.process_count += 1;
        if snapshot.main_process_id.is_none() {
            snapshot.main_process_id = Some(pid.as_u32());
            snapshot.executable = process.exe().map(Path::to_path_buf);
        }
    }
    snapshot
}

const DEEPSEEK_URL: &str = "http://127.0.0.1:3080";

fn is_deepseek_page(response: &str) -> bool {
    response.starts_with("HTTP/1.1 200")
        && response.contains("id=\"root\"")
        && (response.contains("DSH Local Build") || response.contains("DeepSeek Harness"))
}

fn deepseek_browser_url() -> Option<String> {
    // DSH rotates this local bootstrap credential each launch. Never include it in UI/errors.
    let log = fs::read_to_string(state_root().ok()?.join("deepseek-service.log")).ok()?;
    let prefix = format!("dsh web: {DEEPSEEK_URL}/?token=");
    let token = log
        .lines()
        .rev()
        .find_map(|line| line.trim().strip_prefix(&prefix))?;
    (token.len() >= 32
        && token.len() <= 128
        && token
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-'))
    .then(|| format!("{DEEPSEEK_URL}/?token={token}"))
}

fn deepseek_http_request(path: &str, cookie: Option<&str>) -> Option<String> {
    let address: SocketAddr = "127.0.0.1:3080".parse().unwrap();
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return None;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(700)));
    let cookie = cookie
        .map(|value| format!("Cookie: {value}\r\n"))
        .unwrap_or_default();
    let request =
        format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:3080\r\nConnection: close\r\n{cookie}\r\n");
    stream.write_all(request.as_bytes()).ok()?;
    let mut response = String::new();
    stream.take(32768).read_to_string(&mut response).ok()?;
    Some(response)
}

fn deepseek_http_ready() -> bool {
    let Some(response) = deepseek_http_request("/", None) else {
        return false;
    };
    if is_deepseek_page(&response) {
        return true;
    }
    let Some(url) = deepseek_browser_url() else {
        return false;
    };
    let Some(bootstrap) = deepseek_http_request(&url[DEEPSEEK_URL.len()..], None) else {
        return false;
    };
    if !bootstrap.starts_with("HTTP/1.1 303") {
        return false;
    }
    let cookie = bootstrap
        .split("\r\n\r\n")
        .next()
        .unwrap_or_default()
        .lines()
        .filter_map(|line| line.split_once(':'))
        .find(|(name, value)| {
            name.eq_ignore_ascii_case("set-cookie") && value.trim().starts_with("dsh-auth-")
        })
        .map(|(_, value)| value.trim().split(';').next().unwrap_or_default());
    cookie
        .and_then(|value| deepseek_http_request("/", Some(value)))
        .is_some_and(|page| is_deepseek_page(&page))
}

fn deepseek_status() -> ExternalTargetStatus {
    let root = deepseek_root();
    let ready = root.as_deref().map(deepseek_theme_ready).unwrap_or(false);
    let snapshot = deepseek_processes(root.as_deref());
    let node = find_node_runtime().ok();
    let built = root.as_ref().is_some_and(|path| {
        path.join("apps/cli/lib/bin.js").is_file()
            && path.join("apps/web/dist/index.html").is_file()
    });
    let running = snapshot.process_count > 0 && deepseek_http_ready();
    let (stage, message) = if root.is_none() {
        (
            "deepseek_not_installed",
            "未检测到 DeepSeek Harness 源码工作区；启动器不会捆绑第三方程序或 node_modules。"
                .to_string(),
        )
    } else if !ready {
        (
            "deepseek_theme_needs_deploy",
            "已检测到 Harness，但该工作区尚未合并 Diana 主题；内置资源包可交给 Codex 安全合并后重新构建。"
                .to_string(),
        )
    } else if !built || node.is_none() {
        (
            "deepseek_build_missing",
            "Harness 缺少 Node.js 或构建产物；请先在源码目录完成构建。".to_string(),
        )
    } else if running {
        (
            "deepseek_running",
            "Diana DeepSeek Harness 本地服务正在运行，可打开 127.0.0.1:3080。".to_string(),
        )
    } else if snapshot.process_count > 0 {
        (
            "deepseek_starting",
            "Harness 进程存在，但本地页面尚未就绪；未报告服务运行成功。".to_string(),
        )
    } else {
        (
            "deepseek_ready",
            "已检测到 Diana Harness 构建；启动本地服务后会等待页面就绪再打开，不依赖 pnpm 的 PATH。"
                .to_string(),
        )
    };
    ExternalTargetStatus {
        target: "deepseek".to_string(),
        stage: stage.to_string(),
        running,
        themed: ready,
        theme_state: deepseek_theme_state(root.is_some(), ready, running).to_string(),
        theme_scope: "source_theme".to_string(),
        process_count: snapshot.process_count,
        main_process_id: snapshot.main_process_id,
        executable: node.map(|path| path.to_string_lossy().into_owned()),
        theme_root: root.map(|path| path.to_string_lossy().into_owned()),
        message,
    }
}

fn launch_deepseek() -> Result<ExternalTargetStatus, String> {
    let pack = extract_pack("deepseek")?;
    let before = deepseek_status();
    let root = before
        .theme_root
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到 DeepSeek Harness 源码工作区。".to_string())?;
    if !deepseek_theme_ready(&root) {
        let mut status = before;
        status.theme_root = Some(pack.to_string_lossy().into_owned());
        status.message = format!(
            "Diana Harness 蓝图已解包到 {}。请让 Codex 将其安全合并到源码并完成构建；启动器没有改写第三方工作区。",
            pack.display()
        );
        return Ok(status);
    }
    if before.running {
        open_url(&deepseek_browser_url().unwrap_or_else(|| DEEPSEEK_URL.to_string()))?;
        return Ok(deepseek_status());
    }
    let node = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未找到 Node.js，无法启动 Harness。".to_string())?;
    let entry = root.join("apps/cli/lib/bin.js");
    if !entry.is_file() || !root.join("apps/web/dist/index.html").is_file() {
        return Err("Harness 构建产物缺失，请先完成源码构建。".to_string());
    }
    let log_path = state_root()?.join("deepseek-service.log");
    let mut child = None;
    if before.process_count == 0 {
        if TcpStream::connect_timeout(
            &"127.0.0.1:3080".parse().unwrap(),
            Duration::from_millis(250),
        )
        .is_ok()
        {
            return Err(
                "3080 端口已被其他服务占用，未结束任何进程；请关闭占用服务后重试。".to_string(),
            );
        }
        let log = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|error| format!("无法创建 Harness 服务日志：{error}"))?;
        let mut command = Command::new(node);
        command
            .arg(entry)
            .args(["web", "--host", "127.0.0.1", "--port", "3080", "--no-open"])
            .current_dir(&root)
            .stdin(Stdio::null())
            .stderr(log.try_clone().map_err(|error| error.to_string())?)
            .stdout(log);
        hide_console(&mut command);
        child = Some(
            command
                .spawn()
                .map_err(|error| format!("无法启动 Harness：{error}"))?,
        );
    }
    let deadline = std::time::Instant::now() + Duration::from_secs(20);
    while std::time::Instant::now() < deadline {
        if deepseek_http_ready() {
            open_url(&deepseek_browser_url().unwrap_or_else(|| DEEPSEEK_URL.to_string()))?;
            return Ok(deepseek_status());
        }
        if let Some(process) = child.as_mut() {
            if let Some(code) = process.try_wait().map_err(|error| error.to_string())? {
                return Err(format!(
                    "Harness 启动后退出（{code}），日志：{}",
                    log_path.display()
                ));
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err(format!(
        "Harness 页面在等待期内未就绪；没有重复启动或结束服务。日志：{}",
        log_path.display()
    ))
}

fn zcode_executable() -> Option<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(r"C:\Program Files\ZCode\ZCode.exe"),
        PathBuf::from(r"D:\ZCode\ZCode.exe"),
    ];
    if let Some(local) = env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(local);
        candidates.push(local.join("Programs").join("ZCode").join("ZCode.exe"));
        candidates.push(local.join("ZCode").join("ZCode.exe"));
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn zcode_runtime_root() -> Result<PathBuf, String> {
    Ok(local_app_data()?
        .join("DianaZCodeTheme")
        .join("experimental-3.6.5"))
}

fn zcode_runtime_assets_root(root: &Path) -> PathBuf {
    root.join("assets")
}

fn verify_shared_assets(root: &Path, mapping: &[(&str, &str)]) -> Result<(), String> {
    for (destination, source) in mapping {
        let path = root.join(destination);
        let expected = runtime_bytes(source)?;
        let actual = fs::read(&path)
            .map_err(|error| format!("无法读取主题素材 {}：{error}", path.display()))?;
        if actual != expected {
            return Err(format!("主题素材校验失败：{}", path.display()));
        }
    }
    Ok(())
}

fn ensure_zcode_runtime() -> Result<PathBuf, String> {
    let root = zcode_runtime_root()?;
    write_files(&root, ZCODE_RUNTIME_FILES)?;
    let assets_root = zcode_runtime_assets_root(&root);
    write_shared_assets(&assets_root, SHARED_ASSET_MAP)?;
    verify_shared_assets(&assets_root, SHARED_ASSET_MAP)?;
    fs::create_dir_all(root.join("logs"))
        .map_err(|error| format!("无法创建 ZCode 主题日志目录：{error}"))?;
    fs::create_dir_all(root.join("state"))
        .map_err(|error| format!("无法创建 ZCode 主题状态目录：{error}"))?;
    let _ = extract_pack("zcode")?;
    Ok(root)
}

fn read_zcode_session() -> Option<ZcodeSessionRecord> {
    let path = zcode_runtime_root()
        .ok()?
        .join("state")
        .join("session.json");
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(contents.trim_start_matches('\u{feff}').trim()).ok()
}

fn zcode_debug_port(command: &str) -> Option<u16> {
    let marker = "--remote-debugging-port=";
    let start = command.find(marker)? + marker.len();
    command[start..]
        .split_whitespace()
        .next()?
        .trim_matches('"')
        .parse()
        .ok()
}

fn zcode_has_loopback_debug(command: &str) -> bool {
    command.contains("--remote-debugging-address=127.0.0.1") && zcode_debug_port(command).is_some()
}

fn zcode_session_matches(snapshot: &ProcessSnapshot, session: &ZcodeSessionRecord) -> bool {
    let command = snapshot.main_command.as_deref().unwrap_or_default();
    snapshot.main_process_id == Some(session.pid)
        && zcode_has_loopback_debug(command)
        && zcode_debug_port(command) == Some(session.port)
        && session.version == EXPECTED_ZCODE_VERSION
        && session.adapter_version == ZCODE_ADAPTER_VERSION
}

fn zcode_trust_report(executable: &Path) -> Result<ZcodeTrustReport, String> {
    let powershell = powershell_runtime()?;
    let escaped = executable.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop';$i=Get-Item -LiteralPath '{escaped}';$s=Get-AuthenticodeSignature -LiteralPath '{escaped}';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[pscustomobject]@{{fileVersion=$i.VersionInfo.FileVersion;productVersion=$i.VersionInfo.ProductVersion;signature=$s.Status.ToString();signerThumbprint=if($s.SignerCertificate){{$s.SignerCertificate.Thumbprint}}else{{''}}}}|ConvertTo-Json -Compress"
    );
    let mut command = Command::new(powershell);
    configure_windows_powershell_environment(&mut command)?;
    command
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(script);
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("无法核验 ZCode 版本与数字签名：{error}"))?;
    if !output.status.success() {
        return Err("ZCode 版本与数字签名核验失败。".to_string());
    }
    let text = clean_output(&output.stdout);
    serde_json::from_str(text.trim_start_matches('\u{feff}').trim())
        .map_err(|error| format!("无法读取 ZCode 信任信息：{error}"))
}

fn validate_zcode_target(executable: &Path, require_tested_version: bool) -> Result<(), String> {
    let report = zcode_trust_report(executable)?;
    if !report.signature.eq_ignore_ascii_case("Valid")
        || !report
            .signer_thumbprint
            .eq_ignore_ascii_case(EXPECTED_ZCODE_SIGNER_THUMBPRINT)
    {
        return Err("ZCode 数字签名与已验证的官方发布者不一致，启动器拒绝接管。".to_string());
    }
    if require_tested_version
        && (report.file_version != EXPECTED_ZCODE_VERSION
            || report.product_version != EXPECTED_ZCODE_VERSION)
    {
        return Err(format!(
            "当前 ZCode {} 尚未通过 Diana 挂载验证；已验证版本为 {}。本次不会开启调试端口。",
            report.file_version, EXPECTED_ZCODE_VERSION
        ));
    }
    Ok(())
}

fn zcode_adapter_theme(mode: &str) -> Result<&str, String> {
    match mode {
        "dark" => Ok("dark"),
        "light" => Ok("light"),
        "system" => Ok("auto"),
        _ => Err("ZCode 主题模式必须是 dark、light 或 system。".to_string()),
    }
}

fn run_zcode_adapter(
    root: &Path,
    executable: &Path,
    action: &str,
    mode: &str,
) -> Result<String, String> {
    let node = find_node_runtime()?;
    let powershell = powershell_runtime()?;
    let mut command = Command::new(node);
    command
        .arg(root.join("adapter.mjs"))
        .arg(action)
        .arg("--theme")
        .arg(zcode_adapter_theme(mode)?)
        .env("DIANA_ZCODE_EXE", executable)
        .env("DIANA_POWERSHELL_EXE", powershell);
    configure_windows_powershell_environment(&mut command)?;
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("无法启动 ZCode Diana 挂载器：{error}"))?;
    let stdout = clean_output(&output.stdout);
    let stderr = clean_output(&output.stderr);
    if output.status.success() {
        return Ok(stdout);
    }
    let details = if !stderr.is_empty() { stderr } else { stdout };
    let message = if details.contains("ZCODE_ALREADY_RUNNING") {
        "普通 ZCode 仍在运行。请完整退出后再挂载 Diana。".to_string()
    } else if details.contains("ZCODE_VERSION_MISMATCH") {
        "ZCode 版本与本机已验证适配版本不一致，本次没有开启调试端口。".to_string()
    } else if details.contains("ZCODE_SIGNATURE_MISMATCH") {
        "ZCode 数字签名核验失败，本次没有开启调试端口。".to_string()
    } else if details.contains("POWERSHELL_NOT_FOUND")
        || details.contains("POWERSHELL_PREFLIGHT_FAILED")
        || details.contains("POWERSHELL_PREFLIGHT_INVALID_JSON")
    {
        "ZCode 预检无法正常调用 Windows PowerShell；本次没有启动 ZCode 或开启调试端口。".to_string()
    } else if details.contains("EXPECTED_RENDERER_TIMEOUT")
        || details.contains("EXPECTED_RENDERER_NOT_FOUND")
    {
        "ZCode 已启动，但当前界面结构未通过 Diana 能力探测；未继续挂载。请完整退出 ZCode 关闭本次端口。"
            .to_string()
    } else {
        format!("ZCode Diana 挂载失败：{details}")
    };
    Err(message)
}

fn zcode_status() -> ExternalTargetStatus {
    let executable = zcode_executable();
    let snapshot = detect_named_processes(&["zcode.exe"], executable.as_deref());
    let session = read_zcode_session();
    let managed_debug = session
        .as_ref()
        .map(|record| zcode_session_matches(&snapshot, record))
        .unwrap_or(false);
    let themed = managed_debug
        && session
            .as_ref()
            .map(|record| record.status == "mounted")
            .unwrap_or(false);
    let unmanaged_debug = snapshot
        .main_command
        .as_deref()
        .map(zcode_has_loopback_debug)
        .unwrap_or(false)
        && !managed_debug;
    let runtime_root = zcode_runtime_root().ok();
    let (stage, message) = if executable.is_none() {
        ("zcode_not_installed", "未检测到 ZCode。".to_string())
    } else if themed {
        let mode = session
            .as_ref()
            .map(|record| record.theme.as_str())
            .unwrap_or("auto");
        (
            "zcode_diana_running",
            format!(
                "Diana ZCode 已完整挂载（{}）。完整退出所有 ZCode 后，本次临时调试端口会一并关闭。",
                match mode {
                    "dark" => "暗夜",
                    "light" => "日间",
                    _ => "跟随 ZCode",
                }
            ),
        )
    } else if managed_debug {
        (
            "zcode_theme_disabled",
            "Diana 视觉层已撤下，但本次 ZCode 仍持有临时调试端口；完整退出所有 ZCode 后才会彻底关闭。"
                .to_string(),
        )
    } else if unmanaged_debug {
        (
            "zcode_unmanaged_debug",
            "检测到不属于当前 Diana 会话的 ZCode 调试实例；启动器不会接管。请完整退出后再挂载。"
                .to_string(),
        )
    } else if snapshot.process_count > 0 {
        (
            "zcode_plain_running",
            "普通 ZCode 正在运行。请先完整退出，再从这里启动并挂载完整 Diana 美术。".to_string(),
        )
    } else if find_node_runtime().is_err() {
        (
            "zcode_runtime_missing",
            "已检测到 ZCode，但没有找到本机 Node.js 运行组件；本次不会开启调试端口。".to_string(),
        )
    } else {
        (
            "zcode_ready",
            "ZCode 已就绪；点击后会先核验精确版本与官方签名，再优先挂载完整 Diana 日夜美术。"
                .to_string(),
        )
    };
    ExternalTargetStatus {
        target: "zcode".to_string(),
        stage: stage.to_string(),
        running: snapshot.process_count > 0,
        themed,
        theme_state: if executable.is_none() {
            "unavailable"
        } else if themed {
            "mounted"
        } else if managed_debug {
            "disabled"
        } else if unmanaged_debug {
            "unmanaged"
        } else if snapshot.process_count > 0 {
            "plain"
        } else if find_node_runtime().is_err() {
            "blocked"
        } else {
            "available"
        }
        .to_string(),
        theme_scope: "full_artwork_adapter".to_string(),
        process_count: snapshot.process_count,
        main_process_id: snapshot.main_process_id,
        executable: executable.map(|path| path.to_string_lossy().into_owned()),
        theme_root: runtime_root.map(|path| path.to_string_lossy().into_owned()),
        message,
    }
}

fn launch_zcode_theme(mode: &str) -> Result<ExternalTargetStatus, String> {
    let before = zcode_status();
    let executable = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到 ZCode。".to_string())?;
    validate_zcode_target(&executable, true)?;
    let root = ensure_zcode_runtime()?;

    if before.running && !before.themed && before.stage != "zcode_theme_disabled" {
        return Ok(before);
    }

    let action = if before.running { "apply" } else { "start" };
    run_zcode_adapter(&root, &executable, action, mode)?;
    std::thread::sleep(Duration::from_millis(450));
    let status = zcode_status();
    if !status.themed {
        return Err(
            "ZCode 挂载器已经返回，但主题状态未通过复核；请完整退出 ZCode 后再试。".to_string(),
        );
    }
    Ok(status)
}

fn launch_zcode_native() -> Result<ExternalTargetStatus, String> {
    let before = zcode_status();
    let executable = before
        .executable
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "未检测到 ZCode。".to_string())?;

    if before.themed {
        let root = ensure_zcode_runtime()?;
        run_zcode_adapter(&root, &executable, "disable", "system")?;
        std::thread::sleep(Duration::from_millis(250));
        return Ok(zcode_status());
    }
    if before.running {
        return Ok(before);
    }

    validate_zcode_target(&executable, false)?;
    spawn_detached(&executable, &[])?;
    std::thread::sleep(Duration::from_millis(900));
    Ok(zcode_status())
}

pub(crate) fn get_status(target: &str) -> Result<ExternalTargetStatus, String> {
    match target {
        "terminal" => Ok(terminal_status()),
        "vscode" => Ok(vscode_status()),
        "cursor" => Ok(cursor_status()),
        "grokbot" => Ok(grok_status()),
        "deepseek" => Ok(deepseek_status()),
        "zcode" => Ok(zcode_status()),
        _ => Err("尚未接入该目标应用。".to_string()),
    }
}

pub(crate) fn run_action(
    target: &str,
    action: &str,
    theme_mode: Option<&str>,
) -> Result<ExternalTargetStatus, String> {
    let mode = theme_mode.unwrap_or("system");
    match (target, action) {
        ("terminal", "launch_theme") => launch_terminal(true),
        ("terminal", "launch_native") => launch_terminal(false),
        ("vscode", "launch_theme") => launch_vscode(true, mode),
        ("vscode", "launch_native") => launch_vscode(false, mode),
        ("cursor", "launch_theme") => launch_cursor_theme(mode),
        ("cursor", "launch_native") => launch_cursor_native(),
        ("grokbot", "launch_theme") => launch_grok_theme(mode),
        ("grokbot", "launch_native") => launch_grok_native(),
        ("deepseek", "launch_theme") | ("deepseek", "launch_native") => launch_deepseek(),
        ("zcode", "launch_theme") => launch_zcode_theme(mode),
        ("zcode", "launch_native") => launch_zcode_native(),
        _ => Err("未知的目标应用操作。".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        cursor_debug_port, cursor_has_loopback_debug, deepseek_theme_state, grok_debug_port,
        grok_has_loopback_debug, is_cursor_main_command, is_grok_main_command,
        is_primary_app_command, jsonc_raw_value, remove_jsonc_property, replace_jsonc_raw,
        restore_editor_theme, set_editor_theme, terminal_theme_state, verify_shared_assets,
        vscode_theme_state, write_shared_assets, zcode_adapter_theme, zcode_debug_port,
        zcode_has_loopback_debug, zcode_runtime_assets_root,
    };
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn native_terminal_does_not_reopen_the_diana_default() {
        assert_eq!(
            super::native_terminal_profile(
                Some(super::DIANA_TERMINAL_PROFILES[0]),
                Some(super::NATIVE_POWERSHELL_PROFILE)
            ),
            super::NATIVE_POWERSHELL_PROFILE
        );
        assert_eq!(
            super::native_terminal_profile(Some("user-profile"), Some("older-profile")),
            "user-profile"
        );
        assert_eq!(
            super::native_terminal_profile(None, None),
            super::NATIVE_POWERSHELL_PROFILE
        );
    }

    #[test]
    fn legacy_vscode_light_and_restore_do_not_restore_diana_again() {
        let root = std::env::temp_dir().join(format!(
            "diana-legacy-vscode-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let settings = root.join("settings.json");
        let state = root.join("state.json");
        fs::write(
            &settings,
            "{\n  \"workbench.colorTheme\": \"Diana Night\",\n  \"editor.fontSize\": 17\n}\n",
        )
        .unwrap();
        set_editor_theme(&settings, &state, "VS Code", "light").unwrap();
        let applied: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&settings).unwrap()).unwrap();
        assert_eq!(applied["workbench.colorTheme"], "Diana Day");
        assert_eq!(applied["window.autoDetectColorScheme"], false);
        restore_editor_theme(&settings, &state, "VS Code").unwrap();
        let restored: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&settings).unwrap()).unwrap();
        assert_eq!(restored["workbench.colorTheme"], "Dark Modern");
        assert_eq!(restored["editor.fontSize"], 17);
        fs::write(
            &settings,
            "{\n  \"workbench.colorTheme\": \"Diana Day\",\n  \"editor.fontSize\": 17\n}\n",
        )
        .unwrap();
        restore_editor_theme(&settings, &state, "VS Code").unwrap();
        assert!(fs::read_to_string(&settings)
            .unwrap()
            .contains("Light Modern"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn browser_urls_reject_files_shell_targets_and_control_characters() {
        for address in [
            r"C:\Users\Public\Documents",
            "file:///C:/Users/Public/Documents",
            "shell:Personal",
            "javascript:alert(1)",
            "https://user:secret@example.invalid/",
            "http://127.0.0.1:3080/\n",
        ] {
            assert!(super::browser_open_command(address).is_err());
        }
    }

    #[cfg(windows)]
    #[test]
    fn browser_launch_uses_url_association_without_exposing_the_address() {
        let address = "http://127.0.0.1:3080/?token=qa-placeholder-only";
        let command = super::browser_open_command(address).unwrap();
        assert!(command
            .get_program()
            .to_string_lossy()
            .ends_with("powershell.exe"));
        let arguments = command
            .get_args()
            .map(|arg| arg.to_string_lossy())
            .collect::<Vec<_>>();
        assert!(arguments
            .iter()
            .any(|arg| arg.contains("UseShellExecute=$true")));
        assert!(arguments
            .iter()
            .all(|arg| !arg.contains("qa-placeholder-only")));
        assert!(command.get_envs().any(|(key, value)| {
            key == "DIANA_BROWSER_URL" && value == Some(std::ffi::OsStr::new(address))
        }));
    }

    #[test]
    fn deepseek_readiness_rejects_an_error_or_unrelated_page() {
        assert!(super::is_deepseek_page(
            "HTTP/1.1 200 OK\r\n\r\n<title>DSH Local Build</title><div id=\"root\"></div>"
        ));
        assert!(!super::is_deepseek_page(
            "HTTP/1.1 503 Service Unavailable\r\n\r\nDSH Local Build id=\"root\""
        ));
        assert!(!super::is_deepseek_page(
            "HTTP/1.1 200 OK\r\n\r\nAnother app"
        ));
    }

    // Explicit opt-in: this starts a real local application; excluded from normal cargo test.
    #[test]
    #[ignore]
    fn local_external_action_smoke() {
        let target = std::env::var("DIANA_SMOKE_TARGET").expect("explicit target required");
        assert!(matches!(
            target.as_str(),
            "terminal" | "vscode" | "deepseek"
        ));
        let action = std::env::var("DIANA_SMOKE_ACTION").expect("explicit action required");
        let mode = std::env::var("DIANA_SMOKE_MODE").unwrap_or_else(|_| "dark".to_string());
        let result =
            super::run_action(&target, &action, Some(&mode)).expect("local application action");
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
    }

    #[test]
    fn distinguishes_installed_selected_deployed_and_mounted_states() {
        assert_eq!(terminal_theme_state(true, true), "installed");
        assert_eq!(vscode_theme_state(true, true, true, false), "selected");
        assert_eq!(vscode_theme_state(true, true, true, true), "deployed");
        assert_eq!(deepseek_theme_state(true, true, false), "deployed");
        assert_eq!(deepseek_theme_state(true, true, true), "running");
        assert_ne!(terminal_theme_state(true, true), "mounted");
        assert_ne!(vscode_theme_state(true, true, true, false), "mounted");
        assert_ne!(deepseek_theme_state(true, true, true), "mounted");
    }

    #[test]
    fn cursor_accepts_only_the_two_verified_art_bundles() {
        use super::CURSOR_ADAPTER_MANIFEST_SHA256;

        assert!(CURSOR_ADAPTER_MANIFEST_SHA256
            .contains(&"D0FE9031D40C7D7C08BBBCBA15E263014195B39429B3ED399452A356613ED8E5"));
        assert!(CURSOR_ADAPTER_MANIFEST_SHA256
            .contains(&"00117864949FA9F37C8902B1E64D55E44A60E8F869CE4FF8C80BFF8A6FCF0A03"));
        assert!(!CURSOR_ADAPTER_MANIFEST_SHA256.contains(&"unverified"));
        assert!(!CURSOR_ADAPTER_MANIFEST_SHA256
            .contains(&"0000000000000000000000000000000000000000000000000000000000000000"));
        assert_eq!(CURSOR_ADAPTER_MANIFEST_SHA256.len(), 2);
    }

    #[test]
    fn identifies_only_the_real_cursor_main_process() {
        let main = r#"D:\Apps\Cursor\Cursor.exe --remote-debugging-address=127.0.0.1 --remote-debugging-port=54805 --new-window"#;
        let worker = r#"D:\Apps\Cursor\Cursor.exe D:\Apps\Cursor\resources\app\extensions\cursor-always-local\dist\gitWorker.js"#;
        let renderer = r#"D:\Apps\Cursor\Cursor.exe --type=renderer --remote-debugging-port=54805"#;
        assert!(is_cursor_main_command(main));
        assert!(!is_cursor_main_command(worker));
        assert!(!is_cursor_main_command(renderer));
        assert!(cursor_has_loopback_debug(main));
        assert_eq!(cursor_debug_port(main), Some(54805));
    }

    #[test]
    fn identifies_only_the_real_grok_bot_main_process() {
        let main = r#"D:\Program Files\Grok Bot\Grok Bot.exe --remote-debugging-address=127.0.0.1 --remote-debugging-port=55123"#;
        let renderer = r#"D:\Program Files\Grok Bot\Grok Bot.exe --type=renderer --remote-debugging-port=55123"#;
        let daemon = r#"D:\Program Files\Grok Bot\Grok Bot.exe D:\Program Files\Grok Bot\resources\app.asar\dist\local-exec-daemon\main.cjs"#;
        assert!(is_grok_main_command(main));
        assert!(!is_grok_main_command(renderer));
        assert!(!is_grok_main_command(daemon));
        assert!(grok_has_loopback_debug(main));
        assert_eq!(grok_debug_port(main), Some(55123));
        assert!(!grok_has_loopback_debug(
            "grok bot.exe --remote-debugging-address=0.0.0.0 --remote-debugging-port=55123"
        ));
    }

    #[test]
    fn editor_theme_restore_preserves_unmanaged_settings() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock must be after unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "diana-editor-theme-test-{}-{unique}",
            std::process::id()
        ));
        let settings = root.join("User").join("settings.json");
        let state = root.join("state").join("managed.json");
        fs::create_dir_all(settings.parent().expect("settings parent"))
            .expect("create test settings directory");
        fs::write(
            &settings,
            "{\n  \"workbench.colorTheme\": \"Original Theme\",\n  \"editor.fontSize\": 15\n}\n",
        )
        .expect("write test settings");

        set_editor_theme(&settings, &state, "Test Editor", "light").expect("apply editor theme");
        let applied = fs::read_to_string(&settings).expect("read applied settings");
        assert!(applied.contains("\"Diana Day\""));
        assert!(applied.contains("\"editor.fontSize\": 15"));

        restore_editor_theme(&settings, &state, "Test Editor").expect("restore editor theme");
        let restored = fs::read_to_string(&settings).expect("read restored settings");
        assert!(restored.contains("\"Original Theme\""));
        assert!(restored.contains("\"editor.fontSize\": 15"));
        assert!(!state.exists());
        fs::remove_dir_all(&root).expect("remove isolated test directory");
    }

    #[test]
    fn updates_jsonc_without_discarding_other_settings() {
        let source = "{\n  // retained\n  \"editor.fontSize\": 15,\n  \"workbench.colorTheme\": \"Old\"\n}\n";
        let updated = replace_jsonc_raw(source, "workbench.colorTheme", "\"Diana Night\"");
        assert!(updated.contains("// retained"));
        assert!(updated.contains("\"editor.fontSize\": 15"));
        assert_eq!(
            jsonc_raw_value(&updated, "workbench.colorTheme").as_deref(),
            Some("\"Diana Night\"")
        );
    }

    #[test]
    fn inserts_and_removes_managed_jsonc_property() {
        let source = "{\n  \"editor.fontSize\": 15\n}\n";
        let inserted = replace_jsonc_raw(source, "window.autoDetectColorScheme", "true");
        assert_eq!(
            jsonc_raw_value(&inserted, "window.autoDetectColorScheme").as_deref(),
            Some("true")
        );
        let removed = remove_jsonc_property(&inserted, "window.autoDetectColorScheme");
        assert!(!removed.contains("window.autoDetectColorScheme"));
        assert!(removed.contains("editor.fontSize"));
    }

    #[test]
    fn recognizes_only_loopback_zcode_debug_commands() {
        let command =
            "zcode.exe --remote-debugging-address=127.0.0.1 --remote-debugging-port=50367";
        assert_eq!(zcode_debug_port(command), Some(50367));
        assert!(zcode_has_loopback_debug(command));
        assert!(!zcode_has_loopback_debug(
            "zcode.exe --remote-debugging-address=0.0.0.0 --remote-debugging-port=50367"
        ));
    }

    #[test]
    fn maps_launcher_theme_modes_to_zcode_adapter_modes() {
        assert_eq!(zcode_adapter_theme("dark"), Ok("dark"));
        assert_eq!(zcode_adapter_theme("light"), Ok("light"));
        assert_eq!(zcode_adapter_theme("system"), Ok("auto"));
        assert!(zcode_adapter_theme("unknown").is_err());
    }

    #[test]
    fn writes_zcode_runtime_artwork_under_the_adapter_assets_directory() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock must be after unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "diana-zcode-runtime-assets-test-{}-{unique}",
            std::process::id()
        ));
        let assets_root = zcode_runtime_assets_root(&root);
        let mapping = &[("diana-night-v3.png", "assets/diana-night-v3.png")];

        write_shared_assets(&assets_root, mapping).expect("write ZCode runtime artwork");
        verify_shared_assets(&assets_root, mapping).expect("verify ZCode runtime artwork");

        assert!(assets_root.join("diana-night-v3.png").is_file());
        assert!(!root.join("diana-night-v3.png").exists());
        fs::remove_dir_all(&root).expect("remove isolated ZCode runtime directory");
    }

    #[test]
    fn excludes_zcode_cli_helpers_from_the_main_window_pid() {
        assert!(is_primary_app_command("zcode.exe"));
        assert!(!is_primary_app_command("zcode.exe --type=renderer"));
        assert!(!is_primary_app_command(
            "zcode.exe c:\\program files\\zcode\\resources\\glm\\zcode.cjs app-server --stdio"
        ));
    }
}
