//! A locally registered, checksum-pinned adapter. No new CDP implementation is
//! bundled or downloaded here. Registration is not consent to start debugging.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::{Path, PathBuf}};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LocalRuntime {
    schema_version: u32,
    pub root: PathBuf,
    pub executable: PathBuf,
    pub file_version: String,
    pub product_version: String,
    pub adapter_version: String,
    pub signer_thumbprint: String,
    sha256: BTreeMap<String, String>,
}

fn local_absolute(path: &Path) -> bool {
    let s = path.to_string_lossy();
    path.is_absolute() && !s.starts_with(r"\\") && !s.starts_with("//")
        && !path.components().any(|p| matches!(p, std::path::Component::ParentDir))
}

pub(crate) fn load() -> Result<Option<LocalRuntime>, String> {
    let Some(base) = std::env::var_os("LOCALAPPDATA") else { return Ok(None) };
    let path = PathBuf::from(base).join("DianaZCodeTheme/local-runtime.json");
    let raw = match fs::read(&path) {
        Ok(raw) if raw.len() <= 64 * 1024 => raw,
        Ok(_) => return Err("ZCode 本机适配记录过大；未使用内置旧版绕过。".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取 ZCode 本机适配记录。".into()),
    };
    let record: LocalRuntime = serde_json::from_slice(raw.strip_prefix(&[0xef,0xbb,0xbf]).unwrap_or(&raw))
        .map_err(|_| "ZCode 本机适配记录格式无效；未启动应用。")?;
    if record.schema_version != 1 || !local_absolute(&record.root) || !local_absolute(&record.executable)
        || record.file_version != "3.16.3.8992" || record.product_version != "3.16.3.8992"
        || record.adapter_version != "local-3.16.3-v1"
        || record.signer_thumbprint != "6F7B147DC610F91425750D2449C46002C3385BCF" {
        return Err("ZCode 本机适配记录与这次确认的版本不一致。".into());
    }
    Ok(Some(record))
}

impl LocalRuntime {
    pub fn verify(&self, executable: &Path) -> Result<(), String> {
        if !self.executable.to_string_lossy().eq_ignore_ascii_case(&executable.to_string_lossy()) {
            return Err("ZCode 关联位置已改变，请重新验证本机适配器。".into());
        }
        for required in ["adapter.mjs", "runtime-template.js", "theme.css"] {
            if !self.sha256.contains_key(required) { return Err("ZCode 本机适配记录缺少校验项。".into()); }
        }
        for (relative, expected) in &self.sha256 {
            if !safe_relative(relative) { return Err("ZCode 本机适配记录包含越界路径。".into()); }
            let path = self.root.join(relative);
            let metadata = fs::symlink_metadata(&path).map_err(|_| "ZCode 本机适配文件缺失。")?;
            if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 16 * 1024 * 1024 {
                return Err("ZCode 本机适配文件类型或大小无效。".into());
            }
            let actual = format!("{:x}", Sha256::digest(fs::read(&path).map_err(|_| "无法读取本机适配文件。")?));
            if !actual.eq_ignore_ascii_case(expected) { return Err(format!("ZCode 本机适配文件校验失败：{relative}")); }
        }
        Ok(())
    }
}

fn safe_relative(value: &str) -> bool {
    !value.is_empty() && !value.starts_with('/') && !value.contains(['\\', ':'])
        && value.split('/').all(|part| !part.is_empty() && part != "." && part != "..")
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_escaping_manifest_entries() {
        for path in ["../x", "/x", "C:/x", "a/../../x", r"a\x", "a//x", "./x"] { assert!(!super::safe_relative(path)); }
        assert!(super::safe_relative("assets/portrait.png"));
    }
}
