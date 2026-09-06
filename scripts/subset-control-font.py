"""Build the small, upright launcher font from official Noto Sans SC.

Requires fonttools 4.64.0 and brotli 1.2.0. The source font is not altered.
Usage: python scripts/subset-control-font.py path/to/NotoSansSC-VF.ttf
"""
import hashlib
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
source_hash = hashlib.sha256(source.read_bytes()).hexdigest().upper()
expected_hash = "A3041811A78C361B1DE50F953C805E0244951C21C5BD412F7232EF0D899AF0DA"
if source_hash != expected_hash:
    raise ValueError("Source differs from the reviewed official font; review before replacing it.")

# Include ASCII, all CJK labels in the frontend, and UI punctuation. Unrelated
# runtime diagnostics continue using the system UI font, not this small subset.
text = "".join(path.read_text(encoding="utf-8") for path in (root / "src").glob("*.tsx"))
required = set(range(32, 127))
required.update(ord(char) for char in text if 0x4E00 <= ord(char) <= 0x9FFF)
required.update(ord(char) for char in "·—…（）「」《》：，。／")
font = TTFont(source, recalcTimestamp=False)
assert font["post"].italicAngle == 0, "Use actual upright outlines, not a deskewed oblique font"
assert not font["OS/2"].fsSelection & 1, "Source must not be italic"
assert not required - set(font.getBestCmap()), "Source is missing required caption glyphs"
options = subset.Options()
options.name_IDs = ["*"]  # Retain the original copyright and license metadata.
options.name_legacy = True
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=required)
subsetter.subset(font)

# Identify the subset as a derivative; don't reuse an upstream reserved name.
names = {1: "Diana UI Sans", 2: "Regular", 3: "DianaUISans-" + source_hash[:12],
         4: "Diana UI Sans", 6: "DianaUISans", 16: "Diana UI Sans",
         17: "Regular", 25: "DianaUISans"}
for record in list(font["name"].names):
    if record.nameID in names:
        font["name"].setName(names[record.nameID], record.nameID,
                            record.platformID, record.platEncID, record.langID)
font.flavor = "woff2"
output = root / "public/assets/diana-brand/fonts/DianaUISans-upright.woff2"
font.save(output)
print(json.dumps({"glyphCodepoints": len(required), "bytes": output.stat().st_size,
                  "sha256": hashlib.sha256(output.read_bytes()).hexdigest().upper(),
                  "italicAngle": font["post"].italicAngle}, indent=2))
