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

pub(crate) fn registration_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or("无法定位 ZCode 本机适配记录：LOCALAPPDATA 未设置。")?;
    registration_path_under(&base)
}

fn registration_path_under(base: &Path) -> Result<PathBuf, String> {
    if !local_absolute(base) {
        return Err("无法定位 ZCode 本机适配记录：LOCALAPPDATA 不是本机绝对路径。".into());
    }
    Ok(base.join("DianaZCodeTheme").join("local-runtime.json"))
}

pub(crate) fn load() -> Result<Option<LocalRuntime>, String> {
    load_from_path(&registration_path()?)
}

fn load_from_path(path: &Path) -> Result<Option<LocalRuntime>, String> {
    let raw = match fs::read(&path) {
        Ok(raw) if raw.len() <= 64 * 1024 => raw,
        Ok(_) => return Err("ZCode 本机适配记录过大；未使用内置旧版绕过。".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("无法读取 ZCode 本机适配记录（{}）：{error}", path.display())),
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
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let directory = std::env::temp_dir().join(format!(
                "diana-local-zcode-test-{}-{}",
                std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed),
            ));
            fs::create_dir(&directory).unwrap();
            Self(directory)
        }

        fn record(&self) -> serde_json::Value {
            serde_json::json!({
                "schemaVersion": 1,
                "root": self.0,
                "executable": self.0.join("ZCode.exe"),
                "fileVersion": "3.16.3.8992",
                "productVersion": "3.16.3.8992",
                "adapterVersion": "local-3.16.3-v1",
                "signerThumbprint": "6F7B147DC610F91425750D2449C46002C3385BCF",
                "sha256": {},
            })
        }

        fn write(&self, bytes: &[u8]) -> PathBuf {
            let path = registration_path_under(&self.0).unwrap();
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, bytes).unwrap();
            path
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            // Only this test's uniquely created directory; never the real registration.
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn registration_path_requires_a_local_absolute_base() {
        for base in ["", ".", "relative", r"\\server\share", "//server/share"] {
            assert!(registration_path_under(Path::new(base)).is_err());
        }
    }

    #[test]
    fn reads_registered_runtime_from_unicode_path_with_or_without_bom() {
        let fixture = Fixture::new();
        let base = fixture.0.join("中文用户").join("Local App Data");
        let path = registration_path_under(&base).unwrap();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let raw = serde_json::to_vec(&fixture.record()).unwrap();
        for prefix in [b"".as_slice(), b"\xef\xbb\xbf".as_slice()] {
            fs::write(&path, [prefix, &raw].concat()).unwrap();
            let runtime = load_from_path(&path).unwrap().expect("registered, not legacy");
            assert_eq!(runtime.file_version, "3.16.3.8992");
            assert_eq!(runtime.adapter_version, "local-3.16.3-v1");
        }
    }

    #[test]
    fn only_a_missing_registration_uses_legacy_fallback() {
        let fixture = Fixture::new();
        let path = registration_path_under(&fixture.0).unwrap();
        assert!(load_from_path(&path).unwrap().is_none());
        fixture.write(b"not json");
        assert!(load_from_path(&path).is_err());
        fixture.write(&vec![b' '; 64 * 1024 + 1]);
        assert!(load_from_path(&path).is_err());
    }

    #[test]
    fn wrong_version_or_signer_cannot_fall_back_to_legacy() {
        let fixture = Fixture::new();
        for (key, value) in [
            ("fileVersion", "3.6.5.4145"),
            ("productVersion", "3.16.3.0"),
            ("adapterVersion", "unreviewed"),
            ("signerThumbprint", "untrusted"),
        ] {
            let mut record = fixture.record();
            record[key] = value.into();
            let path = fixture.write(&serde_json::to_vec(&record).unwrap());
            assert!(load_from_path(&path).is_err(), "{key}");
        }
    }

    #[test]
    fn loaded_runtime_still_requires_matching_path_and_file_hashes() {
        let fixture = Fixture::new();
        let mut record = fixture.record();
        for name in ["adapter.mjs", "runtime-template.js", "theme.css"] {
            fs::write(fixture.0.join(name), b"test fixture only").unwrap();
            record["sha256"][name] = format!("{:x}", Sha256::digest(b"test fixture only")).into();
        }
        let path = fixture.write(&serde_json::to_vec(&record).unwrap());
        let runtime = load_from_path(&path).unwrap().unwrap();
        assert!(runtime.verify(&runtime.executable).is_ok());
        assert!(runtime.verify(&fixture.0.join("Other.exe")).is_err());
        fs::write(fixture.0.join("theme.css"), b"changed").unwrap();
        assert!(runtime.verify(&runtime.executable).is_err());
    }

    #[test]
    fn rejects_escaping_manifest_entries() {
        for path in ["../x", "/x", "C:/x", "a/../../x", r"a\x", "a//x", "./x"] { assert!(!super::safe_relative(path)); }
        assert!(super::safe_relative("assets/portrait.png"));
    }
}
