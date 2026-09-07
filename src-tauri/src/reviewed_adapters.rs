use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

include!("reviewed_adapter_files.rs");

fn files(target: &str) -> Result<&'static [(&'static str, &'static [u8])], String> {
    match target {
        "cursor" => Ok(CURSOR_FILES),
        "grokbot" => Ok(GROKBOT_FILES),
        _ => Err("未知适配器。".into()),
    }
}

pub fn version(target: &str) -> &'static str {
    match target {
        "cursor" => CURSOR_VERSION,
        "grokbot" => GROKBOT_VERSION,
        _ => "",
    }
}

pub fn manifest_matches(target: &str, content: &[u8]) -> bool {
    files(target)
        .ok()
        .and_then(|items| items.iter().find(|(name, _)| *name == "SHA256SUMS.txt"))
        .map(|(_, trusted)| *trusted == content)
        .unwrap_or(false)
}

pub fn safe_relative(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('\\')
        && !value.contains(':')
        && value
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
        && Path::new(value)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}

fn no_links(target: &Path) -> Result<(), String> {
    for item in target.ancestors() {
        if let Ok(meta) = fs::symlink_metadata(item) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err("适配器目录包含重解析点，本次停止。".into());
                }
            }
            if meta.file_type().is_symlink() {
                return Err("适配器目录包含符号链接，本次停止。".into());
            }
        }
    }
    Ok(())
}

pub fn verify(root: &Path, target: &str) -> Result<(), String> {
    let manifest =
        fs::read(root.join("SHA256SUMS.txt")).map_err(|e| format!("适配器清单缺失：{e}"))?;
    if !manifest_matches(target, &manifest) {
        return Err("适配器清单与启动器内置审核版本不一致。".into());
    }
    let text = std::str::from_utf8(&manifest).map_err(|_| "适配器清单编码无效。")?;
    let mut seen = std::collections::HashSet::new();
    for line in text.lines() {
        let (expected, relative) = line.split_once("  ").ok_or("适配器清单格式无效。")?;
        if !safe_relative(relative) || !seen.insert(relative) {
            return Err("适配器清单含越界或重复路径。".into());
        }
        let file = root.join(relative);
        no_links(&file)?;
        let bytes = fs::read(&file).map_err(|_| format!("适配器文件缺失：{relative}"))?;
        if format!("{:x}", Sha256::digest(bytes)) != expected {
            return Err(format!("适配器文件校验失败：{relative}"));
        }
    }
    Ok(())
}

pub fn ensure(base: &Path, target: &str, shared: &[(&str, &[u8])]) -> Result<PathBuf, String> {
    let root = base
        .join("reviewed-runtimes")
        .join(target)
        .join(version(target));
    no_links(&root)?;
    for (name, bytes) in files(target)?.iter().copied().chain(
        shared
            .iter()
            .copied()
            .filter(|(name, _)| name.starts_with("assets/")),
    ) {
        if !safe_relative(name) {
            return Err("内置资源路径无效。".into());
        }
        let dest = root.join(name);
        no_links(&dest)?;
        fs::create_dir_all(dest.parent().ok_or("适配器目录无效。")?).map_err(|e| e.to_string())?;
        // Restore only immutable files from compiled bytes, never session/restore records.
        if fs::read(&dest).ok().as_deref() != Some(bytes) {
            fs::write(&dest, bytes).map_err(|e| e.to_string())?;
        }
    }
    verify(&root, target)?;
    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_reject_traversal_and_windows_streams() {
        for value in [
            "../x", "a/../b", "C:/x", "/x", "a\\b", "a//b", "a:stream", "",
        ] {
            assert!(!safe_relative(value), "{value}");
        }
        assert!(safe_relative("extension/themes/diana-day-color-theme.json"));
    }
    #[test]
    fn embedded_manifests_are_exact_not_self_trusting() {
        for target in ["cursor", "grokbot"] {
            let content = files(target)
                .unwrap()
                .iter()
                .find(|(name, _)| *name == "SHA256SUMS.txt")
                .unwrap()
                .1;
            assert!(manifest_matches(target, content));
            let mut modified = content.to_vec();
            modified[0] ^= 1;
            assert!(!manifest_matches(target, &modified));
        }
    }
}
