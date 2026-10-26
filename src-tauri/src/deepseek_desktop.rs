//! Official desktop plugin path, separate from the legacy source-web path.
use super::*;
const PLUGIN_NAME: &str = "dsh-diana-theme";
const PLUGIN_FILES: &[(&str, &[u8])] = &[
    ("package.json", include_bytes!("../resources/theme-packs/deepseek/desktop-plugin/package.json")),
    ("client.js", include_bytes!("../resources/theme-packs/deepseek/desktop-plugin/client.js")),
    ("index.js", include_bytes!("../resources/theme-packs/deepseek/desktop-plugin/index.js")),
    ("cordis.patch.yml", include_bytes!("../resources/theme-packs/deepseek/desktop-plugin/cordis.patch.yml")),
    ("README.md", include_bytes!("../resources/theme-packs/deepseek/desktop-plugin/README.md")),
    ("LICENSE", include_bytes!("../resources/theme-packs/deepseek/desktop-plugin/LICENSE")),
    ("ASSET_LICENSES.md", include_bytes!("../resources/theme-packs/deepseek/desktop-plugin/ASSET_LICENSES.md")),
    ("manage-desktop.mjs", include_bytes!("../../scripts/manage-deepseek-desktop.mjs")),
];
fn desktop_layout(path: &Path) -> bool {
    path.is_file() && path.parent().is_some_and(|root| root.join("resources/app.asar").is_file()
        && root.join("resources/runtime/cli/bin/dsh.cmd").is_file())
}
pub(super) fn deepseek_desktop_executable() -> Option<PathBuf> {
    match crate::app_links::saved_path("deepseek") {
        Ok(Some(path)) => return desktop_layout(&path).then_some(path),
        Err(_) => return None,
        Ok(None) => {}
    }
    let mut candidates = program_install_candidates("DeepSeek Harness", "DeepSeek Harness.exe");
    if let Some(local) = env::var_os("LOCALAPPDATA") { candidates.push(PathBuf::from(local).join("Programs/DeepSeek Harness/DeepSeek Harness.exe")); }
    for process in process_system().processes().values() {
        if process.name().to_string_lossy().eq_ignore_ascii_case("DeepSeek Harness.exe") {
            if let Some(path) = process.exe() { candidates.push(path.to_path_buf()); }
        }
    }
    candidates.into_iter().find(|path| desktop_layout(path))
}
fn profile_path() -> Option<PathBuf> {
    env::var_os("DSH_HOME").filter(|s| !s.to_string_lossy().trim().is_empty()).map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join(".dsh")))
        .map(|p|p.join("profiles/desktop/package.json"))
}
fn plugin_selected() -> bool {
    let Some(path) = profile_path() else { return false };
    let Ok(bytes) = fs::read(path) else { return false };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else { return false };
    value.get("dependencies").and_then(|v| v.get(PLUGIN_NAME)).is_some()
        && value.pointer("/dsh/profile/bundles").and_then(|v| v.as_array()).is_some_and(|a| a.iter().any(|v| v.as_str()==Some(PLUGIN_NAME)))
}
pub(super) fn deepseek_desktop_status(executable: &Path) -> ExternalTargetStatus {
    let snapshot = detect_named_processes(&["DeepSeek Harness.exe"], Some(executable));
    let ready = plugin_selected();
    let running = snapshot.process_count > 0;
    ExternalTargetStatus {
        target: "deepseek".into(), running, themed: ready,
        stage: if ready { "deepseek_desktop_plugin_ready" } else { "deepseek_desktop_needs_plugin" }.into(),
        theme_state: if ready { "deployed" } else { "available" }.into(),
        theme_scope: "official_plugin".into(),
        process_count: snapshot.process_count, main_process_id: snapshot.main_process_id,
        executable: Some(executable.to_string_lossy().into_owned()),
        theme_root: profile_path().and_then(|p|p.parent().map(|p|p.join("node_modules").join(PLUGIN_NAME).to_string_lossy().into_owned())),
        message: if ready {
            "已关联官方 Harness 桌面端，Diana 插件已配置；日夜在应用原生外观设置中切换，可在插件页禁用恢复。此状态表示部署记录，不冒充界面挂载验证。".into()
        } else if running {
            "已找到官方 Harness 桌面端。首次安装 Diana 插件前请完全退出（不是隐藏到托盘），或在应用的插件页手动添加本机插件；不会修改安装包或开启调试端口。".into()
        } else {
            "已找到官方 Harness 桌面端；确认后通过官方机制安装 Diana 插件并启动。原版启动不装插件，不会打开源码服务或文档文件夹。".into()
        },
    }
}
pub(super) fn launch_deepseek_desktop(executable: &Path, theme: bool, approved: bool) -> Result<ExternalTargetStatus,String> {
    let report = zcode_trust_report(executable).map_err(|_| "无法核验 DeepSeek Harness 官方数字签名。")?;
    if report.signature != "Valid" || !report.signer_thumbprint.eq_ignore_ascii_case("84032578657219876E273E0D1BD303CFE1B82E6F") {
        return Err("DeepSeek Harness 官方签名核验失败，未启动或安装插件。".into());
    }
    if theme && (report.file_version != "0.2.1-rc.3" || report.product_version != "0.2.1.0") {
        return Err("此插件仅适配 Harness Desktop 0.2.1-rc.3；更新后需重新验证。".into());
    }
    let before = deepseek_desktop_status(executable);
    if before.running && theme != before.themed {
        let mut status=before;
        status.message="请先从托盘完全退出 DeepSeek Harness，再用启动器安装/撤下插件；也可在 Harness 插件页直接启用/禁用。本次没有结束进程。".into();
        return Ok(status);
    }
    if theme != before.themed {
        if theme && !approved { return Err("首次安装第三方主题插件前需要确认。".into()); }
        let root=multi_app_root()?.join("deepseek-desktop-plugin");
        write_files(&root,PLUGIN_FILES)?;
        let mut command=Command::new(find_node_runtime()?);
        command.arg(root.join("manage-desktop.mjs")).arg(if theme {"enable"} else {"disable"}).arg(executable).arg(&root);
        configure_windows_powershell_environment(&mut command)?;
        hide_console(&mut command);
        let output=command.output().map_err(|_|"无法运行 Harness 本机插件安装器。")?;
        if !output.status.success() { return Err(format!("Harness 插件操作未完成，保留原安装与配置备份：{}",clean_output(&output.stderr))); }
    }
    spawn_detached(executable, &[])?;
    Ok(deepseek_desktop_status(executable))
}
