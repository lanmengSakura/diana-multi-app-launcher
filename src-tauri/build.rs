use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const MUSIC_ENV: &str = "DIANA_HOPEFUL_DREAMER_AUDIO";
const MUSIC_MAX_BYTES: u64 = 64 * 1024 * 1024;
const MUSIC_OUTPUT_NAME: &str = "hopeful-dreamer.bin";
const MUSIC_CANDIDATES: &[&str] = &[
    "Hopeful Dreamer.mp3",
    "Hopeful Dreamer.m4a",
    "Hopeful Dreamer.ogg",
    "Hopeful Dreamer.opus",
    "Hopeful Dreamer.wav",
    "Hopeful Dreamer.flac",
];

fn music_mime_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())?
        .to_ascii_lowercase()
        .as_str()
    {
        "mp3" => Some("audio/mpeg"),
        "m4a" | "mp4" => Some("audio/mp4"),
        "ogg" | "opus" => Some("audio/ogg"),
        "wav" => Some("audio/wav"),
        "flac" => Some("audio/flac"),
        _ => None,
    }
}

fn discover_music_source(manifest_dir: &Path) -> Option<PathBuf> {
    if let Some(configured) = env::var_os(MUSIC_ENV) {
        let path = PathBuf::from(configured);
        if !path.is_file() {
            panic!("{MUSIC_ENV} points to a missing file: {}", path.display());
        }
        return Some(path);
    }

    let private_assets = manifest_dir.join("private-assets");
    MUSIC_CANDIDATES
        .iter()
        .map(|name| private_assets.join(name))
        .find(|path| path.is_file())
}

fn prepare_bundled_music() {
    println!("cargo:rerun-if-env-changed={MUSIC_ENV}");

    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let output_path = out_dir.join(MUSIC_OUTPUT_NAME);
    let private_assets = manifest_dir.join("private-assets");
    for candidate in MUSIC_CANDIDATES {
        println!(
            "cargo:rerun-if-changed={}",
            private_assets.join(candidate).display()
        );
    }

    let Some(source) = discover_music_source(&manifest_dir) else {
        fs::write(&output_path, []).expect("failed to write empty bundled-music sentinel");
        println!("cargo:rustc-env=DIANA_BUNDLED_MUSIC_FILENAME=");
        println!("cargo:rustc-env=DIANA_BUNDLED_MUSIC_MIME=");
        return;
    };

    let mime_type = music_mime_type(&source).unwrap_or_else(|| {
        panic!(
            "unsupported {MUSIC_ENV} format for {} (use MP3, M4A, OGG, OPUS, WAV, or FLAC)",
            source.display()
        )
    });
    let metadata = fs::metadata(&source).expect("failed to read bundled-music metadata");
    if metadata.len() == 0 {
        panic!("{MUSIC_ENV} points to an empty file: {}", source.display());
    }
    if metadata.len() > MUSIC_MAX_BYTES {
        panic!(
            "{MUSIC_ENV} exceeds the 64 MiB launcher limit: {}",
            source.display()
        );
    }

    fs::copy(&source, &output_path).expect("failed to stage bundled music");
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Hopeful Dreamer");
    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rustc-env=DIANA_BUNDLED_MUSIC_FILENAME={file_name}");
    println!("cargo:rustc-env=DIANA_BUNDLED_MUSIC_MIME={mime_type}");
}

fn main() {
    prepare_bundled_music();
    tauri_build::build();
}
