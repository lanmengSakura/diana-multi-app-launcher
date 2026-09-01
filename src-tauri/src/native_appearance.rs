use std::env;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use toml_edit::{DocumentMut, InlineTable, Item, Table, Value};

const MANAGED_KEYS: &[&str] = &[
    "appearanceTheme",
    "appearanceLightCodeThemeId",
    "appearanceDarkCodeThemeId",
    "appearanceLightChromeTheme",
    "appearanceDarkChromeTheme",
];

#[derive(Clone, Copy)]
struct NativePalette {
    accent: &'static str,
    contrast: i64,
    ink: &'static str,
    surface: &'static str,
    diff_added: &'static str,
    diff_removed: &'static str,
    skill: &'static str,
}

const DIANA_DAY: NativePalette = NativePalette {
    accent: "#B84970",
    contrast: 45,
    ink: "#2C2529",
    surface: "#FBF8F6",
    diff_added: "#B8DDC4",
    diff_removed: "#E8A9BF",
    skill: "#B84970",
};

const DIANA_NIGHT: NativePalette = NativePalette {
    accent: "#D86E91",
    contrast: 60,
    ink: "#F3EEF0",
    surface: "#0D0C0F",
    diff_added: "#9CC9AC",
    diff_removed: "#D78BA5",
    skill: "#D86E91",
};

pub struct NativeAppearancePaths {
    pub config: PathBuf,
    pub active_backup: PathBuf,
    pub history_directory: PathBuf,
    pub legacy_codedrobe_backup: Option<PathBuf>,
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

pub fn resolve_paths() -> Result<NativeAppearancePaths, String> {
    let codex_home = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(|value| PathBuf::from(value).join(".codex")))
        .ok_or_else(|| "无法确定当前用户的 Codex 配置目录。".to_string())?;
    let local_app_data = env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "无法确定当前用户的 LocalAppData 目录。".to_string())?;
    let local_app_data = PathBuf::from(local_app_data);
    let state_root = local_app_data
        .clone()
        .join("DianaCodexLauncher")
        .join("native-appearance");
    Ok(NativeAppearancePaths {
        config: codex_home.join("config.toml"),
        active_backup: state_root.join("config.before-diana.toml"),
        history_directory: state_root.join("history"),
        legacy_codedrobe_backup: Some(
            local_app_data
                .join("CodeDrobe")
                .join("config.before-codedrobe.toml"),
        ),
    })
}

fn read_document(path: &Path, label: &str) -> Result<DocumentMut, String> {
    let contents = fs::read_to_string(path).map_err(|error| format!("无法读取{label}：{error}"))?;
    contents
        .trim_start_matches('\u{feff}')
        .parse::<DocumentMut>()
        .map_err(|error| format!("{label}不是有效 TOML：{error}"))
}

fn serialize_document(document: &DocumentMut) -> String {
    let mut contents = document.to_string();
    if !contents.ends_with('\n') {
        contents.push('\n');
    }
    contents
}

fn write_transactionally(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "目标配置文件没有父目录。".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建配置目录：{error}"))?;

    let suffix = format!("{}-{}", std::process::id(), timestamp_millis());
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("config.toml");
    let temporary = parent.join(format!(".{file_name}.diana-{suffix}.tmp"));
    let previous = parent.join(format!(".{file_name}.diana-{suffix}.previous"));

    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| format!("无法创建临时配置：{error}"))?;
    file.write_all(contents.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("无法写入临时配置：{error}"))?;
    drop(file);

    let had_existing = path.exists();
    if had_existing {
        fs::rename(path, &previous).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            format!("无法暂存原配置：{error}")
        })?;
    }

    if let Err(error) = fs::rename(&temporary, path) {
        if had_existing {
            let _ = fs::rename(&previous, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("无法替换 Codex 配置：{error}"));
    }

    if had_existing {
        let _ = fs::remove_file(previous);
    }
    Ok(())
}

fn palette_table(palette: NativePalette) -> InlineTable {
    let mut fonts = InlineTable::new();
    fonts.insert("code", Value::from("Cascadia Code"));
    fonts.insert("ui", Value::from("Microsoft YaHei UI"));

    let mut semantic_colors = InlineTable::new();
    semantic_colors.insert("diffAdded", Value::from(palette.diff_added));
    semantic_colors.insert("diffRemoved", Value::from(palette.diff_removed));
    semantic_colors.insert("skill", Value::from(palette.skill));

    let mut table = InlineTable::new();
    table.insert("accent", Value::from(palette.accent));
    table.insert("contrast", Value::from(palette.contrast));
    table.insert("fonts", Value::InlineTable(fonts));
    table.insert("ink", Value::from(palette.ink));
    table.insert("opaqueWindows", Value::from(true));
    table.insert("semanticColors", Value::InlineTable(semantic_colors));
    table.insert("surface", Value::from(palette.surface));
    table
}

fn desktop_table_mut(document: &mut DocumentMut) -> Result<&mut Table, String> {
    if !document.contains_key("desktop") {
        document["desktop"] = Item::Table(Table::new());
    }
    document["desktop"]
        .as_table_mut()
        .ok_or_else(|| "Codex 配置中的 [desktop] 不是有效表格。".to_string())
}

