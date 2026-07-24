import { NextRequest } from "next/server";
import { load } from "cheerio";
import JSZip from "jszip";
import { runAutoFix, applyAITargetValues, duplicateBankKey, type AutoFixResult, type AITarget } from "@/lib/autoFixEngine";
import { runProjectFix, detectProjectStack, type ProjectFile } from "@/lib/projectFixEngine";
import { runJsxAutoFix, applyJsxAITargetValues, isFixableSourceFile } from "@/lib/jsxAutoFix";
import { buildAutoFixBatchPrompt, parseAutoFixResponse } from "@/lib/autoFixPrompt";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { completeFix } from "@/lib/aiProviders";
import { getErrorMessage } from "@/lib/errorUtils";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TOTAL_UNCOMPRESSED_BYTES = 60 * 1024 * 1024; // 60MB
const MAX_FILE_COUNT = 3000;
const MAX_HTML_FILES_TO_FIX = 250; // guardrail against runaway AI cost on huge sites
const MAX_SOURCE_FILES_TO_FIX = 250; // same guardrail, for non-full-document source files (.tsx/.jsx/.vue/.svelte/Angular/JS/HTML fragments)

type ProjectMode = "audit" | "fix";

interface PerFileSummary {
	path: string;
	results: AutoFixResult[];
}

