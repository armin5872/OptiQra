/**
 * This is the file that gets compiled + packaged (via @yao-pkg/pkg — see
 * ../server/README.md) into the single executable that
 * src-tauri/src/main.rs spawns as its sidecar. One process, two jobs:
 * serve the app (same Next.js standalone server used in the web
 * deployment) and run the schedule checker for as long as the process
 * lives, independent of whether any window is open.
 */

import { startSchedulerDaemon } from "./scheduler-daemon";

const PORT = Number(process.env.PORT ?? 4173);
process.env.PORT = String(PORT);

// Next's standalone build (`.next/standalone/server.js`, produced by the
// `DOCKER_BUILD=1 next build` step in ../server/README.md) starts
// listening as a side effect of being required — it's written that way
// specifically so it can be required from a wrapper like this one instead
// of only being runnable via `node server.js` directly.
require("../.next/standalone/server.js");

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
