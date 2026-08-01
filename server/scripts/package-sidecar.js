#!/usr/bin/env node
/**
 * Runs after `tsc -p server/tsconfig.json` (compiles server/*.ts to
 * dist-server/) and `next build` (produces .next/standalone). Bundles
 * dist-server/server/index.js — which requires .next/standalone/server.js
 * and starts the scheduler daemon, see server/index.ts — into a single
 * executable with @yao-pkg/pkg, then renames it to match the target
 * triple Tauri expects for the sidecar declared in
 * src-tauri/tauri.conf.json's `bundle.externalBin`.
 *
 * Run once per platform in CI (this can't cross-compile a working native
 * sidecar for every OS from one machine — run on macOS/Windows/Linux
 * runners the same way tauri-action already does for the Rust build).
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const ENTRY = path.join(ROOT, "dist-server", "server", "index.js");
const OUT_DIR = path.join(ROOT, "src-tauri", "binaries");

// Maps Node's process.platform/arch to the Rust target triple suffix
// Tauri's sidecar naming convention expects.
const TARGET_TRIPLES = {
	"darwin-arm64": "aarch64-apple-darwin",
	"darwin-x64": "x86_64-apple-darwin",
	"win32-x64": "x86_64-pc-windows-msvc",
	"linux-x64": "x86_64-unknown-linux-gnu",
};

const PKG_TARGETS = {
	"darwin-arm64": "node20-macos-arm64",
	"darwin-x64": "node20-macos-x64",
	"win32-x64": "node20-win-x64",
	"linux-x64": "node20-linux-x64",
};

function main() {
	if (!fs.existsSync(ENTRY)) {
		console.error(`Missing ${ENTRY} — run "npm run desktop:compile" first.`);
		process.exit(1);
	}

	const key = `${process.platform}-${process.arch}`;
	const triple = TARGET_TRIPLES[key];
	const pkgTarget = PKG_TARGETS[key];
	if (!triple || !pkgTarget) {
		console.error(`Unsupported platform/arch for packaging: ${key}`);
		process.exit(1);
	}

	fs.mkdirSync(OUT_DIR, { recursive: true });
	const ext = process.platform === "win32" ? ".exe" : "";
	const outFile = path.join(OUT_DIR, `optiqra-server-${triple}${ext}`);

	console.log(`Packaging sidecar for ${pkgTarget} -> ${outFile}`);
	execFileSync(
		"npx",
		[
			"@yao-pkg/pkg",
			ENTRY,
			"--target",
			pkgTarget,
			"--output",
			outFile,
			// Bundles .next/standalone alongside the executable rather than
			// trying to snapshot it into the pkg binary itself — Next's
			// standalone output includes its own node_modules subset and
			// dynamic requires that pkg's static analysis won't catch.
			"--no-bytecode",
		],
		{ stdio: "inherit", cwd: ROOT },
	);

	// pkg only bundles what static analysis finds from ENTRY. Next's
	// standalone server does its own dynamic requires (route handlers,
	// etc.), so ship .next/standalone next to the executable rather than
	// relying on pkg to have inlined it — main.rs spawns the exe with its
	// own cwd, and index.ts's `require("../.next/standalone/server.js")`
	// resolves relative to that.
	const standaloneSrc = path.join(ROOT, ".next", "standalone");
	const standaloneDest = path.join(OUT_DIR, ".next", "standalone");
	if (fs.existsSync(standaloneSrc)) {
		fs.rmSync(standaloneDest, { recursive: true, force: true });
		fs.cpSync(standaloneSrc, standaloneDest, { recursive: true });
		const staticSrc = path.join(ROOT, ".next", "static");
		const staticDest = path.join(standaloneDest, ".next", "static");
		fs.cpSync(staticSrc, staticDest, { recursive: true });
	} else {
		console.warn("No .next/standalone found — did next build run with DOCKER_BUILD=1 first?");
	}

	console.log("Sidecar packaged.");
}

main();