function ndjson(obj: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

/** Turns unresolved AI targets straight into "ai-needed" report entries,
 *  with no AI call and no duplicate-bank lookup — this is what audit mode
 *  uses instead of resolveAITargetValues, since a pure audit shouldn't
 *  spend AI tokens or mutate the duplicate bank just to describe what's
 *  wrong with the page. */
function aiTargetsToAuditResults(targets: AITarget[]): AutoFixResult[] {
	return targets.map((t) => ({
		id: t.id,
		title: t.title,
		category: t.category,
		severity: t.severity,
		status: "ai-needed",
		note: `Needs authored content (${t.kind.replace(/-/g, " ")}) — switch to Auto-fix (with an AI key configured, or a matching value elsewhere in the project) to resolve this.`,
	}));
}

/** Shared between the HTML and JSX passes: resolves a batch of AITargets via
 *  a single AI call (falling back to the duplicate bank for anything the
 *  model didn't return), or straight to the duplicate bank when no key is
 *  configured. Doesn't touch the file itself — each caller applies `values`
 *  in whatever way fits its own content (Cheerio vs. raw source text). */
async function resolveAITargetValues(
	targets: AITarget[],
	pageUrl: string,
	stackSummary: string,
	hasAI: boolean,
	provider: string,
	apiKey: string,
	model: string,
	duplicateBank: Record<string, string>,
): Promise<{ values: Record<string, string>; usedAI: boolean; aiError?: string }> {
	if (targets.length === 0) return { values: {}, usedAI: false };

	if (!hasAI) {
		const values: Record<string, string> = {};
		for (const t of targets) {
			const bankValue = duplicateBank[duplicateBankKey(t.kind, t.category)];
			if (bankValue) values[t.id] = bankValue;
		}
		return { values, usedAI: false };
	}

	const resolvedModel = model || AI_PROVIDERS[provider as AIProviderId].defaultModel;
	const { system, user } = buildAutoFixBatchPrompt(targets, pageUrl, {
		primary: stackSummary,
		summary: stackSummary,
		guidance: "This is a static project file, not a live crawl — keep suggested content generic to the page's own markup.",
	});
	try {
		const raw = await completeFix(provider as AIProviderId, { apiKey, model: resolvedModel, system, user });
		const { values } = parseAutoFixResponse(raw);
		return { values, usedAI: true };
	} catch (err) {
		return { values: {}, usedAI: false, aiError: getErrorMessage(err, "unknown error") };
	}
}

/** Anything the AI call didn't resolve gets a second chance against the
 *  duplicate bank; `firstPassResults` already has one result per target
 *  (mostly "skipped" for the unresolved ones), so we replace those entries
 *  in place rather than appending a second, redundant result for the same id. */
function fillFromDuplicateBank<T extends AITarget>(
	firstPassResults: AutoFixResult[],
	targets: T[],
	values: Record<string, string>,
	duplicateBank: Record<string, string>,
	applyFallback: (missing: T[], fallbackValues: Record<string, string>) => AutoFixResult[],
): AutoFixResult[] {
	const missing = targets.filter((t) => !values[t.id]);
	if (missing.length === 0) return firstPassResults;
	const fallbackValues: Record<string, string> = {};
	for (const t of missing) {
		const bankValue = duplicateBank[duplicateBankKey(t.kind, t.category)];
		if (bankValue) fallbackValues[t.id] = bankValue;
	}
	const fallbackResults = applyFallback(missing, fallbackValues);
	const byId = new Map(fallbackResults.map((r) => [r.id, r]));
	return firstPassResults.map((r) => byId.get(r.id) ?? r);
}

/** Derives static route paths from an App Router project's page.tsx files
 *  (for sitemap.xml generation, since a source project has no rendered HTML
 *  files to enumerate) — e.g. `src/app/blog/page.tsx` -> "blog". Dynamic
 *  segments ([slug], [...slug]) can't be enumerated without running the app,
 *  so routes containing them are skipped rather than guessed at. */
function deriveNextAppRoutes(files: ProjectFile[]): string[] {
	const routes: string[] = [];
	for (const f of files) {
		const m = f.path.match(/(?:^|\/)app\/(.*)page\.(tsx|jsx)$/);
		if (!m) continue;
		if (m[1].includes("[")) continue;
		const seg = m[1]
			.split("/")
			.filter((s) => s && !/^\(.*\)$/.test(s)) // drop route groups — invisible in the URL
			.join("/");
		routes.push(seg);
	}
	return routes;
}

/** Normalizes a zip-entry / uploaded-file path and strips any "." / ".."
 *  segments. Nothing here ever touches the real filesystem (both the fix and
 *  audit pipelines keep everything in memory and re-zip in-process), so this
 *  isn't a classic zip-slip write primitive — but a crafted "../../x" entry
 *  could otherwise collide with or shadow a legitimate path in the output
 *  zip, so segments are dropped rather than just having a leading slash
 *  trimmed. */
function normalizePath(p: string): string {
	const cleaned = p.replace(/\\/g, "/").replace(/^\/+/, "");
	return cleaned
		.split("/")
		.filter((seg) => seg !== "" && seg !== "." && seg !== "..")
		.join("/");
}

function joinUrl(base: string, relPath: string): string {
	try {
		const cleanBase = base.replace(/\/$/, "");
		const cleanRel = relPath.replace(/(^|\/)index\.html?$/i, "");
		return `${cleanBase}/${cleanRel}`.replace(/([^:])\/{2,}/g, "$1/");
	} catch {
		return relPath;
	}
}

export async function POST(req: NextRequest) {
	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return new Response(JSON.stringify({ error: "Expected multipart/form-data with an uploaded project." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const uploaded = form.get("project");
	if (!uploaded || typeof uploaded === "string") {
		return new Response(JSON.stringify({ error: "No project file/folder uploaded." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}
	const uploadedFile = uploaded as File;

	const mode: ProjectMode = form.get("mode") === "audit" ? "audit" : "fix";
	const siteUrl = (form.get("siteUrl") as string) || "";
	const provider = (form.get("provider") as string) || "";
	const apiKey = (form.get("apiKey") as string) || "";
	const model = (form.get("model") as string) || "";
	const hasAI = mode === "fix" && !!provider && !!apiKey && !!AI_PROVIDERS[provider as AIProviderId];
	const MAX_DUPLICATE_BANK_CHARS = 2 * 1024 * 1024; // 2MB of JSON — generous for a bank of short text snippets
	const duplicateBankRaw = (form.get("duplicateBank") as string) || "{}";
	let duplicateBank: Record<string, string> = {};
	try {
		duplicateBank = duplicateBankRaw.length > MAX_DUPLICATE_BANK_CHARS ? {} : JSON.parse(duplicateBankRaw);
	} catch {
		duplicateBank = {};
	}

	// --- Read every uploaded file into memory. The client sends either a
	// single .zip, or many individual files (folder drag/drop or a
	// <input webkitdirectory> pick) each carrying its relative path in
	// File.name (renamed client-side since real relativePath doesn't survive
	// FormData) — so we branch on how many "project" entries came through. ---
	const allEntries = form.getAll("project") as File[];

	let files: ProjectFile[] = [];
	try {
		if (allEntries.length === 1 && /\.zip$/i.test(uploadedFile.name)) {
			const buf = Buffer.from(await uploadedFile.arrayBuffer());
			const zip = await JSZip.loadAsync(buf);
			const entries = Object.values(zip.files).filter((f) => !f.dir);
			if (entries.length > MAX_FILE_COUNT) {
				return new Response(
					JSON.stringify({ error: `Project has too many files (${entries.length}, max ${MAX_FILE_COUNT}).` }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}
			let totalBytes = 0;
			for (const entry of entries) {
				// JSZip parses each entry's declared uncompressed size out of the
				// zip's central directory as part of loadAsync — this is metadata,
				// not decompressed bytes, so checking it here rejects an oversized
				// (or bomb-style highly-compressed) entry BEFORE entry.async()
				// inflates it into memory. It's an internal/undocumented field, so
				// this falls back to the post-decompression check below if it's
				// ever missing rather than skipping the cap entirely.
				const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
				if (typeof declaredSize === "number") {
					totalBytes += declaredSize;
					if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
						return new Response(JSON.stringify({ error: "Project is too large to process in the browser (60MB limit)." }), {
							status: 400,
							headers: { "Content-Type": "application/json" },
						});
					}
				}

				const content = await entry.async("string");

				if (typeof declaredSize !== "number") {
					totalBytes += content.length;
					if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
						return new Response(JSON.stringify({ error: "Project is too large to process in the browser (60MB limit)." }), {
							status: 400,
							headers: { "Content-Type": "application/json" },
						});
					}
				}

				const path = normalizePath(entry.name);
				if (!path) continue; // entry normalized away to nothing (e.g. was pure "../..")
				files.push({ path, content });
			}
		} else {
			if (allEntries.length > MAX_FILE_COUNT) {
				return new Response(
					JSON.stringify({ error: `Project has too many files (${allEntries.length}, max ${MAX_FILE_COUNT}).` }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}
			let totalBytes = 0;
			for (const f of allEntries) {
				// File.size is known up front without reading the file, so check it
				// before calling .text() rather than only measuring after the fact.
				totalBytes += f.size;
				if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
					return new Response(JSON.stringify({ error: "Project is too large to process in the browser (60MB limit)." }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}
				const content = await f.text();
				const path = normalizePath(f.name);
				if (!path) continue;
				files.push({ path, content });
			}
		}
	} catch (err) {
		return new Response(JSON.stringify({ error: getErrorMessage(err, "Couldn't read the uploaded project") }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Skip build output / dependency directories — fixing generated files is
	// pointless (they're overwritten on next build) and node_modules can be huge.
	files = files.filter((f) => !/(^|\/)(node_modules|\.next|\.nuxt|\.svelte-kit|\.angular|\.git|dist|build|out)\//.test(f.path));

	// A .html file only gets the full Cheerio engine (which assumes a real
	// <head>/<title>/<meta> to work with) if it actually IS a complete
	// document. Anything without <html>/<head>/a doctype — an Angular
	// component's templateUrl file, an SSI/Nunjucks include, any other
	// markup partial — goes through the fragment-safe source engine instead,
	// so it doesn't get a spurious <head> full of SEO tags stapled onto it.
	const isFullHtmlDocument = (content: string) => /<html[\s>]/i.test(content) || /<!doctype\s+html/i.test(content) || /<head[\s>]/i.test(content);
	const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path) && isFullHtmlDocument(f.content));
	const fragmentHtmlFiles = files.filter((f) => /\.html?$/i.test(f.path) && !isFullHtmlDocument(f.content));
	const sourceFiles = [...fragmentHtmlFiles, ...files.filter((f) => isFixableSourceFile(f.path, f.content))];
	if (htmlFiles.length === 0 && sourceFiles.length === 0) {
		return new Response(
			JSON.stringify({
				error:
					"Couldn't find any fixable files in the uploaded project — looked for .html documents, React/Next .tsx/.jsx, Vue .vue, Svelte .svelte, Angular component/template files, and markup-bearing .js files.",
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const stack = detectProjectStack(files);
	const htmlFilesToFix = htmlFiles.slice(0, MAX_HTML_FILES_TO_FIX);
	const sourceFilesToFix = sourceFiles.slice(0, MAX_SOURCE_FILES_TO_FIX);
	const totalSteps = htmlFilesToFix.length + sourceFilesToFix.length + 1; // +1 for the project-wide pass

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false;
			const enqueue = (obj: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(ndjson(obj));
				} catch {
					// stream already closed (client disconnected) — safe to ignore
				}
			};
			const close = () => {
				if (closed) return;
				closed = true;
				try {
					controller.close();
				} catch {
					// already closed
				}
			};

			try {
				enqueue({
					type: "status",
					message: mode === "audit" ? `Auditing ${stack.summary} project…` : `Auto-fixing ${stack.summary} project…`,
				});

				const perFileSummaries: PerFileSummary[] = [];
				const newDuplicateBankEntries: Record<string, string> = {};
				let step = 0;

				for (const file of htmlFilesToFix) {
					const $ = load(file.content);
					const pageUrl = siteUrl ? joinUrl(siteUrl, file.path) : file.path;
					const { results, aiTargets } = runAutoFix($, pageUrl);
					let aiResults: AutoFixResult[] = [];

					if (aiTargets.length > 0) {
						if (mode === "audit") {
							aiResults = aiTargetsToAuditResults(aiTargets);
						} else {
							const { values, usedAI, aiError } = await resolveAITargetValues(
								aiTargets,
								pageUrl,
								stack.summary,
								hasAI,
								provider,
								apiKey,
								model,
								duplicateBank,
							);
							aiResults = applyAITargetValues($, aiTargets, values, usedAI ? "ai" : "duplicate");
							if (usedAI) {
								aiResults = fillFromDuplicateBank(aiResults, aiTargets, values, duplicateBank, (missing, fallbackValues) =>
									applyAITargetValues($, missing, fallbackValues, "duplicate"),
								);
								for (const t of aiTargets) {
									if (values[t.id]) newDuplicateBankEntries[duplicateBankKey(t.kind, t.category)] = values[t.id];
								}
							}
							if (aiError) {
								aiResults.forEach((r) => {
									if (r.status === "skipped") r.note = `AI call failed (${aiError}) — ${r.note}`;
								});
							}
						}
					}

					if (mode === "fix") file.content = $.html();
					perFileSummaries.push({ path: file.path, results: [...results, ...aiResults] });
					step += 1;
					enqueue({ type: "progress", processed: step, total: totalSteps, currentFile: file.path });
				}

				// --- Same pass, but for non-full-document source files: JSX/TSX
				// (Next.js pages/layouts, Vite/CRA components), Vue SFCs, Svelte
				// components, Angular components/templates, markup-bearing plain JS,
				// and HTML fragments that aren't complete documents. ---
				for (const file of sourceFilesToFix) {
					const pageUrl = siteUrl ? joinUrl(siteUrl, file.path) : file.path;
					const { content, results, aiTargets } = runJsxAutoFix(file, files, pageUrl);
					let updatedContent = content;
					let aiResults: AutoFixResult[] = [];

					if (aiTargets.length > 0) {
						if (mode === "audit") {
							aiResults = aiTargetsToAuditResults(aiTargets);
						} else {
							const { values, usedAI, aiError } = await resolveAITargetValues(
								aiTargets,
								pageUrl,
								stack.summary,
								hasAI,
								provider,
								apiKey,
								model,
								duplicateBank,
							);
							const applied = applyJsxAITargetValues(updatedContent, aiTargets, values, usedAI ? "ai" : "duplicate");
							updatedContent = applied.content;
							aiResults = applied.results;
							if (usedAI) {
								aiResults = fillFromDuplicateBank(aiResults, aiTargets, values, duplicateBank, (missing, fallbackValues) => {
									const fallbackApplied = applyJsxAITargetValues(updatedContent, missing, fallbackValues, "duplicate");
									updatedContent = fallbackApplied.content;
									return fallbackApplied.results;
								});
								for (const t of aiTargets) {
									if (values[t.id]) newDuplicateBankEntries[duplicateBankKey(t.kind, t.category)] = values[t.id];
								}
							}
							if (aiError) {
								aiResults.forEach((r) => {
									if (r.status === "skipped") r.note = `AI call failed (${aiError}) — ${r.note}`;
								});
							}
						}
					}

					if (mode === "fix") file.content = updatedContent;
					perFileSummaries.push({ path: file.path, results: [...results, ...aiResults] });
					step += 1;
					enqueue({ type: "progress", processed: step, total: totalSteps, currentFile: file.path });
				}

				// --- Project-wide fixes: robots.txt, sitemap.xml, security headers.
				// In audit mode this runs against a scratch copy of `files` so it can
				// report what's missing without actually writing new files into the
				// project the user uploaded. ---
				enqueue({ type: "status", message: "Checking project-wide files (robots.txt, sitemap, security headers)…" });
				const routePaths = htmlFiles.length > 0 ? htmlFiles.map((f) => f.path) : deriveNextAppRoutes(files);
				const projectFilesTarget = mode === "audit" ? files.map((f) => ({ ...f })) : files;
				const projectResults = runProjectFix(projectFilesTarget, siteUrl, routePaths);
				if (mode === "fix") files = projectFilesTarget;
				step += 1;
				enqueue({ type: "progress", processed: step, total: totalSteps });

				const summary = {
					filesFixed: htmlFilesToFix.length + sourceFilesToFix.length,
					filesSkippedTooMany: (htmlFiles.length - htmlFilesToFix.length) + (sourceFiles.length - sourceFilesToFix.length),
					fixed:
						perFileSummaries.reduce((n, f) => n + f.results.filter((r) => r.status === "fixed").length, 0) +
						projectResults.filter((r) => r.status === "fixed").length,
					duplicated: perFileSummaries.reduce((n, f) => n + f.results.filter((r) => r.status === "duplicated").length, 0),
					aiNeeded: perFileSummaries.reduce((n, f) => n + f.results.filter((r) => r.status === "ai-needed").length, 0),
					skipped:
						perFileSummaries.reduce((n, f) => n + f.results.filter((r) => r.status === "skipped").length, 0) +
						projectResults.filter((r) => r.status === "skipped").length,
				};

				const data: Record<string, unknown> = {
					mode,
					stack: stack.summary,
					summary,
					perFileResults: perFileSummaries,
					projectResults,
					duplicateBankUpdates: newDuplicateBankEntries,
				};

				if (mode === "fix") {
					enqueue({ type: "status", message: "Packaging fixed project…" });
					const outZip = new JSZip();
					for (const f of files) outZip.file(f.path, f.content);
					const zipBuffer = await outZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
					data.zipBase64 = zipBuffer.toString("base64");
				}

				enqueue({ type: "done", data });
			} catch (error) {
				enqueue({ type: "error", message: getErrorMessage(error, "Internal server error") });
			} finally {
				close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
