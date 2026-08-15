import * as vscode from "vscode";
import { getNonce, webviewHtml } from "./webviewBase";
import { chatWithOpca, isAiConfigured, type OpcaChatMessage } from "../fix/opcaClient";

export class ChatPanel {
	public static current: ChatPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private history: OpcaChatMessage[] = [];

	static createOrShow(context: vscode.ExtensionContext) {
		if (ChatPanel.current) {
			ChatPanel.current.panel.reveal();
			return ChatPanel.current;
		}
		const panel = vscode.window.createWebviewPanel("optiqraChat", "OPCA — OptiQra Coding Agent", vscode.ViewColumn.Beside, {
			enableScripts: true,
			retainContextWhenHidden: true,
		});
		ChatPanel.current = new ChatPanel(panel, context);
		return ChatPanel.current;
	}

	private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
		this.panel = panel;
		panel.onDidDispose(() => (ChatPanel.current = undefined));
		panel.webview.onDidReceiveMessage(async (msg) => this.handleMessage(msg));
		this.render();
		void this.checkConfigured();
	}

	async askAbout(question: string) {
		this.panel.reveal();
		await this.send(question);
	}

	private async checkConfigured() {
		const configured = await isAiConfigured(this.context);
		this.panel.webview.postMessage({ type: "configured", value: configured });
	}

	private async handleMessage(msg: any) {
		if (msg.type === "send") await this.send(msg.text);
		if (msg.type === "openSettings") vscode.commands.executeCommand("optiqra.openSettings");
		if (msg.type === "setApiKey") vscode.commands.executeCommand("optiqra.setApiKey");
	}

	private async send(text: string) {
		this.history.push({ role: "user", content: text });
		this.panel.webview.postMessage({ type: "userMessage", text });
		this.panel.webview.postMessage({ type: "thinking", value: true });

		const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === "file");
		const activeFileContext = editor
			? {
					path: vscode.workspace.asRelativePath(editor.document.uri, false),
					language: editor.document.languageId,
					excerpt: editor.document.getText().slice(0, 4000),
			  }
			: undefined;

		try {
			const reply = await chatWithOpca(this.context, this.history, activeFileContext);
			this.history.push({ role: "assistant", content: reply });
			this.panel.webview.postMessage({ type: "assistantMessage", text: reply });
		} catch (err: any) {
			this.panel.webview.postMessage({ type: "assistantError", text: String(err?.message ?? err) });
		} finally {
			this.panel.webview.postMessage({ type: "thinking", value: false });
		}
	}

	private render() {
		const nonce = getNonce();
		this.panel.webview.html = webviewHtml({
			title: "OPCA",
			nonce,
			webview: this.panel.webview,
			bodyHtml: BODY,
			scriptUri: undefined,
		}).replace("</body>", `<script nonce="${nonce}">${SCRIPT}</script></body>`);
	}
}

const BODY = `
<div class="oq-header">
  <div class="oq-logo"><span class="dot"></span> OPCA <span style="font-weight:400;color:var(--oq-text-muted);font-size:12px;">— OptiQra Coding Agent</span></div>
  <button class="oq-btn" id="btn-settings">⚙ AI Settings</button>
</div>
<div id="not-configured" style="display:none; padding:16px; border-bottom:1px solid var(--oq-border); background:rgba(250,204,21,.08);">
  No AI provider configured — OPCA can still be reached, but chat needs a BYOK key.
  <button class="oq-btn primary" id="btn-set-key" style="margin-left:8px;">Set API Key</button>
</div>
<div id="messages" style="padding:16px; display:flex; flex-direction:column; gap:12px; height:calc(100vh - 140px); overflow:auto;"></div>
<div style="position:sticky; bottom:0; padding:12px 16px; border-top:1px solid var(--oq-border); background:var(--oq-bg-elevated); display:flex; gap:8px;">
  <textarea id="input" rows="2" placeholder="Ask OPCA about SEO, GEO, AEO, accessibility, or a fix in your codebase…" style="flex:1; background:var(--oq-card); color:var(--oq-text); border:1px solid var(--oq-border); border-radius:var(--oq-radius); padding:8px; font-family:inherit; resize:none;"></textarea>
  <button class="oq-btn primary" id="btn-send">Send</button>
</div>
`;

const SCRIPT = `
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
document.getElementById('btn-send').onclick = sendMsg;
document.getElementById('btn-settings').onclick = () => vscode.postMessage({ type: 'openSettings' });
document.getElementById('btn-set-key').onclick = () => vscode.postMessage({ type: 'setApiKey' });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });

function sendMsg() {
  const text = input.value.trim();
  if (!text) return;
  vscode.postMessage({ type: 'send', text });
  input.value = '';
}

function bubble(role, text) {
  const div = document.createElement('div');
  div.style.cssText = 'max-width:85%; padding:10px 14px; border-radius:12px; white-space:pre-wrap; line-height:1.5;' +
    (role === 'user'
      ? 'align-self:flex-end; background:var(--oq-accent-gradient); color:white;'
      : 'align-self:flex-start; background:var(--oq-card); border:1px solid var(--oq-border);');
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

let thinkingEl = null;
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'configured') document.getElementById('not-configured').style.display = msg.value ? 'none' : 'block';
  if (msg.type === 'userMessage') bubble('user', msg.text);
  if (msg.type === 'assistantMessage') { removeThinking(); bubble('assistant', msg.text); }
  if (msg.type === 'assistantError') { removeThinking(); bubble('assistant', '⚠ ' + msg.text); }
  if (msg.type === 'thinking') {
    if (msg.value) { thinkingEl = document.createElement('div'); thinkingEl.textContent = 'OPCA is thinking…'; thinkingEl.style.cssText = 'align-self:flex-start; color:var(--oq-text-muted); font-style:italic; padding:4px 14px;'; messagesEl.appendChild(thinkingEl); messagesEl.scrollTop = messagesEl.scrollHeight; }
    else removeThinking();
  }
});
function removeThinking() { if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; } }

if (messagesEl.children.length === 0) bubble('assistant', "Hi, I'm OPCA — OptiQra's coding agent. Ask me about any SEO, GEO, AEO, accessibility, or security finding, or tell me what to fix, and I'll ground my answer in OptiQra's own audit-rule wiki and your open file.");
`;
