import * as vscode from "vscode";
import { getNonce, webviewHtml } from "./webviewBase";
import { runFullAudit, type AuditRun } from "../audit/engine";
import { scanWorkspaceFiles, scanProjectMetaFiles } from "../scanner/projectScanner";
import type { ProjectCategory } from "../../../src/lib/projectAudit";
import { fixDocument } from "../fix/fixController";

const CATEGORY_ICON: Record<string, string> = {
	seo: "🔍", speed: "⚡", a11y: "♿", conversions: "🎯",
	security: "🔐", bestPractices: "✅",
};

export class DashboardPanel {
	public static current: DashboardPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private lastRun: AuditRun | undefined;

	static createOrShow(context: vscode.ExtensionContext) {
		if (DashboardPanel.current) {
			DashboardPanel.current.panel.reveal();
			return DashboardPanel.current;
		}
		const panel = vscode.window.createWebviewPanel("optiqraDashboard", "OptiQra Dashboard", vscode.ViewColumn.One, {
			enableScripts: true,
			retainContextWhenHidden: true,
		});
		DashboardPanel.current = new DashboardPanel(panel, context);
		return DashboardPanel.current;
	}

	private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
		this.panel = panel;
		panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "icon.png");
		panel.onDidDispose(() => (DashboardPanel.current = undefined));
		panel.webview.onDidReceiveMessage(async (msg) => this.handleMessage(msg));
		this.render();
		void this.runScan();
	}

	private async handleMessage(msg: any) {
		if (msg.type === "rescan") await this.runScan();
		if (msg.type === "openFile") {
			const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, msg.path);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc);
		}
		if (msg.type === "fixFile") {
			const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, msg.path);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc);
			const outcome = await fixDocument(this.context, doc);
			vscode.window.showInformationMessage(`OptiQra: ${outcome.summary}`);
			if (outcome.changed) await this.runScan();
		}
		if (msg.type === "openCrawlTree") vscode.commands.executeCommand("optiqra.openCrawlTree");
		if (msg.type === "openChat") vscode.commands.executeCommand("optiqra.openChat");
		if (msg.type === "starOnGitHub") vscode.commands.executeCommand("optiqra.starOnGitHub");
	}

	private async runScan() {
		this.panel.webview.postMessage({ type: "scanning" });
		try {
			const files = await scanWorkspaceFiles();
			const meta = await scanProjectMetaFiles();
			this.lastRun = await runFullAudit(files, meta);
			this.panel.webview.postMessage({ type: "result", data: this.serialize(this.lastRun) });
		} catch (err: any) {
			this.panel.webview.postMessage({ type: "error", message: String(err?.message ?? err) });
		}
	}

	private serialize(run: AuditRun) {
		const categories: Record<string, ProjectCategory> = run.categories;
		return {
			overallScore: run.overallScore,
			stack: run.stack,
			filesScanned: run.filesScanned,
			timestamp: run.timestamp,
			categories: Object.entries(categories).map(([key, c]) => ({
				key,
				icon: CATEGORY_ICON[key] ?? "📄",
				label: c.label,
				score: c.score,
				issues: c.issues.slice(0, 50).map((i) => ({ id: i.id, title: i.title, detail: i.detail, severity: i.severity, weight: i.weight })),
				passedCount: c.passed.length,
			})),
		};
	}

	private render() {
		const nonce = getNonce();
		this.panel.webview.html = webviewHtml({
			title: "OptiQra Dashboard",
			nonce,
			webview: this.panel.webview,
			bodyHtml: BODY,
			scriptUri: undefined,
		}).replace("</body>", `<script nonce="${nonce}">${SCRIPT}</script></body>`);
	}
}

const BODY = `
<div class="oq-header">
  <div class="oq-logo"><span class="dot"></span> OptiQra Dashboard</div>
  <div style="display:flex; gap:8px;">
    <button class="oq-btn" id="btn-crawltree">🕸️ Crawl Tree</button>
    <button class="oq-btn" id="btn-chat">💬 Ask OPCA</button>
    <button class="oq-btn primary" id="btn-rescan">↻ Rescan</button>
  </div>
</div>
<div id="root" style="padding:20px;"></div>
<div style="text-align:center; padding:20px; color:var(--oq-text-dim); font-size:12px;">
  Like OptiQra? <a href="https://github.com/armin5872/OptiQra" id="star-link">Give us a star on GitHub ★</a>
</div>
`;

