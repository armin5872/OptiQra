/**
 * This is the file that gets compiled + packaged (via @yao-pkg/pkg — see
 * ../server/README.md) into the single executable that
 * src-tauri/src/main.rs spawns as its sidecar. One process, two jobs:
 * serve the app (same Next.js standalone server used in the web
 * deployment) and run the schedule checker for as long as the process
 * lives, independent of whether any window is open.
 */

import { startSchedulerDaemon } from "./scheduler-daemon";

// pkg's compiled Node binaries strip the V8 inspector, so any
// require("inspector") / require("node:inspector") throws
// ERR_INSPECTOR_NOT_AVAILABLE instead of returning a module. Next.js has
// several internal files that call this unconditionally at module-load
// time with no try/catch (dist/server/lib/app-info-log.js in 16.2.10,
// plus dist/server/node-environment-extensions/console-dim.external.js
// added in 16.3.0 — and likely more added in future versions), each of
// which crashes the whole sidecar the instant it's required.
//
// Patching individual Next dist files (the old approach — see git
// history) breaks every time Next adds a new call site, which is exactly
// what happened going from 16.2.10 to 16.3.0. Instead, stub out the
// 'inspector' / 'node:inspector' built-ins at the Module._load level,
// process-wide, before the standalone server (or anything it requires)
// loads. Every call site anywhere in Next — present or future — gets a
// harmless no-op instead of a throw. Verified against a real pkg-compiled
// Next 16.3.0 standalone build with zero per-file patching.
const Module = require("module");
const inspectorStub = {
	url: () => undefined,
	open: () => {},
	close: () => {},
	console: {},
	Session: class Session {
		connect() {}
		disconnect() {}
		post(_method: string, cb?: (err: Error) => void) {
			if (typeof cb === "function") cb(new Error("Inspector is not available"));
		}
	},
};
const originalModuleLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
	if (request === "inspector" || request === "node:inspector") {
		return inspectorStub;
	}
	return originalModuleLoad.call(this, request, ...rest);
};

const PORT = Number(process.env.PORT ?? 4173);
process.env.PORT = String(PORT);

// Next's standalone build (`.next/standalone/server.js`, produced by the
// `DOCKER_BUILD=1 next build` step in ../server/README.md) starts
// listening as a side effect of being required — it's written that way
// specifically so it can be required from a wrapper like this one instead
// of only being runnable via `node server.js` directly.
//
// The installed app can't rely on a path relative to wherever this file
// happens to sit — Tauri bundles resources into a platform-specific
// location that main.rs resolves at runtime via app.path().resource_dir()
// and passes down as OPTIQRA_STANDALONE_DIR. Fall back to the old
// relative path only for local dev/testing (e.g. running
// dist-server/server/index.js directly without going through Tauri).
const standaloneDir = process.env.OPTIQRA_STANDALONE_DIR;
const standaloneEntry = standaloneDir
	? require("path").join(standaloneDir, "server.js")
	: "../.next/standalone/server.js";
require(standaloneEntry);

function waitForServer(port: number, timeoutMs = 15000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const tryOnce = () => {
			fetch(`http://127.0.0.1:${port}/api/health`)
				.then(() => resolve())
				.catch(() => {
					if (Date.now() > deadline) {
						reject(new Error(`Server on port ${port} never came up`));
						return;
					}
					setTimeout(tryOnce, 250);
				});
		};
		tryOnce();
	});
}

waitForServer(PORT)
	.then(() => {
		console.log(`[optiqra-server] listening on :${PORT}, starting scheduler daemon`);
		startSchedulerDaemon(PORT);
	})
	.catch((err) => {
		// Don't crash the whole sidecar over this — the app is still usable
		// for on-demand scans even if scheduling didn't start; log loudly
		// so it shows up in the Tauri console during `tauri dev`.
		console.error("[optiqra-server] scheduler daemon did not start:", err);
	});
