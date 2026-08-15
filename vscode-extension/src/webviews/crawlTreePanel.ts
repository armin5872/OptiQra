import * as vscode from "vscode";
import { getNonce, webviewHtml } from "./webviewBase";
import { runFullAudit } from "../audit/engine";
import { scanWorkspaceFiles, scanProjectMetaFiles } from "../scanner/projectScanner";
import { buildCrawlGraph } from "../scanner/crawlGraph";
import { fixDocument } from "../fix/fixController";

export class CrawlTreePanel {
	public static current: CrawlTreePanel | undefined;
	private readonly panel: vscode.WebviewPanel;

	static createOrShow(context: vscode.ExtensionContext) {
		if (CrawlTreePanel.current) {
			CrawlTreePanel.current.panel.reveal();
			return CrawlTreePanel.current;
		}
		const panel = vscode.window.createWebviewPanel("optiqraCrawlTree", "OptiQra Crawl Tree", vscode.ViewColumn.One, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media", "crawltree")],
		});
		CrawlTreePanel.current = new CrawlTreePanel(panel, context);
		return CrawlTreePanel.current;
	}

	private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
		this.panel = panel;
		panel.onDidDispose(() => (CrawlTreePanel.current = undefined));
		panel.webview.onDidReceiveMessage(async (msg) => this.handleMessage(msg));
		this.render();
	}

	private async handleMessage(msg: any) {
		if (msg.type === "ready") await this.sendGraph();
		if (msg.type === "openFile") {
			const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, msg.path);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
		}
		if (msg.type === "fixFile") {
			const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, msg.path);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
			const outcome = await fixDocument(this.context, doc);
			vscode.window.showInformationMessage(`OptiQra: ${outcome.summary}`);
		}
	}

	private async sendGraph() {
		const files = await scanWorkspaceFiles();
		const meta = await scanProjectMetaFiles();
		const run = await runFullAudit(files, meta);
		const issueCounts = new Map<string, number>();
		for (const r of run.perFileResults) {
			issueCounts.set(r.path, r.results.filter((x) => x.status !== "fixed").length);
		}
		for (const [path, page] of run.fullPageResults) {
			issueCounts.set(path, (issueCounts.get(path) ?? 0) + page.issues.length);
		}
		const graph = buildCrawlGraph(files, issueCounts);
		this.panel.webview.postMessage({ type: "graph", data: graph });
	}

	private render() {
		const nonce = getNonce();
		const scriptUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "media", "crawltree", "bundle.js"),
		);
		this.panel.webview.html = webviewHtml({
			title: "OptiQra Crawl Tree",
			nonce,
			webview: this.panel.webview,
			bodyHtml: BODY,
			scriptUri,
			extraCsp: `worker-src ${this.panel.webview.cspSource}; connect-src ${this.panel.webview.cspSource};`,
		});
	}
}

const BODY = `
<div class="oq-header">
  <div class="oq-logo"><span class="dot"></span> Crawl Tree</div>
  <div style="display:flex; gap:8px; align-items:center;">
    <span id="stats" style="font-size:12px; color:var(--oq-text-muted); margin-right:8px;"></span>
    <button class="oq-btn primary" id="btn-2d">2D</button>
    <button class="oq-btn" id="btn-3d">3D</button>
  </div>
</div>
<div style="display:flex; height:calc(100vh - 57px);">
  <div style="flex:1; position:relative; overflow:hidden;">
    <div id="svg-host" style="width:100%; height:100%;"></div>
    <div id="three-host" style="width:100%; height:100%; display:none;"></div>
  </div>
  <div style="width:280px; border-left:1px solid var(--oq-border); background:var(--oq-bg-elevated);" id="detail"></div>
</div>
`;
