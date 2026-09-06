# Diana launcher caption font

- Typeface: Diana UI Sans, a renamed upright subset of Noto Sans SC.
- Official source: https://github.com/google/fonts/tree/main/ofl/notosanssc
- Source file: `NotoSansSC[wght].ttf`.
- Source SHA-256: `A3041811A78C361B1DE50F953C805E0244951C21C5BD412F7232EF0D899AF0DA`.
- Local filename: `DianaUISans-upright.woff2`.
- Subset SHA-256: `3CFB7B737EF5BDABCAD19EADE8CC36256A88B951D350C47B5966B198A17F3EF4`.
- Size: 109,148 bytes, 459 codepoints, variable weight 100–900, italic angle 0.
- License and original copyright: [NotoSansSC-OFL.txt](NotoSansSC-OFL.txt), SIL OFL 1.1.
- Rebuild: `python scripts/subset-control-font.py path/to/NotoSansSC-VF.ttf`
  with fonttools 4.64.0 and brotli 1.2.0. Rebuild after adding Chinese captions.

Used only for short decorative launcher controls. Status messages, diagnostics,
small metadata, and application content retain their normal UI font. The font
loads from bundled app assets; it is not installed into Windows or fetched from
a CDN at runtime. Glyphs are genuinely upright; no deskewing or synthetic slant.
The source font's copyright and license metadata are preserved. The subset is
renamed to identify the derivative, without using the reserved font name 'Source'.
