// Walks the open workspace and builds the ProjectFile[] shape the ported
// engine (projectAudit / projectFixEngine / jsxAutoFix / stackDetector)
// already expects — the same shape a zip upload produces in the web app,
// just read from disk instead.
import * as vscode from "vscode";
import type { ProjectFile } from "../../../src/lib/projectFixEngine";
import { getSettings } from "../settings";

export async function scanWorkspaceFiles(): Promise<ProjectFile[]> {
	const settings = getSettings();
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) return [];

	const includePattern = `{${settings.scan.include.join(",")}}`;
	const excludePattern = `{${settings.scan.exclude.join(",")}}`;
	const maxBytes = settings.scan.maxFileSizeKb * 1024;

	const uris = await vscode.workspace.findFiles(includePattern, excludePattern, 4000);
	const files: ProjectFile[] = [];
	const root = folders[0].uri;

	for (const uri of uris) {
		try {
			const stat = await vscode.workspace.fs.stat(uri);
			if (stat.size > maxBytes) continue;
			const bytes = await vscode.workspace.fs.readFile(uri);
			const content = Buffer.from(bytes).toString("utf8");
			const rel = vscode.workspace.asRelativePath(uri, false);
			files.push({ path: rel, content });
		} catch {
			// unreadable/binary — skip
		}
	}

	void root;
	return files;
}

/** Also grabs config/meta files (package.json, robots.txt, sitemap.xml,
 *  security-relevant configs) that project-wide checks need but the normal
 *  include glob (markup/component extensions) wouldn't match. */
export async function scanProjectMetaFiles(): Promise<ProjectFile[]> {
	const patterns = [
		"**/package.json",
		"**/robots.txt",
		"**/sitemap.xml",
		"**/llms.txt",
		"**/next.config.{js,ts,mjs}",
		"**/nuxt.config.{js,ts,mjs}",
		"**/angular.json",
		"**/svelte.config.{js,ts,mjs}",
		"**/astro.config.{js,ts,mjs}",
		"**/vercel.json",
		"**/netlify.toml",
		"**/_headers",
	];
	const exclude = "{**/node_modules/**,**/dist/**,**/build/**,**/.next/**,**/out/**,**/.git/**}";
	const files: ProjectFile[] = [];
	for (const p of patterns) {
		const uris = await vscode.workspace.findFiles(p, exclude, 20);
		for (const uri of uris) {
			try {
				const bytes = await vscode.workspace.fs.readFile(uri);
				files.push({ path: vscode.workspace.asRelativePath(uri, false), content: Buffer.from(bytes).toString("utf8") });
			} catch {
				/* skip */
			}
		}
	}
	return files;
}
