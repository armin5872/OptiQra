import * as vscode from "vscode";

export class OptiQraStatusBar {
	private item: vscode.StatusBarItem;
	private agentItem: vscode.StatusBarItem;
	private hideAgentTimer: NodeJS.Timeout | undefined;

	constructor() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.item.command = "optiqra.openDashboard";
		this.item.text = "$(rocket) OptiQra";
		this.item.tooltip = "Open OptiQra Dashboard";
		this.item.show();

		// A second, separate item for OPCA's live agent activity. Kept apart
		// from the score item so "OPCA is working on something" is visible
		// even if the person is looking at a totally different part of the
		// status bar — the same instinct behind Copilot's spinning icon
		// while it's generating.
		this.agentItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
		this.agentItem.command = "optiqra.openChat";
		this.agentItem.hide();
	}

	setScore(score: number | undefined, scanning = false) {
		if (scanning) {
			this.item.text = "$(sync~spin) OptiQra: scanning…";
			return;
		}
		if (score === undefined) {
			this.item.text = "$(rocket) OptiQra";
			return;
		}
		const icon = score >= 85 ? "$(check)" : score >= 60 ? "$(warning)" : "$(error)";
		this.item.text = `${icon} OptiQra ${score}/100`;
	}

	/** Called whenever OPCA's agent loop runs a tool, so activity is visible
	 *  outside the chat panel too. Auto-hides shortly after activity stops. */
	setAgentActivity(label: string | undefined) {
		if (this.hideAgentTimer) clearTimeout(this.hideAgentTimer);
		if (!label) {
			this.hideAgentTimer = setTimeout(() => this.agentItem.hide(), 1400);
			return;
		}
		this.agentItem.text = `$(sparkle) OPCA: ${label}`;
		this.agentItem.tooltip = "OPCA is working — click to open chat";
		this.agentItem.show();
	}

	dispose() {
		this.item.dispose();
		this.agentItem.dispose();
		if (this.hideAgentTimer) clearTimeout(this.hideAgentTimer);
	}
}
