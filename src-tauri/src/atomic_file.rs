use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

/// Write beside the destination, then replace in one rename. On failure the
/// previous record remains readable; never delete it to make rename succeed.
pub(crate) fn write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("missing parent"))?;
    fs::create_dir_all(parent)?;
    let (temporary, mut file) = loop {
        let temporary = parent.join(format!(
            ".diana-state-{}-{}.tmp",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        match OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
        {
            Ok(file) => break (temporary, file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    };
    let outcome = file.write_all(bytes).and_then(|_| file.sync_all());
    drop(file);
    let outcome = outcome.and_then(|_| fs::rename(&temporary, path));
    if outcome.is_err() {
        // This is only the exclusively created temporary file, never user data.
        let _ = fs::remove_file(&temporary);
    }
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_complete_record_and_preserves_destination_on_failure() {
        let root = std::env::temp_dir().join(format!(
            "diana-atomic-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = root.join("session.json");
        write(&path, br#"{"status":"applied"}"#).unwrap();
        write(&path, br#"{"status":"disabled"}"#).unwrap();
        assert_eq!(fs::read(&path).unwrap(), br#"{"status":"disabled"}"#);
        let blocked = root.join("blocked.json");
        fs::create_dir(&blocked).unwrap();
        fs::write(blocked.join("keep.txt"), b"keep").unwrap();
        assert!(write(&blocked, b"replacement").is_err());
        assert_eq!(fs::read(blocked.join("keep.txt")).unwrap(), b"keep");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
        fs::remove_file(blocked.join("keep.txt")).unwrap();
        fs::remove_dir(blocked).unwrap();
        fs::remove_file(path).unwrap();
        fs::remove_dir(root).unwrap();
    }
}
