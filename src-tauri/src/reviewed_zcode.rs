//! Distributable 3.16 adapter. No personal registration or private directory.
pub const VERSION: &str = "reviewed-zcode-3.16.3-v1";
pub const FILES: &[(&str, &[u8])] = &[
    ("adapter.mjs", include_bytes!("../resources/theme-packs/zcode/runtime-3.16.3/adapter.mjs")),
    ("rules.mjs", include_bytes!("../resources/theme-packs/zcode/runtime-3.16.3/rules.mjs")),
    ("runtime-template.js", include_bytes!("../resources/theme-packs/zcode/runtime-3.16.3/runtime-template.js")),
    ("layout.css", include_bytes!("../resources/theme-packs/zcode/runtime-3.16.3/layout.css")),
    ("theme.css", include_bytes!("../resources/theme-packs/zcode/runtime/theme.css")),
    ("README.md", include_bytes!("../resources/theme-packs/zcode/runtime-3.16.3/README.md")),
    ("LICENSE", include_bytes!("../../LICENSE")),
    ("ASSET_LICENSES.md", include_bytes!("../../ASSET_LICENSES.md")),
    ("SHA256SUMS.txt", include_bytes!("../resources/theme-packs/zcode/runtime-3.16.3/SHA256SUMS.txt")),
];
