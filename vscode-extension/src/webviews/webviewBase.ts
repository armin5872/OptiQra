import * as vscode from "vscode";

export function getNonce(): string {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
	return text;
}

/** Shared design system for every OptiQra webview — dark, high-contrast,
 *  gradient-accented, matching the web/Tauri app's visual language. */
export const BASE_STYLES = `
:root {
  --oq-bg: #0b0e14;
  --oq-bg-elevated: #11151d;
  --oq-card: #151a24;
  --oq-card-hover: #1a2030;
  --oq-border: #232a3a;
  --oq-text: #e7eaf1;
  --oq-text-muted: #8b93a7;
  --oq-text-dim: #5c6478;
  --oq-accent-1: #6366f1;
  --oq-accent-2: #a855f7;
  --oq-accent-gradient: linear-gradient(135deg, var(--oq-accent-1), var(--oq-accent-2));
  --oq-critical: #f43f5e;
  --oq-high: #fb923c;
  --oq-medium: #facc15;
  --oq-low: #38bdf8;
  --oq-good: #34d399;
  --oq-info: #8b93a7;
  --oq-radius: 10px;
  --oq-radius-lg: 16px;
  --oq-font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  font-family: var(--oq-font);
  background: var(--oq-bg);
  color: var(--oq-text);
  margin: 0;
  padding: 0;
  font-size: 13px;
  line-height: 1.5;
}
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--oq-border); border-radius: 6px; }
::-webkit-scrollbar-track { background: transparent; }

.oq-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--oq-border);
  background: var(--oq-bg-elevated); position: sticky; top: 0; z-index: 10;
}
.oq-logo { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; }
.oq-logo .dot { width: 10px; height: 10px; border-radius: 3px; background: var(--oq-accent-gradient); }
.oq-btn {
  background: var(--oq-card); color: var(--oq-text); border: 1px solid var(--oq-border);
  border-radius: var(--oq-radius); padding: 6px 12px; font-size: 12px; cursor: pointer;
  transition: all .15s ease; font-family: inherit;
}
.oq-btn:hover { background: var(--oq-card-hover); border-color: var(--oq-accent-1); }
.oq-btn.primary { background: var(--oq-accent-gradient); border: none; color: white; font-weight: 600; }
.oq-btn.primary:hover { filter: brightness(1.1); }
.oq-btn.danger { border-color: var(--oq-critical); color: var(--oq-critical); }
.oq-btn:disabled { opacity: .5; cursor: not-allowed; }

.oq-card {
  background: var(--oq-card); border: 1px solid var(--oq-border); border-radius: var(--oq-radius-lg);
  padding: 16px;
}
.oq-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
}
.oq-badge.critical { background: rgba(244,63,94,.15); color: var(--oq-critical); }
.oq-badge.high { background: rgba(251,146,60,.15); color: var(--oq-high); }
.oq-badge.medium { background: rgba(250,204,21,.15); color: var(--oq-medium); }
.oq-badge.low { background: rgba(56,189,248,.15); color: var(--oq-low); }
.oq-badge.good { background: rgba(52,211,153,.15); color: var(--oq-good); }
.oq-badge.informational { background: rgba(139,147,167,.15); color: var(--oq-info); }

.oq-score-ring { position: relative; width: 72px; height: 72px; }
.oq-score-ring svg { transform: rotate(-90deg); }
.oq-score-ring .num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; }

.oq-empty { text-align: center; padding: 60px 20px; color: var(--oq-text-muted); }
.oq-empty .big { font-size: 32px; margin-bottom: 8px; }

a { color: var(--oq-accent-1); }
code, pre { font-family: "SF Mono", Consolas, monospace; }
pre { background: var(--oq-bg-elevated); border: 1px solid var(--oq-border); border-radius: var(--oq-radius); padding: 12px; overflow: auto; }
`;

export function webviewHtml(opts: {
	title: string;
	bodyHtml: string;
	scriptUri?: vscode.Uri;
	styleUri?: vscode.Uri;
	nonce: string;
	webview: vscode.Webview;
	extraCsp?: string;
}): string {
	const csp = [
		`default-src 'none'`,
		`img-src ${opts.webview.cspSource} https: data:`,
		`style-src ${opts.webview.cspSource} 'unsafe-inline'`,
		`font-src ${opts.webview.cspSource}`,
		`script-src 'nonce-${opts.nonce}'`,
		opts.extraCsp ?? "",
	].join("; ");
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title}</title>
<style nonce="${opts.nonce}">${BASE_STYLES}</style>
${opts.styleUri ? `<link rel="stylesheet" href="${opts.styleUri}">` : ""}
</head>
<body>
${opts.bodyHtml}
${opts.scriptUri ? `<script nonce="${opts.nonce}" src="${opts.scriptUri}"></script>` : ""}
</body>
</html>`;
}
