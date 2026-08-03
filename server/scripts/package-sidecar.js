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

// --- inspector patch -------------------------------------------------------
//
// next@16.2.10's dist/server/lib/app-info-log.js has an unconditional,
// unguarded top-level `require("inspector")` (used to print the "Debugger
// port:" line in the startup banner). It runs on every standalone server
// boot, dev or prod.
//
// pkg/@yao-pkg-pkg's prebuilt Node binaries are compiled with the inspector
// API stripped out to save size, so that require throws
// `Error [ERR_INSPECTOR_NOT_AVAILABLE]` and kills the process within ~1s of
// boot — before it ever binds the port. That's exactly the crash in the log
// you shared: the sidecar dies immediately, Tauri's 30s wait times out, and
// the webview shows "localhost refused to connect" because nothing is
// listening.
//
// Fix: rewrite that one require into a try/catch that falls back to the
// same shape next itself expects when no debugger is attached
// (`{ url: () => undefined }`). Applied to the *copied* standalone folder
// (standaloneDest below), so it's re-applied on every package run and never
// touches the source .next/standalone next build produces.
function patchInspectorRequire(standaloneRoot) {
	const target = path.join(
		standaloneRoot,
		"node_modules",
		"next",
		"dist",
		"server",
		"lib",
		"app-info-log.js",
	);
	if (!fs.existsSync(target)) {
		console.warn(`inspector patch: ${target} not found, skipping (next version changed layout?)`);
		return;
	}
	const src = fs.readFileSync(target, "utf8");
	const patched = src.replace(
		/require\("inspector"\)/,
		'(function(){try{return require("inspector")}catch(e){return {url:function(){return undefined}}}})()',
	);
	if (patched === src) {
		console.warn(
			`inspector patch: pattern not found in ${target} (next version bumped? check app-info-log.js manually)`,
		);
		return;
	}
	fs.writeFileSync(target, patched);
	console.log("Patched app-info-log.js: guarded require(\"inspector\") for pkg compatibility.");
}

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

// Pinned to an EXACT version, not a floating major tag like "node20" or
// "node22". Floating tags resolve to whatever patch pkg's internal table
// currently considers latest for that major — which is sometimes a patch
// pkg-fetch hasn't actually published a prebuilt binary for yet. When that
// happens pkg silently falls back to compiling the entire Node.js runtime
// from source (V8, ICU, libuv, ...), a 30-60+ minute build that isn't
// viable in CI and isn't what we want anyway. 22.23.2 is confirmed to
// fetch real prebuilt binaries (verified for all four targets below —
// linux-x64, macos-x64, macos-arm64, win-x64) as of writing.
// Before bumping this, actually run `npx pkg-fetch -n node<version> -p
// <platform> -a <arch> -o /tmp/test` for each target — a version can
// appear in pkg-fetch's SHA manifest without an uploaded binary existing
// yet (that's exactly what broke the floating "node20" tag here, which
// resolved to 20.20.2 — present in the manifest, missing on macOS arm64).
const PKG_TARGETS = {
	"darwin-arm64": "node22.23.2-macos-arm64",
	"darwin-x64": "node22.23.2-macos-x64",
	"win32-x64": "node22.23.2-win-x64",
	"linux-x64": "node22.23.2-linux-x64",
};

// Reverse lookup (Rust target triple -> pkg target) for the explicit-override path.
const PKG_TARGET_BY_TRIPLE = Object.fromEntries(
	Object.keys(TARGET_TRIPLES).map((key) => [TARGET_TRIPLES[key], PKG_TARGETS[key]]),
);

function main() {
	if (!fs.existsSync(ENTRY)) {
		console.error(`Missing ${ENTRY} — run "npm run desktop:compile" first.`);
		process.exit(1);
	}

	// Normally the sidecar's target triple matches the host running this
	// script. That breaks down when the *Rust* build is cross-compiling on
	// the same host — e.g. CI builds x86_64-apple-darwin on an Apple
	// Silicon (arm64) runner via `cargo build --target x86_64-apple-darwin`.
	// process.platform/arch would report arm64 there and produce a sidecar
	// binary with the wrong name, which Tauri's bundler then can't find.
	// TAURI_SIDECAR_TARGET_TRIPLE (set explicitly in CI, see release.yml)
	// overrides the host-inferred triple for exactly that case.
	const explicitTriple = process.env.TAURI_SIDECAR_TARGET_TRIPLE;
	const key = `${process.platform}-${process.arch}`;
	const triple = explicitTriple || TARGET_TRIPLES[key];
	const pkgTarget = explicitTriple ? PKG_TARGET_BY_TRIPLE[explicitTriple] : PKG_TARGETS[key];
	if (!triple || !pkgTarget) {
		console.error(`Unsupported platform/arch for packaging: ${explicitTriple || key}`);
		process.exit(1);
	}

	fs.mkdirSync(OUT_DIR, { recursive: true });
	const ext = process.platform === "win32" ? ".exe" : "";
	const outFile = path.join(OUT_DIR, `optiqra-server-${triple}${ext}`);

	console.log(`Packaging sidecar for ${pkgTarget} -> ${outFile}`);
	const pkgArgs = [
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
		//
		// --no-bytecode requires every bundled package to be marked
		// "public" (by license) or pkg has nothing valid to embed for
		// the rest and refuses to build ("--no-bytecode and no source
		// breaks final executable"). --public-packages "*" --public
		// is pkg's documented way to opt everything in without editing
		// every dependency's package.json.
		"--no-bytecode",
		"--public-packages",
		"*",
		"--public",
	];
	// On Windows, npx resolves to npx.cmd, and execFileSync can't invoke
	// .cmd files without shell:true (Node won't run batch files directly —
	// "spawnSync npx ENOENT"). shell:true needs a single command string
	// rather than an argv array, so quote each arg defensively (only "*"
	// here needs it, but quote everything to be safe against future args
	// with spaces).
	const quote = (arg) => (process.platform === "win32" ? `"${arg}"` : arg);
	execFileSync("npx", pkgArgs.map(quote), {
		stdio: "inherit",
		cwd: ROOT,
		shell: process.platform === "win32",
	});

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
		patchInspectorRequire(standaloneDest);
	} else {
		console.warn("No .next/standalone found — did next build run with DOCKER_BUILD=1 first?");
	}

	console.log("Sidecar packaged.");
}

main();