fn apply_to_document(document: &mut DocumentMut, mode: &str) -> Result<(), String> {
    if !matches!(mode, "dark" | "light" | "system") {
        return Err("原生外观模式必须是 dark、light 或 system。".to_string());
    }
    let desktop = desktop_table_mut(document)?;
    desktop.insert("appearanceTheme", Item::Value(Value::from(mode)));
    desktop.insert(
        "appearanceLightCodeThemeId",
        Item::Value(Value::from("codex")),
    );
    desktop.insert(
        "appearanceDarkCodeThemeId",
        Item::Value(Value::from("codex")),
    );
    desktop.insert(
        "appearanceLightChromeTheme",
        Item::Value(Value::InlineTable(palette_table(DIANA_DAY))),
    );
    desktop.insert(
        "appearanceDarkChromeTheme",
        Item::Value(Value::InlineTable(palette_table(DIANA_NIGHT))),
    );
    Ok(())
}

fn restore_document(current: &mut DocumentMut, backup: &DocumentMut) -> Result<(), String> {
    let original_desktop = backup.get("desktop").and_then(Item::as_table);
    let current_desktop = desktop_table_mut(current)?;
    for key in MANAGED_KEYS {
        if let Some(item) = original_desktop.and_then(|table| table.get(key)) {
            current_desktop.insert(key, item.clone());
        } else {
            current_desktop.remove(key);
        }
    }
    Ok(())
}

fn contains_legacy_diana_palette(document: &DocumentMut) -> bool {
    let Some(desktop) = document.get("desktop").and_then(Item::as_table) else {
        return false;
    };
    ["appearanceLightChromeTheme", "appearanceDarkChromeTheme"]
        .into_iter()
        .filter_map(|key| desktop.get(key))
        .map(Item::to_string)
        .any(|serialized| {
            (serialized.contains("#D86E91")
                && serialized.contains("#F3EEF0")
                && serialized.contains("#0D0C0F"))
                || (serialized.contains("#B84970")
                    && serialized.contains("#2C2529")
                    && serialized.contains("#FBF8F6"))
        })
}

fn ensure_backup(paths: &NativeAppearancePaths) -> Result<bool, String> {
    if paths.active_backup.is_file() {
        return Ok(false);
    }
    let original = fs::read_to_string(&paths.config)
        .map_err(|error| format!("无法读取 Codex 原始配置：{error}"))?;
    let mut backup_document = original
        .trim_start_matches('\u{feff}')
        .parse::<DocumentMut>()
        .map_err(|error| format!("Codex 原始配置不是有效 TOML：{error}"))?;

    let mut backup_contents = original;
    if contains_legacy_diana_palette(&backup_document) {
        if let Some(legacy_path) = paths
            .legacy_codedrobe_backup
            .as_ref()
            .filter(|path| path.is_file())
        {
            let legacy = read_document(legacy_path, "旧 Diana 原生外观恢复点")?;
            restore_document(&mut backup_document, &legacy)?;
            backup_contents = serialize_document(&backup_document);
        }
    }
    write_transactionally(&paths.active_backup, &backup_contents)?;
    Ok(true)
}

pub fn apply(mode: &str) -> Result<bool, String> {
    let paths = resolve_paths()?;
    apply_at(&paths, mode)
}

pub fn is_managed() -> bool {
    resolve_paths()
        .map(|paths| paths.active_backup.is_file())
        .unwrap_or(false)
}

fn apply_at(paths: &NativeAppearancePaths, mode: &str) -> Result<bool, String> {
    if !paths.config.is_file() {
        return Err(format!("未找到 Codex 配置文件：{}", paths.config.display()));
    }
    let backup_created = ensure_backup(paths)?;
    let mut document = read_document(&paths.config, "Codex 配置")?;
    apply_to_document(&mut document, mode)?;
    write_transactionally(&paths.config, &serialize_document(&document))?;
    Ok(backup_created)
}

pub fn restore() -> Result<bool, String> {
    let paths = resolve_paths()?;
    restore_at(&paths)
}

