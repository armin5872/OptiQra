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
			this.maybeOfferAgentHelp(this.lastRun);
		} catch (err: any) {
			this.panel.webview.postMessage({ type: "error", message: String(err?.message ?? err) });
		}
	}

	/** After a scan, proactively surface a one-click way to hand the worst
	 *  findings to OPCA — rather than only reacting once the person opens
	 *  chat and asks. This is the "agent notices things and offers to act"
	 *  behavior that makes OPCA feel less like a bolt-on chatbot. Fires at
	 *  most once per scan and never for a clean project. */
	private maybeOfferAgentHelp(run: AuditRun) {
		const totalIssues = Object.values(run.categories as Record<string, ProjectCategory>).reduce((sum, c) => sum + c.issues.length, 0);
		if (totalIssues === 0) return;
		const criticalCount = Object.values(run.categories as Record<string, ProjectCategory>)
			.flatMap((c) => c.issues)
			.filter((i) => i.severity === "critical" || i.severity === "high").length;
		if (criticalCount === 0) return;

		vscode.window
			.showInformationMessage(
				`OptiQra found ${criticalCount} high-priority issue${criticalCount === 1 ? "" : "s"}. Want OPCA to take a first pass?`,
				"Let OPCA handle it",
				"Not now",
			)
			.then((choice) => {
				if (choice === "Let OPCA handle it") {
					vscode.commands.executeCommand(
						"optiqra.askOpca",
						"Run a scan, then fix the highest-severity issues you find, one file at a time. Show me a summary of what you changed after each fix.",
					);
				}
			});
	}

	private serialize(run: AuditRun) {
		const categories: Record<string, ProjectCategory> = run.categories;
		// Real per-file paths for exact single-file matches (used for
		// "Fix" actions that need a concrete file, not just a category-wide
		// finding). buildProjectCategoryReport() bakes the affected path into
		// each issue's `detail` string as a "(some/path.tsx)" suffix when it's
		// a single file, or "(found in N files)" when it spans several — we
		// don't touch that shared function, we just recognize its own
		// established convention here to recover a clickable path when there
		// is exactly one.
		const singleFilePath = (detail: string): string | undefined => {
			const m = detail.match(/\(([^()]+\.[a-zA-Z0-9]+)\)$/);
			return m ? m[1] : undefined;
		};
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
				issues: c.issues.slice(0, 50).map((i) => ({
					id: i.id,
					title: i.title,
					detail: i.detail,
					severity: i.severity,
					weight: i.weight,
					path: singleFilePath(i.detail),
				})),
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
		})
			.replace("</head>", `<style nonce="${nonce}">${DASHBOARD_STYLES}</style></head>`)
			.replace("</body>", `<script nonce="${nonce}">${SCRIPT}</script></body>`);
	}
}

