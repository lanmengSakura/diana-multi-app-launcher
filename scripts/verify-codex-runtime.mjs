import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptsDirectory);
const runtimeRoot = path.join(
  projectRoot,
  "src-tauri",
  "resources",
  "diana-runtime",
);

const manifestPath = path.join(runtimeRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];
let checkedFiles = 0;

const attributes = await readFile(
  path.join(projectRoot, ".gitattributes"),
  "utf8",
);
if (
  !attributes.includes(
    "src-tauri/resources/diana-runtime/themes/*.css text eol=lf",
  )
) {
  failures.push(".gitattributes does not lock Diana runtime CSS to LF");
}

for (const [manifestRelativePath, expectedHash] of Object.entries(
  manifest.sha256 ?? {},
)) {
  const normalizedPath = manifestRelativePath.replaceAll("\\", "/");
  const sourcePath = normalizedPath.startsWith("assets/")
    ? path.join(projectRoot, "theme-preview", normalizedPath)
    : path.join(runtimeRoot, normalizedPath);
  let bytes;
  try {
    bytes = await readFile(sourcePath);
  } catch (error) {
    failures.push(`${normalizedPath}: ${error.message}`);
    continue;
  }

  checkedFiles += 1;
  if (normalizedPath.endsWith(".css") && bytes.includes(0x0d)) {
    failures.push(`${normalizedPath}: contains CR bytes; expected LF-only CSS`);
  }

  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) {
    failures.push(
      `${normalizedPath}: SHA-256 mismatch (expected ${expectedHash}, actual ${actualHash})`,
    );
  }
}

if (failures.length > 0) {
  console.error("Diana Codex runtime integrity check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Diana Codex runtime integrity OK (${checkedFiles} protected files, LF locked).`,
);