fn restore_at(paths: &NativeAppearancePaths) -> Result<bool, String> {
    if !paths.active_backup.is_file() {
        return Ok(false);
    }
    let mut current = read_document(&paths.config, "当前 Codex 配置")?;
    let backup = read_document(&paths.active_backup, "Diana 原生外观备份")?;
    restore_document(&mut current, &backup)?;
    write_transactionally(&paths.config, &serialize_document(&current))?;

    fs::create_dir_all(&paths.history_directory)
        .map_err(|error| format!("无法创建 Diana 恢复历史目录：{error}"))?;
    let archived = paths
        .history_directory
        .join(format!("config.restored-{}.toml", timestamp_millis()));
    fs::rename(&paths.active_backup, archived)
        .map_err(|error| format!("原配置已恢复，但无法归档恢复点：{error}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::{apply_at, restore_at, NativeAppearancePaths};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};
    use toml_edit::{DocumentMut, Item};

    fn fixture_paths(name: &str) -> NativeAppearancePaths {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("diana-native-{name}-{unique}"));
        NativeAppearancePaths {
            config: root.join("config.toml"),
            active_backup: root.join("state").join("config.before-diana.toml"),
            history_directory: root.join("state").join("history"),
            legacy_codedrobe_backup: None,
        }
    }

    fn value<'a>(document: &'a DocumentMut, key: &str) -> &'a Item {
        document["desktop"]
            .as_table()
            .expect("desktop table should exist")
            .get(key)
            .expect("managed key should exist")
    }

    #[test]
    fn writes_both_native_palettes_without_touching_unrelated_settings() {
        let paths = fixture_paths("apply");
        fs::create_dir_all(paths.config.parent().expect("config parent should exist"))
            .expect("fixture directory should be created");
        fs::write(
            &paths.config,
            r##"model = "gpt-test"

[desktop]
usePointerCursors = true
appearanceTheme = "dark"
appearanceLightChromeTheme = { ink = "#FFFFFF", surface = "#000000" }

[desktop.appearanceDarkChromeTheme]
accent = "#0169cc"
surface = "#111111"

[projects.'e:\keep-me']
trust_level = "trusted"
"##,
        )
        .expect("fixture config should be written");

        assert!(apply_at(&paths, "light").expect("native appearance apply should succeed"));
        let updated = fs::read_to_string(&paths.config).expect("updated config should be readable");
        let document = updated
            .parse::<DocumentMut>()
            .expect("updated config should remain valid TOML");

        assert_eq!(value(&document, "appearanceTheme").as_str(), Some("light"));
        assert!(updated.contains("#FBF8F6"));
        assert!(updated.contains("#0D0C0F"));
        assert!(updated.contains("usePointerCursors = true"));
        assert!(updated.contains("[projects.'e:\\keep-me']"));
        assert!(paths.active_backup.is_file());

        fs::remove_dir_all(paths.config.parent().expect("fixture root should exist"))
            .expect("fixture should be removable");
    }

    #[test]
    fn restore_merges_only_managed_keys_and_archives_restore_point() {
        let paths = fixture_paths("restore");
        fs::create_dir_all(paths.config.parent().expect("config parent should exist"))
            .expect("fixture directory should be created");
        let original = r##"model = "gpt-original"

[desktop]
appearanceTheme = "dark"
usePointerCursors = true

[desktop.appearanceDarkChromeTheme]
surface = "#111111"
"##;
        fs::write(&paths.config, original).expect("fixture config should be written");
        apply_at(&paths, "light").expect("native appearance apply should succeed");

        let current = fs::read_to_string(&paths.config).expect("current config should be readable");
        fs::write(
            &paths.config,
            current.replace("model = \"gpt-original\"", "model = \"gpt-later\""),
        )
        .expect("later unrelated change should be written");

        assert!(restore_at(&paths).expect("native appearance restore should succeed"));
        let restored =
            fs::read_to_string(&paths.config).expect("restored config should be readable");
        assert!(restored.contains("model = \"gpt-later\""));
        assert!(restored.contains("appearanceTheme = \"dark\""));
        assert!(restored.contains("surface = \"#111111\""));
        assert!(!restored.contains("appearanceLightChromeTheme"));
        assert!(!paths.active_backup.exists());
        assert_eq!(
            fs::read_dir(&paths.history_directory)
                .expect("history should exist")
                .count(),
            1
        );

        fs::remove_dir_all(paths.config.parent().expect("fixture root should exist"))
            .expect("fixture should be removable");
    }

    #[test]
    fn imports_only_managed_fields_from_legacy_restore_point() {
        let mut paths = fixture_paths("legacy-migration");
        let root = paths
            .config
            .parent()
            .expect("config parent should exist")
            .to_path_buf();
        fs::create_dir_all(&root).expect("fixture directory should be created");
        let legacy_path = root.join("config.before-codedrobe.toml");
        paths.legacy_codedrobe_backup = Some(legacy_path.clone());

        fs::write(
            &paths.config,
            r##"model = "gpt-current"

[desktop]
appearanceTheme = "dark"
usePointerCursors = true
appearanceLightChromeTheme = { accent = "#D86E91", ink = "#F3EEF0", surface = "#0D0C0F" }
"##,
        )
        .expect("contaminated current config should be written");
        fs::write(
            &legacy_path,
            r##"model = "gpt-old"

[desktop]
appearanceTheme = "dark"
appearanceLightCodeThemeId = "codex"
appearanceLightChromeTheme = { accent = "#0169cc", ink = "#0d0d0d", surface = "#ffffff" }
"##,
        )
        .expect("legacy restore point should be written");

        apply_at(&paths, "light").expect("native appearance apply should succeed");
        let backup = fs::read_to_string(&paths.active_backup)
            .expect("migrated restore point should be readable");
        assert!(backup.contains("model = \"gpt-current\""));
        assert!(backup.contains("usePointerCursors = true"));
        assert!(backup.contains("surface = \"#ffffff\""));
        assert!(!backup.contains("model = \"gpt-old\""));
        assert!(!backup.contains("surface = \"#0D0C0F\""));

        fs::remove_dir_all(root).expect("fixture should be removable");
    }
}