const DASHBOARD_STYLES = `
@keyframes oq-fade-up { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
@keyframes oq-pop { from { opacity:0; transform: scale(.96); } to { opacity:1; transform: scale(1); } }
@keyframes oq-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
.oq-hero { animation: oq-pop .25s ease; }
.oq-cat-card { animation: oq-fade-up .3s ease both; }
.oq-issue-row {
  border-left:3px solid transparent; padding:6px 10px; background:var(--oq-bg-elevated); border-radius:6px;
  cursor:pointer; transition: background .12s ease, transform .12s ease; display:flex; align-items:flex-start; gap:8px;
}
.oq-issue-row:hover { background:var(--oq-card-hover); transform: translateX(2px); }
.oq-issue-row .oq-fix-btn { opacity:0; transition: opacity .12s ease; flex-shrink:0; }
.oq-issue-row:hover .oq-fix-btn { opacity:1; }
.oq-score-ring circle:last-child { transition: stroke-dashoffset .6s cubic-bezier(.4,0,.2,1); }
.oq-skeleton {
  height:14px; border-radius:4px; background: linear-gradient(90deg, var(--oq-bg-elevated) 0px, var(--oq-card-hover) 40px, var(--oq-bg-elevated) 80px);
  background-size: 800px 100%; animation: oq-shimmer 1.4s linear infinite;
}
.oq-cat-card:hover { border-color: var(--oq-accent-1); }
.oq-cat-card { transition: border-color .15s ease; }
`;

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
        stroke-dasharray="\${c}" stroke-dashoffset="\${c}" stroke-linecap="round"/>
    </svg>
    <div class="num">\${score}</div>
  </div>\`;
}
// Animate rings to their real offset a tick after insert, so the stroke
// visibly draws in instead of appearing pre-filled.
function animateRings(container) {
  requestAnimationFrame(() => {
    container.querySelectorAll('.oq-score-ring').forEach((el) => {
      const num = Number(el.querySelector('.num').textContent);
      const circle = el.querySelectorAll('circle')[1];
      const r = Number(circle.getAttribute('r'));
      const c = 2 * Math.PI * r;
      circle.setAttribute('stroke-dashoffset', String(c - (num / 100) * c));
    });
  });
}

function skeleton() {
  return \`
    <div class="oq-hero" style="display:flex; gap:20px; align-items:center; margin-bottom:24px;">
      <div class="oq-card" style="display:flex; align-items:center; gap:16px; flex: 0 0 auto; min-width:320px;">
        <div style="width:88px;height:88px;border-radius:50%;border:6px solid var(--oq-border);"></div>
        <div style="flex:1;">
          <div class="oq-skeleton" style="width:120px; margin-bottom:8px;"></div>
          <div class="oq-skeleton" style="width:160px; margin-bottom:6px;"></div>
          <div class="oq-skeleton" style="width:100px;"></div>
        </div>
      </div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:16px;">
      \${[0,1,2,3,4,5].map(() => \`<div class="oq-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div class="oq-skeleton" style="width:100px;"></div>
          <div style="width:48px;height:48px;border-radius:50%;border:5px solid var(--oq-border);"></div>
        </div>
        <div class="oq-skeleton" style="width:140px; margin-bottom:12px;"></div>
        <div class="oq-skeleton" style="width:100%; margin-bottom:6px;"></div>
        <div class="oq-skeleton" style="width:90%;"></div>
      </div>\`).join('')}
    </div>\`;
}

function render(data) {
  if (!data) { root.innerHTML = skeleton(); return; }
  const overall = data.overallScore;
  const totalIssues = data.categories.reduce((sum, c) => sum + c.issues.length, 0);
  let html = \`
    <div class="oq-hero" style="display:flex; gap:20px; align-items:center; margin-bottom:24px; flex-wrap:wrap;">
      <div class="oq-card" style="display:flex; align-items:center; gap:16px; flex: 0 0 auto;">
        \${ring(overall, 88)}
        <div>
          <div style="font-size:11px; color:var(--oq-text-muted); text-transform:uppercase; letter-spacing:.05em;">Overall Score</div>
          <div style="font-size:13px; color:var(--oq-text-muted); margin-top:4px;">\${data.filesScanned} file(s) scanned \${totalIssues ? '· ' + totalIssues + ' open issue(s)' : ''}</div>
          <div style="font-size:12px; color:var(--oq-text-dim); margin-top:2px;">Stack: \${data.stack.summary}</div>
        </div>
      </div>
      \${totalIssues === 0 ? '<div class="oq-badge good" style="font-size:12px; padding:8px 14px;">✓ No open issues — nice work</div>' : ''}
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:16px;">
  \`;
  data.categories.forEach(function(cat, catIdx) {
    html += \`<div class="oq-cat-card oq-card" style="animation-delay:\${Math.min(catIdx * 40, 320)}ms;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:600;">\${cat.icon} \${cat.label}</div>
        \${ring(cat.score, 48)}
      </div>
      <div style="font-size:11px; color:var(--oq-text-muted); margin-bottom:8px;">\${cat.issues.length} issue(s) · \${cat.passedCount} passed</div>
      <div style="max-height:200px; overflow:auto; display:flex; flex-direction:column; gap:6px;">
        \${cat.issues.slice(0,8).map(function(i) {
          const clickable = !!i.path;
          return '<div class="oq-issue-row" data-path="' + (i.path ? escAttr(i.path) : '') + '" style="border-left-color:' + SEV_COLOR[i.severity] + ';' + (clickable ? '' : 'cursor:default;') + '">' +
            '<div style="flex:1; min-width:0;">' +
              '<div style="font-size:12px; font-weight:500;">' + esc(i.title) + '</div>' +
              '<div style="font-size:11px; color:var(--oq-text-muted); margin-top:2px;">' + esc(i.detail.slice(0,120)) + '</div>' +
            '</div>' +
            (clickable ? '<button class="oq-btn oq-fix-btn" data-fix="' + escAttr(i.path) + '" style="font-size:10px; padding:3px 8px;">Fix</button>' : '') +
          '</div>';
        }).join('')}
        \${cat.issues.length === 0 ? '<div style="font-size:12px; color:var(--oq-good); padding:4px 2px;">✓ No issues found</div>' : ''}
        \${cat.issues.length > 8 ? '<div style="font-size:11px; color:var(--oq-text-dim); padding:2px;">+ ' + (cat.issues.length - 8) + ' more — ask OPCA to list them all</div>' : ''}
      </div>
    </div>\`;
  });
  html += '</div>';
  root.innerHTML = html;
  animateRings(root);
  wireIssueRows();
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

function wireIssueRows() {
  root.querySelectorAll('.oq-issue-row').forEach((row) => {
    const path = row.getAttribute('data-path');
    if (!path) return;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.oq-fix-btn')) return;
      vscode.postMessage({ type: 'openFile', path });
    });
  });
  root.querySelectorAll('.oq-fix-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'fixFile', path: btn.getAttribute('data-fix') });
    });
  });
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'scanning') render(null);
  if (msg.type === 'result') render(msg.data);
  if (msg.type === 'error') root.innerHTML = '<div class="oq-empty"><div class="big">⚠️</div>' + esc(msg.message) + '</div>';
});
render(null);
`;
