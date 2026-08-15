// A tiny static command-launcher tree in the sidebar — the native-VS-Code
// equivalent of the web app's left nav, so Dashboard/Crawl Tree/OPCA
// Chat/Wiki are always one click away without opening the command palette.
import * as vscode from "vscode";

class ActionItem extends vscode.TreeItem {
	constructor(label: string, icon: string, command: string, tooltip?: string) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.iconPath = new vscode.ThemeIcon(icon);
		this.command = { command, title: label };
		this.tooltip = tooltip;
	}
}

const ITEMS = [
	new ActionItem("Dashboard", "graph", "optiqra.openDashboard", "Score overview, categories, issue list"),
	new ActionItem("Crawl Tree (2D/3D)", "type-hierarchy-sub", "optiqra.openCrawlTree", "Visualize the internal link graph of your project"),
	new ActionItem("Ask OPCA", "comment-discussion", "optiqra.openChat", "Chat with OptiQra's coding agent"),
	new ActionItem("Wiki", "book", "optiqra.openWiki", "Offline audit-rule reference"),
	new ActionItem("Run Full Scan", "sync", "optiqra.runFullScan", "Re-scan the whole workspace"),
	new ActionItem("Fix Current File", "wrench", "optiqra.fixCurrentFile", "Fix issues in the active editor"),
	new ActionItem("Set AI API Key", "key", "optiqra.setApiKey", "Store a BYOK key for OPCA / auto-fix"),
	new ActionItem("Open Settings", "gear", "optiqra.openSettings", "OptiQra settings"),
	new ActionItem("★ Star on GitHub", "github", "optiqra.starOnGitHub", "Like OptiQra? Give us a star on GitHub"),
];

export class ActionsTreeProvider implements vscode.TreeDataProvider<ActionItem> {
	getTreeItem(el: ActionItem) {
		return el;
	}
	getChildren() {
		return ITEMS;
	}
}
