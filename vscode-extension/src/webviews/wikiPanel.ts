import * as vscode from "vscode";
import { marked } from "marked";
import { getNonce, webviewHtml } from "./webviewBase";
import { loadWikiPages } from "../wiki/wikiStore";

export class WikiPanel {
	public static current: WikiPanel | undefined;
	private readonly panel: vscode.WebviewPanel;

	static async createOrShow(context: vscode.ExtensionContext, openPage?: string) {
		if (WikiPanel.current) {
			WikiPanel.current.panel.reveal();
			if (openPage) await WikiPanel.current.postPages(context, openPage);
			return WikiPanel.current;
		}
		const panel = vscode.window.createWebviewPanel("optiqraWiki", "OptiQra Wiki", vscode.ViewColumn.Two, {
			enableScripts: true,
			retainContextWhenHidden: true,
		});
		WikiPanel.current = new WikiPanel(panel, context);
		await WikiPanel.current.postPages(context, openPage);
		return WikiPanel.current;
	}

	private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
		this.panel = panel;
		panel.onDidDispose(() => (WikiPanel.current = undefined));
		panel.webview.onDidReceiveMessage((msg) => {
			if (msg.type === "openExternal") vscode.env.openExternal(vscode.Uri.parse("https://github.com/armin5872/OptiQra/wiki"));
			if (msg.type === "syncWiki") vscode.commands.executeCommand("optiqra.syncWiki");
			if (msg.type === "starOnGitHub") vscode.commands.executeCommand("optiqra.starOnGitHub");
		});
		this.render();
	}

	private async postPages(context: vscode.ExtensionContext, openPage?: string) {
		const pages = await loadWikiPages(context);
		const rendered = pages.map((p) => ({ title: p.title, file: p.file, html: marked.parse(p.text, { async: false }) as string }));
		this.panel.webview.postMessage({ type: "pages", data: rendered, openPage });
	}

	private render() {
		const nonce = getNonce();
		this.panel.webview.html = webviewHtml({
			title: "OptiQra Wiki",
			nonce,
			webview: this.panel.webview,
			bodyHtml: BODY,
			scriptUri: undefined,
		}).replace("</body>", `<script nonce="${nonce}">${SCRIPT}</script></body>`);
	}
}

const BODY = `
<div class="oq-header">
  <div class="oq-logo"><span class="dot"></span> OptiQra Wiki <span style="font-weight:400;color:var(--oq-text-muted);font-size:12px;">— offline reference</span></div>
  <div style="display:flex; gap:8px;">
    <button class="oq-btn" id="btn-sync">↻ Sync Wiki</button>
    <button class="oq-btn" id="btn-external">↗ Open on GitHub</button>
    <button class="oq-btn primary" id="btn-star">★ Star on GitHub</button>
  </div>
</div>
<div style="display:flex; height:calc(100vh - 57px);">
  <div id="nav" style="width:240px; border-right:1px solid var(--oq-border); overflow:auto; padding:8px; background:var(--oq-bg-elevated);"></div>
  <div id="content" style="flex:1; overflow:auto; padding:24px 32px; max-width:900px;"></div>
</div>
<style>
  #nav .item { padding:8px 10px; border-radius:6px; cursor:pointer; font-size:13px; color:var(--oq-text-muted); margin-bottom:2px; }
  #nav .item:hover { background:var(--oq-card-hover); color:var(--oq-text); }
  #nav .item.active { background:var(--oq-card); color:var(--oq-text); font-weight:600; border-left:3px solid var(--oq-accent-1); }
  #content h1, #content h2, #content h3 { color:var(--oq-text); }
  #content code { background: var(--oq-bg-elevated); padding: 1px 5px; border-radius:4px; }
  #content a { color: var(--oq-accent-1); }
</style>
`;

const SCRIPT = `
const vscode = acquireVsCodeApi();
document.getElementById('btn-sync').onclick = () => vscode.postMessage({ type: 'syncWiki' });
document.getElementById('btn-external').onclick = () => vscode.postMessage({ type: 'openExternal' });
document.getElementById('btn-star').onclick = () => vscode.postMessage({ type: 'starOnGitHub' });

let pages = [];
function renderNav(active) {
  document.getElementById('nav').innerHTML = pages.map((p) =>
    '<div class="item' + (p.file === active ? ' active' : '') + '" data-file="' + p.file + '">' + p.title + '</div>'
  ).join('');
  document.querySelectorAll('#nav .item').forEach((el) => {
    el.addEventListener('click', () => showPage(el.getAttribute('data-file')));
  });
}
function showPage(file) {
  const page = pages.find((p) => p.file === file) || pages[0];
  if (!page) { document.getElementById('content').innerHTML = '<div class="oq-empty">No wiki pages cached yet — click Sync Wiki.</div>'; return; }
  document.getElementById('content').innerHTML = page.html;
  renderNav(page.file);
}
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'pages') { pages = msg.data; showPage(msg.openPage || (pages[0] && pages[0].file)); }
});
`;
