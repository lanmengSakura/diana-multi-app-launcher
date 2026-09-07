# Diana Multi-App Launcher — Visual Spec

## Product role

The launcher is a small Windows utility and a collectible Diana-themed desktop object. It must keep the real Codex status, theme switch, mount action, and native restore action readable while avoiding the appearance of a conventional rectangular settings window.

## V1 art direction

- Concept: a floating irregular electronic character stand with a separate hanging status tag; no display plinth.
- Viewing distance: desktop use at roughly 50–80 cm.
- Temperature: warm, playful, refined, and quiet enough for repeated use.
- Shape language: asymmetric electronic plaque, clipped corners, thin rose edge light, and two translucent connector rings.
- Production artwork: `public/assets/diana-brand/diana-launcher-integrated-edgecut-v11.png`; the approved high-fidelity v10 composition with only its exterior generation background removed. The main plaque, Diana, A-Cao, Jiaxintang, connector rings, and hanging status plaque remain one integrated image.
- Fidelity rule: every visible RGB pixel is byte-identical to the approved v10 source. Alpha is used only at the exterior cut boundary; no global opacity, brightness, saturation, blur, or character repaint is applied.
- Control fidelity: whenever the baked v10 dark-selected state matches the live state, the DOM hit target remains visually transparent and the original pixels stay visible. Light/system states use complete generated top-row faces from the same approved control crop; they are never repaired with local cover patches. Dynamic labels remain real DOM content.
- App icon: the separate Diana pixel-dango artwork is active in the Tauri/Windows icon set and remains independent from the integrated launcher board.

## Assets

| Role | File | Status |
| --- | --- | --- |
| Temporary star mark | `public/assets/diana-brand/temporary-mark.png` | Real temporary asset; may be used as a subtle marker only |
| Diana launcher composition master | `public/assets/diana-brand/diana-launcher-downsample-safe-v10.png` | Approved v10 RGB master |
| Integrated edge-cut launcher artwork | `public/assets/diana-brand/diana-launcher-integrated-edgecut-v11.png` | Active production asset; source RGB preserved, exterior alpha only |
| Dark-selected button deck | `public/assets/diana-brand/button-decks/theme-dark-selected-full-v15.png` | Blank selected-left acrylic state; real DOM text/icons are overlaid |
| Light-selected button deck | `public/assets/diana-brand/button-decks/theme-light-selected-full-v14.png` | Complete generated top-row state; real DOM text/icons are overlaid |
| System-selected button deck | `public/assets/diana-brand/button-decks/theme-system-selected-full-v14.png` | Complete generated top-row state; real DOM text/icons are overlaid |
| Separated character layer | `public/assets/diana-brand/diana-launcher-character-scene-v11.png` | Retained alternative; not active in the integrated v11 UI |
| Diana pixel-dango app icon | `src-tauri/icons/*` | Active |
| Target selector assembly | `public/assets/diana-brand/accessories/diana-target-selector-assembly-v3.png` | Active additive layer; transparent connecting arm and blank selector plaque, never a replacement for the integrated v11 artwork |

## Color system

### Night

- smoked plum: `#120f14`
- acrylic wine: `#2a1721`
- candy rose: `#dc7398`
- blush edge: `#f0b0c3`
- champagne detail: `#c9a477`
- warm text: `#f6eef1`

The launcher itself remains dark for all three target-theme choices. Day, night, and system affect the Codex theme to mount, not the launcher surface.

## Typography and spacing

- Display: local Chinese UI display stack for v0; replace with a bundled licensed display face only after the silhouette is approved.
- Body: Segoe UI Variable Text / Microsoft YaHei UI.
- Technical labels: Cascadia Mono.
- Spacing unit: 6 px, primarily 6 / 12 / 18 / 24.

## Motion

- Board settles into place on open: 420 ms, reaching full opacity at rest.
- The approved perimeter glow is baked into the high-fidelity artwork and is not recreated with a broad CSS filter.
- Selected theme and primary action use small, control-local opacity/transform sweeps; they do not animate large box shadows or alter the artwork.
- Button response: 150–180 ms.
- `prefers-reduced-motion` disables nonessential movement.

## Technical boundary