const SCRIPT = `
const vscode = acquireVsCodeApi();
const root = document.getElementById('root');
document.getElementById('btn-rescan').onclick = () => vscode.postMessage({ type: 'rescan' });
document.getElementById('btn-crawltree').onclick = () => vscode.postMessage({ type: 'openCrawlTree' });
document.getElementById('btn-chat').onclick = () => vscode.postMessage({ type: 'openChat' });
document.getElementById('star-link').addEventListener('click', (e) => { e.preventDefault(); vscode.postMessage({ type: 'starOnGitHub' }); });

const SEV_COLOR = { critical: 'var(--oq-critical)', high: 'var(--oq-high)', medium: 'var(--oq-medium)', low: 'var(--oq-low)', informational: 'var(--oq-info)', good: 'var(--oq-good)' };

function scoreColor(score) {
  if (score >= 85) return 'var(--oq-good)';
  if (score >= 60) return 'var(--oq-medium)';
  return 'var(--oq-critical)';
}

function ring(score, size) {
  size = size || 72;
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return \`<div class="oq-score-ring" style="width:\${size}px;height:\${size}px;">
    <svg width="\${size}" height="\${size}">
      <circle cx="\${size/2}" cy="\${size/2}" r="\${r}" stroke="var(--oq-border)" stroke-width="6" fill="none"/>
      <circle cx="\${size/2}" cy="\${size/2}" r="\${r}" stroke="\${scoreColor(score)}" stroke-width="6" fill="none"
        stroke-dasharray="\${c}" stroke-dashoffset="\${off}" stroke-linecap="round"/>
    </svg>
    <div class="num">\${score}</div>
  </div>\`;
}

function render(data) {
  if (!data) { root.innerHTML = '<div class="oq-empty"><div class="big">🔍</div>Scanning your workspace…</div>'; return; }
  const overall = data.overallScore;
  let html = \`
    <div style="display:flex; gap:20px; align-items:center; margin-bottom:24px;">
      <div class="oq-card" style="display:flex; align-items:center; gap:16px; flex: 0 0 auto;">
        \${ring(overall, 88)}
        <div>
          <div style="font-size:11px; color:var(--oq-text-muted); text-transform:uppercase; letter-spacing:.05em;">Overall Score</div>
          <div style="font-size:13px; color:var(--oq-text-muted); margin-top:4px;">\${data.filesScanned} file(s) scanned</div>
          <div style="font-size:12px; color:var(--oq-text-dim); margin-top:2px;">Stack: \${data.stack.summary}</div>
        </div>
      </div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:16px;">
  \`;
  for (const cat of data.categories) {
    html += \`<div class="oq-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:600;">\${cat.icon} \${cat.label}</div>
        \${ring(cat.score, 48)}
      </div>
      <div style="font-size:11px; color:var(--oq-text-muted); margin-bottom:8px;">\${cat.issues.length} issue(s) · \${cat.passedCount} passed</div>
      <div style="max-height:180px; overflow:auto; display:flex; flex-direction:column; gap:6px;">
        \${cat.issues.slice(0,8).map(function(i) {
          return '<div style="border-left:3px solid ' + SEV_COLOR[i.severity] + '; padding:4px 8px; background:var(--oq-bg-elevated); border-radius:4px;">' +
            '<div style="font-size:12px; font-weight:500;">' + i.title + '</div>' +
            '<div style="font-size:11px; color:var(--oq-text-muted); margin-top:2px;">' + i.detail.slice(0,120) + '</div></div>';
        }).join('')}
        \${cat.issues.length === 0 ? '<div style="font-size:12px; color:var(--oq-good);">✓ No issues found</div>' : ''}
      </div>
    </div>\`;
  }
  html += '</div>';
  root.innerHTML = html;
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'scanning') render(null);
  if (msg.type === 'result') render(msg.data);
  if (msg.type === 'error') root.innerHTML = '<div class="oq-empty"><div class="big">⚠️</div>' + msg.message + '</div>';
});
render(null);
`;
