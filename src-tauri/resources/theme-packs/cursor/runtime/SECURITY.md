# Security policy

## Delivery paths

The VSIX still contains only official color-theme JSON and extension metadata. It cannot mount the full artwork by itself.

The new `runtime/` source is a separate, opt-in, version-limited delivery candidate for Cursor 3.17.21. It is derived from the local experiment but removes machine-specific paths, development screenshots/discovery commands and private state. It must pass final real-app acceptance before public release. Existing beta Release assets do not silently gain this runtime.

## Experimental runtime boundary

- Verify the complete bundle, exact application version, valid expected publisher certificate, executable path, session PID, loopback listener owner and renderer capability.
- Require Node.js 22+ and explicit consent before a themed launch opens a temporary debugging endpoint on 127.0.0.1 with a random high port. Unknown versions fail closed.
- CDP has no authentication. Other local processes may discover it and read conversations, execute renderer JavaScript or capture screenshots. Loopback is NOT an authentication boundary.
- Do not kill running apps, modify app binaries/resources/signatures, install watchers/services/scheduled tasks/login items, or copy login profiles.
- The short-lived adapter exits after the operation. Removing artwork or exiting the adapter does NOT close the application's endpoint: fully exit ALL themed application processes and reopen normally.
- Only appearance preferences, local theme files and minimal recovery state are managed. Status/log output excludes conversation contents, cookies, credentials, DOM text and screenshots.
- The launcher trusts compiled manifests, not a self-reported manifest hash supplied by a model. Do not bypass hash, version or signature errors.

`runtime/README-LOCAL.txt` documents the exact start/switch/restore sequence. Source checks and bundle self-tests are not proof of real mounting. Do not distribute private experimental directories, runtime state, logs, backups or target application binaries.

## Reporting

Report non-sensitive compatibility problems with application version and error code. Remove paths containing user names, conversation text and credentials. Use GitHub Security Advisories for security vulnerabilities.
