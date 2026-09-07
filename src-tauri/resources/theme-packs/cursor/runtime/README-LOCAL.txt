Diana Cursor reviewed adapter — Cursor 3.17.21 only

This is a version-limited, experimental, user-space adapter. It verifies the
official signature (5767825FF4C40538FD78C5F2CE270E633C474DFC), executable version,
bundle files, process identity, loopback listener owner and renderer structure.
Other Cursor versions/signers are refused, not automatically patched.

Runtime revision v3 resolves system appearance from the native renderer's actual
light/dark theme, follows native theme changes, and checks colour agreement before
reporting mounted. The artwork and palette assets are unchanged.

Requirements: Windows, Windows PowerShell, Node.js 22+ (built-in WebSocket).
The launcher supplies the detected official executable path. No machine-specific
installation paths, credentials, state, screenshots or logs are distributed.

Manual use from an extracted runtime package:
  node adapter.mjs self-test
  node adapter.mjs start dark --exe "<absolute path to Cursor.exe>" --accept-cdp-risk
  node adapter.mjs apply light --exe "<absolute path to Cursor.exe>"
  node adapter.mjs restore --exe "<absolute path to Cursor.exe>"

Before start: save your work, fully exit Cursor yourself, read SECURITY.md and
explicitly accept the risk. No running application is terminated by this adapter.
CDP has no authentication. Other local processes may read conversations, run
renderer JavaScript or take screenshots. Loopback is not an authentication layer.
The adapter itself reads only theme capabilities and layout metrics, not content.

No app binaries, installation resources or signatures are modified. Only the
user/portable-user color-theme extension and appearance settings are managed.
The recovery record is created on first use. Existing user settings/comments and
subsequent user edits are preserved. Different existing extension files are refused.

Restore while running removes the artwork. Then fully exit ALL Cursor processes,
run restore again to restore managed disk settings, and open Cursor normally.
Removing artwork alone does NOT close the debugging port. No watcher, service,
scheduled task or login startup entry is created. Each later themed launch needs
another explicit click/consent; a normal restart does not retain injected artwork.

Static self-test validates bundle completeness only, not real renderer mounting.
The public delivery revision still requires final real-app acceptance before release.
