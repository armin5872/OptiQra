import * as vscode from "vscode";
import { marked } from "marked";
import { getNonce, webviewHtml } from "./webviewBase";
import { isAiConfigured } from "../fix/opcaClient";
import { runOpcaAgent, type OpcaHistoryItem } from "../agent/opcaAgent";
import { AGENT_DEFAULT_MODEL } from "../agent/modelDefaults";
import { getApiKey, getSettings } from "../settings";
import type { AIProviderId } from "../../../src/lib/aiFix";

export class ChatPanel {
	public static current: ChatPanel | undefined;
	/** Set by extension.ts so OPCA's live tool activity also reaches the
	 *  status bar, not just this panel's own webview — visible even when
	 *  chat isn't the focused view, mirroring Copilot's outside-the-chat
	 *  "working" indicator. */
	public static onAgentActivity: ((label: string | undefined) => void) | undefined;
	private readonly panel: vscode.WebviewPanel;
	private history: OpcaHistoryItem[] = [];
	private busy = false;

	static createOrShow(context: vscode.ExtensionContext) {
		if (ChatPanel.current) {
			ChatPanel.current.panel.reveal();
			return ChatPanel.current;
		}
		const panel = vscode.window.createWebviewPanel("optiqraChat", "OPCA — OptiQra Coding Agent", vscode.ViewColumn.Beside, {
			enableScripts: true,
			retainContextWhenHidden: true,
		});
		panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "icon.png");
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
		const settings = getSettings();
		this.panel.webview.postMessage({ type: "configured", value: configured, provider: settings.ai.provider });
	}

	private async handleMessage(msg: any) {
		if (msg.type === "send") await this.send(msg.text);
		if (msg.type === "openSettings") vscode.commands.executeCommand("optiqra.openSettings");
		if (msg.type === "setApiKey") {
			await vscode.commands.executeCommand("optiqra.setApiKey");
			await this.checkConfigured();
		}
		if (msg.type === "openFile") {
			try {
				const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, msg.path);
				const doc = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
			} catch {
				/* file may not exist / no workspace — ignore, chat is still usable */
			}
		}
	}

	private async send(text: string) {
		if (this.busy) return;
		this.busy = true;
		this.history.push({ role: "user", content: text });
		this.panel.webview.postMessage({ type: "userMessage", text });
		this.panel.webview.postMessage({ type: "thinking", value: true });

		const settings = getSettings();
		if (settings.ai.provider === "none") {
			this.panel.webview.postMessage({ type: "assistantError", text: "No AI provider configured. Set one in Settings → OptiQra → AI, then set an API key." });
			this.panel.webview.postMessage({ type: "thinking", value: false });
			this.busy = false;
			return;
		}
		const apiKey = await getApiKey(this.context);
		if (!apiKey) {
			this.panel.webview.postMessage({ type: "assistantError", text: "No API key stored. Run 'OptiQra: Set AI API Key' first." });
			this.panel.webview.postMessage({ type: "thinking", value: false });
			this.busy = false;
			return;
		}

		const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === "file");
		const activeFileContext = editor
			? {
					path: vscode.workspace.asRelativePath(editor.document.uri, false),
					language: editor.document.languageId,
					excerpt: editor.document.getText().slice(0, 4000),
			  }
			: undefined;

		try {
			const provider = settings.ai.provider as AIProviderId;
			const model = settings.ai.model || AGENT_DEFAULT_MODEL[provider];
			const reply = await runOpcaAgent({
				extContext: this.context,
				provider,
				apiKey,
				model,
				useWikiContext: settings.opca.useWikiContext,
				history: this.history,
				activeFile: activeFileContext,
				onEvent: (event) => {
					if (event.type === "activity") {
						this.panel.webview.postMessage({ type: "activity", text: event.text });
						ChatPanel.onAgentActivity?.(event.text);
					}
				},
			});
			this.history.push({ role: "assistant", content: reply });
			const html = await marked.parse(reply, { async: false, breaks: true } as any);
			this.panel.webview.postMessage({ type: "assistantMessage", html });
		} catch (err: any) {
			this.panel.webview.postMessage({ type: "assistantError", text: String(err?.message ?? err) });
		} finally {
			this.panel.webview.postMessage({ type: "thinking", value: false });
			ChatPanel.onAgentActivity?.(undefined);
			this.busy = false;
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
			styleUri: undefined,
		})
			.replace("</head>", `<style nonce="${nonce}">${CHAT_STYLES}</style></head>`)
			.replace("</body>", `<script nonce="${nonce}">${SCRIPT}</script></body>`);
	}
}

