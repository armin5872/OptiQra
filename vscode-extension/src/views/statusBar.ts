import * as vscode from "vscode";

export class OptiQraStatusBar {
	private item: vscode.StatusBarItem;

	constructor() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.item.command = "optiqra.openDashboard";
		this.item.text = "$(rocket) OptiQra";
		this.item.tooltip = "Open OptiQra Dashboard";
		this.item.show();
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

	dispose() {
		this.item.dispose();
	}
}
