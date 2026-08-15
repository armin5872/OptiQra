import * as vscode from "vscode";
import { OptiQraDiagnostics } from "./diagnostics/diagnosticsManager";
import { OptiQraCodeActionProvider, OptiQraHoverProvider } from "./diagnostics/codeActions";
import { IssuesTreeProvider } from "./views/issuesTreeProvider";
import { ActionsTreeProvider } from "./views/actionsTreeProvider";
import { OptiQraStatusBar } from "./views/statusBar";
import { DashboardPanel } from "./webviews/dashboardPanel";
import { CrawlTreePanel } from "./webviews/crawlTreePanel";
import { ChatPanel } from "./webviews/chatPanel";
import { WikiPanel } from "./webviews/wikiPanel";
import { fixDocument, FixPreviewContentProvider } from "./fix/fixController";
import { getApiKey, setApiKey, clearApiKey, getSettings } from "./settings";
import { runFullAudit } from "./audit/engine";
import { scanWorkspaceFiles, scanProjectMetaFiles } from "./scanner/projectScanner";

const SELECTABLE_LANGUAGES: vscode.DocumentSelector = [
	{ scheme: "file", language: "html" },
	{ scheme: "file", language: "javascript" },
	{ scheme: "file", language: "javascriptreact" },
	{ scheme: "file", language: "typescript" },
	{ scheme: "file", language: "typescriptreact" },
	{ scheme: "file", language: "vue" },
	{ scheme: "file", language: "svelte" },
	{ scheme: "file", language: "astro" },
	{ scheme: "file", language: "php" },
];

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
	const diagnostics = new OptiQraDiagnostics();
	const statusBar = new OptiQraStatusBar();
	const issuesProvider = new IssuesTreeProvider();

	context.subscriptions.push(
		diagnostics,
		statusBar,
		vscode.window.registerTreeDataProvider("optiqra.issuesView", issuesProvider),
		vscode.window.registerTreeDataProvider("optiqra.actionsView", new ActionsTreeProvider()),
		vscode.workspace.registerTextDocumentContentProvider("optiqra-fix-preview", new FixPreviewContentProvider()),
		vscode.languages.registerCodeActionsProvider(SELECTABLE_LANGUAGES, new OptiQraCodeActionProvider(), {
			providedCodeActionKinds: OptiQraCodeActionProvider.providedCodeActionKinds,
		}),
		vscode.languages.registerHoverProvider(SELECTABLE_LANGUAGES, new OptiQraHoverProvider()),
	);

	function scheduleDiagnostics(doc: vscode.TextDocument) {
		if (!vscode.languages.match(SELECTABLE_LANGUAGES, doc)) return;
		const settings = getSettings();
		if (!settings.diagnostics.enabled || !settings.diagnostics.liveAsYouType) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			diagnostics.update(doc);
			issuesProvider.refresh();
		}, 400);
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.update(doc)),
		vscode.workspace.onDidChangeTextDocument((e) => scheduleDiagnostics(e.document)),
		vscode.workspace.onDidSaveTextDocument((doc) => {
			diagnostics.update(doc);
			issuesProvider.refresh();
		}),
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor) diagnostics.update(editor.document);
		}),
		vscode.languages.onDidChangeDiagnostics(() => issuesProvider.refresh()),
	);
	if (getSettings().diagnostics.enabled) {
		for (const doc of vscode.workspace.textDocuments) diagnostics.update(doc);
	}

	// ---------------- Commands ----------------
	const cmd = (id: string, handler: (...args: any[]) => any) => context.subscriptions.push(vscode.commands.registerCommand(id, handler));

	cmd("optiqra.openDashboard", () => DashboardPanel.createOrShow(context));
	cmd("optiqra.openCrawlTree", () => CrawlTreePanel.createOrShow(context));
	cmd("optiqra.openChat", () => ChatPanel.createOrShow(context));
	cmd("optiqra.openWiki", () => WikiPanel.createOrShow(context));
	cmd("optiqra.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "optiqra"));

	cmd("optiqra.setApiKey", async () => {
		const key = await vscode.window.showInputBox({
			title: "OptiQra: Set AI API Key",
			prompt: "Paste your API key for the provider selected in optiqra.ai.provider. Stored securely via VS Code SecretStorage — never written to settings.json.",
			password: true,
			ignoreFocusOut: true,
		});
		if (key) {
			await setApiKey(context, key);
			vscode.window.showInformationMessage("OptiQra: API key saved securely.");
		}
	});
	cmd("optiqra.clearApiKey", async () => {
		await clearApiKey(context);
		vscode.window.showInformationMessage("OptiQra: API key cleared.");
	});

	cmd("optiqra.runFullScan", async () => {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "OptiQra: scanning workspace…" }, async () => {
			statusBar.setScore(undefined, true);
			const files = await scanWorkspaceFiles();
			const meta = await scanProjectMetaFiles();
			const run = await runFullAudit(files, meta);
			statusBar.setScore(run.overallScore);
			for (const doc of vscode.workspace.textDocuments) diagnostics.update(doc);
			issuesProvider.refresh();
			vscode.window.showInformationMessage(`OptiQra scan complete — overall score ${run.overallScore}/100 across ${run.filesScanned} file(s).`);
		});
	});

	cmd("optiqra.fixCurrentFile", async (uri?: vscode.Uri) => {
		const doc = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
		if (!doc) {
			vscode.window.showWarningMessage("OptiQra: open a file to fix first.");
			return;
		}
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `OptiQra: fixing ${vscode.workspace.asRelativePath(doc.uri, false)}…` }, async () => {
			const outcome = await fixDocument(context, doc);
			vscode.window.showInformationMessage(`OptiQra: ${outcome.summary}`);
			diagnostics.update(doc);
			issuesProvider.refresh();
		});
	});

	cmd("optiqra.fixIssueAtCursor", async (uriArg?: vscode.Uri | string) => {
		const doc = vscode.window.activeTextEditor?.document;
		if (!doc) return;
		// Issue-level targeting isn't separately addressable in the ported
		// engine (it rewrites whole-file content, not single matches), so
		// "fix this issue" and "fix file" converge on the same safe pipeline
		// — the diff preview makes clear exactly what changed either way.
		void uriArg;
		await vscode.commands.executeCommand("optiqra.fixCurrentFile", doc.uri);
	});

	cmd("optiqra.askOpcaAboutIssue", async (uri?: vscode.Uri, diagnostic?: vscode.Diagnostic) => {
		const panel = ChatPanel.createOrShow(context);
		const doc = vscode.window.activeTextEditor?.document;
		const path = doc ? vscode.workspace.asRelativePath(doc.uri, false) : "";
		const question = diagnostic
			? `In ${path}, explain and help me fix: "${diagnostic.message}"`
			: `Help me with the OptiQra issues in ${path || "the active file"}.`;
		await panel.askAbout(question);
	});

	cmd("optiqra.syncWiki", async () => {
		vscode.window.showInformationMessage(
			"OptiQra: the wiki bundled with this extension is a point-in-time offline copy. To get the latest version, open it on GitHub.",
			"Open on GitHub",
		).then((choice) => {
			if (choice) vscode.env.openExternal(vscode.Uri.parse("https://github.com/armin5872/OptiQra/wiki"));
		});
	});

	cmd("optiqra.toggleAutoApprove", async () => {
		const cfg = vscode.workspace.getConfiguration("optiqra");
		const current = cfg.get<boolean>("fix.autoApprove", false);
		await cfg.update("fix.autoApprove", !current, vscode.ConfigurationTarget.Workspace);
		vscode.window.showInformationMessage(`OptiQra: auto-approve fixes is now ${!current ? "ON" : "OFF"}.`);
	});

	cmd("optiqra.starOnGitHub", () => vscode.env.openExternal(vscode.Uri.parse("https://github.com/armin5872/OptiQra")));

	void getApiKey; // referenced by other modules via settings.ts; kept for symmetry/clarity here

	// Kick off an initial background scan so the dashboard/status bar have
	// something on first open, without blocking activation.
	void vscode.commands.executeCommand("optiqra.runFullScan").then(undefined, () => {});
}

export function deactivate() {}