const CHAT_STYLES = `
@keyframes oq-fade-in { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform: translateY(0); } }
@keyframes oq-pulse { 0%,100% { opacity:.5; } 50% { opacity:1; } }
.oq-msg { animation: oq-fade-in .18s ease; }
.oq-activity { animation: oq-fade-in .15s ease; }
.oq-activity .oq-dot-pulse { animation: oq-pulse 1.1s ease-in-out infinite; }
.oq-msg.assistant :first-child { margin-top:0; }
.oq-msg.assistant :last-child { margin-bottom:0; }
.oq-msg.assistant pre { margin:8px 0; }
.oq-msg.assistant code { font-size:12px; }
.oq-msg.assistant a { text-decoration:underline; }
.oq-chip {
  display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:999px;
  background:var(--oq-card); border:1px solid var(--oq-border); color:var(--oq-text-muted);
  font-size:12px; cursor:pointer; transition:all .15s ease; white-space:nowrap;
}
.oq-chip:hover { border-color:var(--oq-accent-1); color:var(--oq-text); background:var(--oq-card-hover); }
#input:focus { outline:none; border-color:var(--oq-accent-1) !important; box-shadow:0 0 0 3px rgba(99,102,241,.15); }
#btn-send:disabled { opacity:.5; cursor:not-allowed; }
.oq-logo .dot { animation: none; }
.oq-logo.thinking .dot { animation: oq-pulse 1.2s ease-in-out infinite; }
`;

const BODY = `
<div class="oq-header">
  <div class="oq-logo" id="logo"><span class="dot"></span> OPCA <span style="font-weight:400;color:var(--oq-text-muted);font-size:12px;">— OptiQra Coding Agent</span></div>
  <button class="oq-btn" id="btn-settings">⚙ AI Settings</button>
</div>
<div id="not-configured" style="display:none; padding:14px 16px; border-bottom:1px solid var(--oq-border); background:rgba(250,204,21,.08); font-size:12px; align-items:center; justify-content:space-between; gap:12px;">
  <span>No AI provider configured — OPCA needs a BYOK key to run as an agent (read your issues, propose and apply fixes).</span>
  <button class="oq-btn primary" id="btn-set-key" style="flex-shrink:0;">Set API Key</button>
</div>
<div id="messages" style="padding:16px; display:flex; flex-direction:column; gap:14px; height:calc(100vh - 168px); overflow:auto;"></div>
<div id="chips" style="padding:0 16px 10px; display:flex; gap:8px; flex-wrap:wrap;"></div>
<div style="position:sticky; bottom:0; padding:12px 16px; border-top:1px solid var(--oq-border); background:var(--oq-bg-elevated); display:flex; gap:8px;">
  <textarea id="input" rows="2" placeholder="Ask OPCA to explain, find, or fix something — e.g. 'scan the project and fix the top 3 SEO issues'…" style="flex:1; background:var(--oq-card); color:var(--oq-text); border:1px solid var(--oq-border); border-radius:var(--oq-radius); padding:10px; font-family:inherit; font-size:13px; resize:none; transition:border-color .15s ease;"></textarea>
  <button class="oq-btn primary" id="btn-send">Send</button>
</div>
`;

