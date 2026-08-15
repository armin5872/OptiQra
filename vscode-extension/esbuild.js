const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
	const extCtx = await esbuild.context({
		entryPoints: ["src/extension.ts"],
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		platform: "node",
		outfile: "dist/extension.js",
		external: ["vscode"],
		logLevel: "warning",
	});

	const webCtx = await esbuild.context({
		entryPoints: ["media/crawltree/main.ts"],
		bundle: true,
		format: "iife",
		minify: production,
		sourcemap: !production,
		platform: "browser",
		outfile: "media/crawltree/bundle.js",
		logLevel: "warning",
	});

	if (watch) {
		await Promise.all([extCtx.watch(), webCtx.watch()]);
	} else {
		await extCtx.rebuild();
		await webCtx.rebuild();
		await extCtx.dispose();
		await webCtx.dispose();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