V1 uses a 540×810 transparent, decoration-free Tauri window. The active artwork is a full-size 1024×1536 RGBA image displayed at exactly 540×810. A contour-derived alpha mask removes only the pixels outside the irregular plaques and connector rings; the interior remains fully opaque. Theme switches, mount/restore actions, window controls, and live status copy are real DOM controls placed over the corresponding baked control regions. Native Windows hit-region shaping remains a later step, so visually transparent margins may still participate in window hit testing during this preview stage.

The multi-target extension is secondary construction rather than a repaint of the launcher master. Its arm and empty target plaque are a separate transparent production asset placed behind the original integrated artwork, so the original board occludes the upper anchor naturally and keeps every existing RGB pixel untouched. The application selector, heading, hint, focus state, and hit target remain live DOM content over the blank plaque. The assembly is always expanded in this revision; folding, hinge animation, and hidden states are intentionally deferred until their physical and interaction design is approved.

All three selected-theme states use complete no-text top-row layers derived from the approved crop. Their labels and icons are the same live DOM/SVG system, using a medium-weight narrow CJK sans treatment with restrained tracking and selected-state glow. The row is clipped as one continuous state surface, so no state depends on baked labels or local masking plates. The source labels `启动并挂载` / `恢复原版` remain underneath their existing live action controls and are otherwise untouched.

Runtime compatibility is capability-based rather than version-gated. The launcher records the installed Codex version for diagnostics, but cold-start discovery targets the official MSIX package identity and retries transient lookup failures. After Codex starts, the adapter verifies the signed package process, loopback-only debugger ownership, a visible application surface, and the minimum shell anchors before adding the scoped Diana host marker. A failed probe leaves the existing renderer unskinned instead of applying selectors from an assumed build.

## Native chat web demos — screenshot-guided refinement

The web demo is separate from the native launcher and installed skin adapters. Retain the approved day/night artwork and source CSS; correct only the simulated app shell and its content hierarchy.

- Doubao: use the recorded full-profile home layout, with a 280 px sidebar, centered greeting and conversation/work switch, recommendations above the bottom-anchored composer, and a horizontally scrollable native shortcut row. Put the lower-left doodle inside the sidebar's decoration layer, below text and controls, not behind the opaque sidebar.
- Cursor: preserve the recorded 260 px sidebar and 764 px conversation/composer column. The column follows the window center, with a safe sidebar clearance at narrow widths. The composer is a compact 42 px capsule; model and voice controls share its single row, while This PC remains underneath.
- DeepSeek Harness: preserve the 280 px workspace sidebar, 74 px session header with conversation/trajectory tabs, reasoning rows, local sample trajectory, permission/model controls, and full usage-field labels. Unavailable timing/token metrics use em dashes, not invented telemetry.
- References are existing local native captures: `formal-real-profile-dense-safe-final-16496.png`, `cursor-dark.png`, and `harness-top-rail-window-after.png`. Private screenshots, profile names, conversations, and local installation paths are not distributed.
- Real Harness mark: `demo/brand/harness-fish.svg`, copied unchanged from the locally checked out upstream web favicon. The upstream MIT notice is retained beside it. This is target identification, not an endorsement.
- Body/control typography follows the native Segoe UI/Microsoft YaHei stack at 12–16 px; app titles and home headings stay compact. Do not substitute a marketing-page heading scale or a new decorative palette.
- Existing gallery, Codex, ZCode, Grok, VS Code, Terminal, and launcher artwork are outside this refinement. No new illustration, social card, app installation, or native packaging is required.

## Application association — approved placement, 2026-09-07

- The user placed the new `关联` entry beside the hanging status plate, not in the lower app selector. It stays available when that selector is collapsed.
- Within the current 636×930 window and 540 px board, use a compact 48×30 px entry at board-local (449, 742). Preserve the original status information, plate, arm, artwork, main-button dimensions and motion.
- Reuse smoked-plum/wine surfaces, thin blush edges, subdued rose hover feedback and small upright Microsoft YaHei UI/Segoe UI text. No italic, large glow, new icon library or generated artwork.
- The modal is a restrained native-control-style panel: current location, browse/paste, save, re-detect and restore automatic detection. Keyboard focus returns to the entry after closing.
- Association is separate from mounting and consent. Browser demos show a clearly marked preview with no native path access; no fake association success.