const SCRIPT = `
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const chipsEl = document.getElementById('chips');
const sendBtn = document.getElementById('btn-send');
const logo = document.getElementById('logo');
sendBtn.onclick = sendMsg;
document.getElementById('btn-settings').onclick = () => vscode.postMessage({ type: 'openSettings' });
document.getElementById('btn-set-key').onclick = () => vscode.postMessage({ type: 'setApiKey' });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });

const SUGGESTIONS = [
  { icon: '🩺', label: 'Scan & summarize', text: 'Run a full scan and summarize the biggest problems, ranked by impact.' },
  { icon: '🛠️', label: 'Fix top issues', text: 'Find the 3 highest-severity issues in the project and fix them for me.' },
  { icon: '🗺️', label: 'Site structure', text: 'What does my crawl graph look like — any orphan pages or weak spots?' },
  { icon: '📚', label: 'Explain a rule', text: 'What does OptiQra check for AEO (answer-engine optimization) and why does it matter?' },
];
function renderChips() {
  chipsEl.innerHTML = SUGGESTIONS.map((s, i) => '<div class="oq-chip" data-i="' + i + '">' + s.icon + ' ' + s.label + '</div>').join('');
  chipsEl.querySelectorAll('.oq-chip').forEach((el) => {
    el.addEventListener('click', () => {
      const s = SUGGESTIONS[Number(el.getAttribute('data-i'))];
      input.value = s.text;
      sendMsg();
    });
  });
}
renderChips();

function sendMsg() {
  const text = input.value.trim();
  if (!text) return;
  vscode.postMessage({ type: 'send', text });
  input.value = '';
  chipsEl.style.display = 'none';
}

function bubble(role, contentHtml) {
  const wrap = document.createElement('div');
  wrap.className = 'oq-msg ' + role;
  wrap.style.cssText = 'max-width:88%; padding:10px 14px; border-radius:12px; line-height:1.55;' +
    (role === 'user'
      ? 'align-self:flex-end; background:var(--oq-accent-gradient); color:white; white-space:pre-wrap;'
      : 'align-self:flex-start; background:var(--oq-card); border:1px solid var(--oq-border);');
  if (role === 'user') wrap.textContent = contentHtml;
  else wrap.innerHTML = contentHtml;
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}

function errorBubble(text) {
  const wrap = document.createElement('div');
  wrap.className = 'oq-msg assistant';
  wrap.style.cssText = 'align-self:flex-start; max-width:88%; padding:10px 14px; border-radius:12px; border:1px solid var(--oq-critical); background:rgba(244,63,94,.08); color:var(--oq-text);';
  wrap.textContent = '⚠ ' + text;
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

let activityGroup = null;
function pushActivity(text) {
  if (!activityGroup) {
    activityGroup = document.createElement('div');
    activityGroup.className = 'oq-activity';
    activityGroup.style.cssText = 'align-self:flex-start; display:flex; flex-direction:column; gap:4px; max-width:88%;';
    messagesEl.appendChild(activityGroup);
  }
  const row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:11.5px; color:var(--oq-text-muted); padding:2px 4px;';
  row.innerHTML = '<span class="oq-dot-pulse" style="width:6px;height:6px;border-radius:50%;background:var(--oq-accent-1);flex-shrink:0;"></span><span>' + escapeHtml(text) + '</span>';
  activityGroup.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function clearActivityGroup() { activityGroup = null; }
function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'configured') {
    document.getElementById('not-configured').style.display = msg.value ? 'none' : 'flex';
  }
  if (msg.type === 'userMessage') { bubble('user', msg.text); clearActivityGroup(); }
  if (msg.type === 'activity') pushActivity(msg.text);
  if (msg.type === 'assistantMessage') { clearActivityGroup(); bubble('assistant', msg.html); wireFileLinks(); }
  if (msg.type === 'assistantError') { clearActivityGroup(); errorBubble(msg.text); }
  if (msg.type === 'thinking') {
    sendBtn.disabled = !!msg.value;
    logo.classList.toggle('thinking', !!msg.value);
  }
});

function wireFileLinks() {
  messagesEl.querySelectorAll('a[data-oqfile]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      vscode.postMessage({ type: 'openFile', path: a.getAttribute('data-oqfile') });
    });
  });
}

if (messagesEl.children.length === 0) {
  bubble('assistant', "Hi, I'm OPCA — OptiQra's coding agent. I can actually look at your project: run a scan, list real issues, read files, and propose or apply fixes — not just talk about them. Try one of the suggestions below, or ask me anything.");
}
`;
