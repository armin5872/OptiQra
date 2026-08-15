import * as vscode from "vscode";
import { OPTIQRA_DIAGNOSTIC_SOURCE } from "./diagnosticsManager";

export class OptiQraCodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		ctx: vscode.CodeActionContext,
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];
		const relevant = ctx.diagnostics.filter((d) => d.source === OPTIQRA_DIAGNOSTIC_SOURCE);
		if (relevant.length === 0) return actions;

		const fixThis = new vscode.CodeAction("OptiQra: Fix this issue", vscode.CodeActionKind.QuickFix);
		fixThis.command = { command: "optiqra.fixIssueAtCursor", title: "OptiQra: Fix this issue", arguments: [document.uri, range] };
		fixThis.diagnostics = relevant;
		fixThis.isPreferred = true;
		actions.push(fixThis);

		const fixFile = new vscode.CodeAction("OptiQra: Fix all issues in this file", vscode.CodeActionKind.QuickFix);
		fixFile.command = { command: "optiqra.fixCurrentFile", title: "OptiQra: Fix all issues in this file", arguments: [document.uri] };
		fixFile.diagnostics = relevant;
		actions.push(fixFile);

		const askOpca = new vscode.CodeAction("Ask OPCA about this issue", vscode.CodeActionKind.QuickFix);
		askOpca.command = { command: "optiqra.askOpcaAboutIssue", title: "Ask OPCA about this issue", arguments: [document.uri, relevant[0]] };
		actions.push(askOpca);

		return actions;
	}
}

export class OptiQraHoverProvider implements vscode.HoverProvider {
	provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
		const diagnostics = vscode.languages.getDiagnostics(document.uri).filter((d) => d.source === OPTIQRA_DIAGNOSTIC_SOURCE && d.range.contains(position));
		if (diagnostics.length === 0) return undefined;
		const md = new vscode.MarkdownString();
		md.isTrusted = true;
		for (const d of diagnostics) {
			const category = (d as any).optiqraCategory ?? "OptiQra";
			md.appendMarkdown(`**OptiQra · ${category}**\n\n${d.message}\n\n`);
			md.appendMarkdown(`[Fix this issue](command:optiqra.fixIssueAtCursor?${encodeURIComponent(JSON.stringify([document.uri.toString(), { line: position.line, character: position.character }]))}) · [Ask OPCA](command:optiqra.askOpcaAboutIssue)\n\n---\n\n`);
		}
		return new vscode.Hover(md);
	}
}
