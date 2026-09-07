Diana Grok Bot reviewed adapter — Grok Bot 0.28.0 only

This is a version-limited, experimental, user-space adapter. It verifies file
version 0.28.0, product version 0.28.0.0, product name Grok Bot, a valid signature
(A7B4A9C2C6D639E310E7579AEE16B7390B0F6269), bundle hashes, process identity,
loopback listener ownership and the native theme bridge. Other versions fail closed.

Requirements: Windows, Windows PowerShell, Node.js 22+ (built-in WebSocket).
The launcher supplies the detected official executable path. No machine-specific
installation paths, credentials, state, screenshots or logs are distributed.

Manual use from an extracted runtime package:
  node adapter.mjs self-test
  node adapter.mjs start dark --exe "<absolute path to Grok Bot.exe>" --accept-cdp-risk
  node adapter.mjs apply light --exe "<absolute path to Grok Bot.exe>"
  node adapter.mjs restore --exe "<absolute path to Grok Bot.exe>"

Before start: save your work, fully exit Grok Bot yourself and read SECURITY.md.
CDP has no authentication. Other local processes may read conversations, run
renderer JavaScript or take screenshots. Loopback is not an authentication layer.
No running application is terminated. No binary, app.asar, login data or installed
resources are modified. Only native appearance preferences and injected artwork
are changed. The adapter reads theme capabilities and layout metrics, not content.

Use restore WHILE the managed window is still running: this removes artwork and
restores the native appearance preferences captured for that mounting cycle.
Then fully exit ALL Grok Bot processes and reopen from the ordinary shortcut.
Removing artwork alone does NOT close the debugging port. If the app was already
closed, artwork is gone, but choose the desired native appearance in app settings;
normal launch does not secretly open a new debug port to restore preferences.

No watcher, service, scheduled task or login startup entry is created. Each later
themed launch needs another explicit click/consent. Static self-test checks files,
not a real renderer. Final real-app acceptance is required before public release.
