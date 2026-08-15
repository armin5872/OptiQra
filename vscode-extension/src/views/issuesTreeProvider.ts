// Native "Problems"-style tree in the OptiQra activity bar container —
// grouped by file, then by severity, backed directly by the same
// diagnostics collection driving the editor squiggles.
import * as vscode from "vscode";
import { OPTIQRA_DIAGNOSTIC_SOURCE } from "../diagnostics/diagnosticsManager";

type Node = FileNode | IssueNode;

class FileNode extends vscode.TreeItem {
	constructor(public readonly uri: vscode.Uri, count: number) {
		super(vscode.workspace.asRelativePath(uri, false), vscode.TreeItemCollapsibleState.Collapsed);
		this.description = `${count} issue${count === 1 ? "" : "s"}`;
		this.iconPath = vscode.ThemeIcon.File;
		this.resourceUri = uri;
		this.contextValue = "optiqraFileNode";
	}
}

class IssueNode extends vscode.TreeItem {
	constructor(public readonly uri: vscode.Uri, public readonly diagnostic: vscode.Diagnostic) {
		super(diagnostic.message, vscode.TreeItemCollapsibleState.None);
		this.description = String((diagnostic as any).optiqraCategory ?? "");
		this.iconPath = new vscode.ThemeIcon(
			diagnostic.severity === vscode.DiagnosticSeverity.Error ? "error" : diagnostic.severity === vscode.DiagnosticSeverity.Warning ? "warning" : "info",
		);
		this.command = { command: "vscode.open", title: "Open", arguments: [uri, { selection: diagnostic.range }] };
		this.contextValue = "optiqraIssueNode";
	}
}

export class IssuesTreeProvider implements vscode.TreeDataProvider<Node> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(el: Node): vscode.TreeItem {
		return el;
	}

	getChildren(el?: Node): Node[] {
		if (!el) {
			const all = vscode.languages.getDiagnostics();
			const files: FileNode[] = [];
			for (const [uri, diags] of all) {
				const ours = diags.filter((d) => d.source === OPTIQRA_DIAGNOSTIC_SOURCE);
				if (ours.length > 0) files.push(new FileNode(uri, ours.length));
			}
			files.sort((a, b) => (a.label as string).localeCompare(b.label as string));
			return files;
		}
		if (el instanceof FileNode) {
			const diags = vscode.languages.getDiagnostics(el.uri).filter((d) => d.source === OPTIQRA_DIAGNOSTIC_SOURCE);
			return diags.map((d) => new IssueNode(el.uri, d));
		}
		return [];
	}
}
