; OptiQra NSIS installer hooks.
;
; Why this exists: OptiQra.exe stays running in the system tray after the
; window is closed (see src-tauri/src/main.rs — closing the window only
; hides it; the sidecar keeps running so scheduled scans keep firing).
; The Node.js sidecar binary it spawns, optiqra-server-*.exe, is an
; unsigned pkg-compiled executable that Windows keeps an open file handle
; on for as long as the process is alive.
;
; If a user installs an update (or reinstalls) while a previous session is
; still sitting in the tray, the installer tries to overwrite that locked
; .exe and Windows refuses the write. NSIS surfaces this as an
; Abort/Retry/Ignore dialog; clicking Ignore leaves the OLD sidecar binary
; on disk sitting next to the NEW frontend/static assets that *did* get
; written successfully. That version mismatch is what produces a styleless
; UI and "Failed to load chunk ... from module ..." errors after install —
; the old server is serving content that doesn't match what the new HTML
; shell expects.
;
; Fix: forcibly close any running OptiQra process (main window + sidecar)
; before the installer copies a single file, and again before uninstall,
; so there's never a locked handle in the way.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing any running OptiQra instance..."
  ; /T also kills child processes (the sidecar is a child of OptiQra.exe),
  ; but the sidecar is targeted explicitly too in case it's ever spawned
  ; detached. Wildcard matches the target-triple-suffixed binary name
  ; (e.g. optiqra-server-x86_64-pc-windows-msvc.exe). Both calls are
  ; allowed to fail silently (nothing running is the common case, not an
  ; error).
  nsExec::ExecToLog 'taskkill /F /T /IM "OptiQra.exe"'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /IM "optiqra-server*.exe"'
  Pop $0
  ; Give Windows a moment to actually release the file handles after the
  ; process exits — taskkill returns as soon as termination is requested,
  ; not once the OS has finished tearing the process down.
  Sleep 500
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Closing any running OptiQra instance..."
  nsExec::ExecToLog 'taskkill /F /T /IM "OptiQra.exe"'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /IM "optiqra-server*.exe"'
  Pop $0
  Sleep 500
!macroend
