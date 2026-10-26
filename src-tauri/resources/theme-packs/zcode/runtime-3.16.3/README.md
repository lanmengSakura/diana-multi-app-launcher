# ZCode 3.16.3.8992 opt-in adapter

Public launcher component, not the author's machine-local experiment. The launcher
extracts reviewed code and shared fan artwork into the user's support directory.
No private registration, absolute author path, login state or ZCode binary is included.

Only official Windows ZCode **3.16.3.8992** with the pinned publisher certificate
and app.asar SHA-256 is accepted. Installation files are read, never patched.
The original 3.6.5.4145 adapter remains separate. Unknown versions are refused.

Choose the installed ZCode.exe, fully exit ZCode, then explicitly accept the launcher
risk dialog. This starts a temporary, unauthenticated 127.0.0.1 high-port debugger.
Other same-user local processes can inspect visible content, run renderer code or
take screenshots. Loopback is NOT authentication. Cancel opens no endpoint.
There is no service, scheduled task, login item or background Node watcher.

The CLI requires DIANA_ZCODE_EXE; start additionally requires --approved. This is
an explicit invocation flag, not a security token. apply/disable/verify only access
the matching session's exact executable, PID, creation time, port and renderer.
Assets, styles and scripts stay local. Logs contain state/error codes, not content.

An unready login/workspace page reports waiting_workspace, NOT mounted. After
entering the workspace, click mount again; this adapter does not copy login state.
Day, night and automatic modes preserve the existing visual composition. Automatic
follows ZCode's native theme. Disable removes the style, art and renderer observers.

**Disable does not close the debugging port.** Fully exit every ZCode process from
this session, then reopen ZCode from its official entry point to end that exposure.
Do not overwrite or delete an active session record. Removing this launcher does
not terminate ZCode. No application/user configuration needs replacement to restore.

Code: MIT, see the launcher LICENSE. Diana/Jiaran and related artwork: non-commercial
fan work only, not covered by MIT; retain ASSET_LICENSES.md. Unofficial project,
not endorsed by ZCode or A-SOUL. Package/fixture checks are not cross-machine or
logged-in full-application acceptance.
