import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import JSZip from "jszip";
import { runAutoFix, applyAITargetValues, duplicateBankKey, type AutoFixResult } from "@/lib/autoFixEngine";
import { runProjectFix, detectProjectStack, type ProjectFile } from "@/lib/projectFixEngine";
import { buildAutoFixBatchPrompt, parseAutoFixResponse } from "@/lib/autoFixPrompt";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { completeFix } from "@/lib/aiProviders";
import { getErrorMessage } from "@/lib/errorUtils";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TOTAL_UNCOMPRESSED_BYTES = 60 * 1024 * 1024; // 60MB
const MAX_FILE_COUNT = 3000;
const MAX_HTML_FILES_TO_FIX = 250; // guardrail against runaway AI cost on huge sites

interface PerFileSummary {
	path: string;
	results: AutoFixResult[];
}

export async function POST(req: NextRequest) {
	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return NextResponse.json({ error: "Expected multipart/form-data with an uploaded project." }, { status: 400 });
	}

	const uploaded = form.get("project");
	if (!uploaded || typeof uploaded === "string") {
		return NextResponse.json({ error: "No project file/folder uploaded." }, { status: 400 });
	}
	const uploadedFile = uploaded as File;

	const siteUrl = (form.get("siteUrl") as string) || "";
	const provider = (form.get("provider") as string) || "";
	const apiKey = (form.get("apiKey") as string) || "";
	const model = (form.get("model") as string) || "";
	const hasAI = !!provider && !!apiKey && !!AI_PROVIDERS[provider as AIProviderId];
	let duplicateBank: Record<string, string> = {};
	try {
		duplicateBank = JSON.parse((form.get("duplicateBank") as string) || "{}");
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
				return NextResponse.json({ error: `Project has too many files (${entries.length}, max ${MAX_FILE_COUNT}).` }, { status: 400 });
			}
			let totalBytes = 0;
			for (const entry of entries) {
				const content = await entry.async("string");
				totalBytes += content.length;
				if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
					return NextResponse.json({ error: "Project is too large to auto-fix in the browser (60MB limit)." }, { status: 400 });
				}
				files.push({ path: normalizePath(entry.name), content });
			}
		} else {
			if (allEntries.length > MAX_FILE_COUNT) {
				return NextResponse.json({ error: `Project has too many files (${allEntries.length}, max ${MAX_FILE_COUNT}).` }, { status: 400 });
			}
			let totalBytes = 0;
			for (const f of allEntries) {
				const content = await f.text();
				totalBytes += content.length;
				if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
					return NextResponse.json({ error: "Project is too large to auto-fix in the browser (60MB limit)." }, { status: 400 });
				}
				files.push({ path: normalizePath(f.name), content });
			}
		}
	} catch (err) {
		return NextResponse.json({ error: getErrorMessage(err, "Couldn't read the uploaded project") }, { status: 400 });
	}

	// Skip build output / dependency directories — fixing generated files is
	// pointless (they're overwritten on next build) and node_modules can be huge.
	files = files.filter((f) => !/(^|\/)(node_modules|\.next|\.git|dist|build|out)\//.test(f.path));

	const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path));
	if (htmlFiles.length === 0) {
		return NextResponse.json({ error: "No .html files found in the uploaded project." }, { status: 400 });
	}

	const stack = detectProjectStack(files);
	const perFileSummaries: PerFileSummary[] = [];
	const newDuplicateBankEntries: Record<string, string> = {};
	const htmlFilesToFix = htmlFiles.slice(0, MAX_HTML_FILES_TO_FIX);

	for (const file of htmlFilesToFix) {
		const $ = load(file.content);
		const pageUrl = siteUrl ? joinUrl(siteUrl, file.path) : file.path;
		const { results, aiTargets } = runAutoFix($, pageUrl);
		let aiResults: AutoFixResult[] = [];

		if (aiTargets.length > 0) {
			if (hasAI) {
				const resolvedModel = model || AI_PROVIDERS[provider as AIProviderId].defaultModel;
				const { system, user } = buildAutoFixBatchPrompt(aiTargets, pageUrl, {
					primary: stack.summary,
					summary: stack.summary,
					guidance: "This is a static project file, not a live crawl — keep suggested content generic to the page's own markup.",
				});
				try {
					const raw = await completeFix(provider as AIProviderId, { apiKey, model: resolvedModel, system, user });
					const { values } = parseAutoFixResponse(raw);
					const missing = aiTargets.filter((t) => !values[t.id]);
					aiResults = applyAITargetValues($, aiTargets, values, "ai");
					if (missing.length > 0) {
						const fallbackValues: Record<string, string> = {};
						for (const t of missing) {
							const bankValue = duplicateBank[duplicateBankKey(t.kind, t.category)];
							if (bankValue) fallbackValues[t.id] = bankValue;
						}
						aiResults = aiResults.concat(applyAITargetValues($, missing, fallbackValues, "duplicate"));
					}
					for (const t of aiTargets) {
						if (values[t.id]) newDuplicateBankEntries[duplicateBankKey(t.kind, t.category)] = values[t.id];
					}
				} catch (err) {
					const fallbackValues: Record<string, string> = {};
					for (const t of aiTargets) {
						const bankValue = duplicateBank[duplicateBankKey(t.kind, t.category)];
						if (bankValue) fallbackValues[t.id] = bankValue;
					}
					aiResults = applyAITargetValues($, aiTargets, fallbackValues, "duplicate");
					aiResults.forEach((r) => {
						if (r.status === "skipped") r.note = `AI call failed (${getErrorMessage(err, "unknown error")}) — ${r.note}`;
					});
				}
			} else {
				const fallbackValues: Record<string, string> = {};
				for (const t of aiTargets) {
					const bankValue = duplicateBank[duplicateBankKey(t.kind, t.category)];
					if (bankValue) fallbackValues[t.id] = bankValue;
				}
				aiResults = applyAITargetValues($, aiTargets, fallbackValues, "duplicate");
			}
		}

		file.content = $.html();
		perFileSummaries.push({ path: file.path, results: [...results, ...aiResults] });
	}

	// --- Project-wide fixes: robots.txt, sitemap.xml, security headers. ---
	const projectResults = runProjectFix(files, siteUrl, htmlFiles.map((f) => f.path));

	// --- Rezip everything (files array now holds the fixed content, plus any
	// newly created robots.txt/sitemap.xml/_headers/next.config.js entries). ---
	const outZip = new JSZip();
	for (const f of files) {
		outZip.file(f.path, f.content);
	}
	const zipBuffer = await outZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

	const summary = {
		filesFixed: htmlFilesToFix.length,
		filesSkippedTooMany: htmlFiles.length - htmlFilesToFix.length,
		fixed: perFileSummaries.reduce((n, f) => n + f.results.filter((r) => r.status === "fixed").length, 0) +
			projectResults.filter((r) => r.status === "fixed").length,
		duplicated: perFileSummaries.reduce((n, f) => n + f.results.filter((r) => r.status === "duplicated").length, 0),
		skipped: perFileSummaries.reduce((n, f) => n + f.results.filter((r) => r.status === "skipped").length, 0) +
			projectResults.filter((r) => r.status === "skipped").length,
	};

	return NextResponse.json({
		zipBase64: zipBuffer.toString("base64"),
		stack: stack.summary,
		summary,
		perFileResults: perFileSummaries,
		projectResults,
		duplicateBankUpdates: newDuplicateBankEntries,
	});
}

function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").replace(/^\/+/, "");
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
