import * as vscode from "vscode";
import type { OptiQraDiagnostics } from "./diagnosticsManager";
import { getSettings } from "../settings";

// CodeLens is the "the agent lives here" signal — an inline, always-visible
// line above the code itself, the same visual language Copilot/quick-fix
// tooling uses, rather than something the person has to go find in a
// separate panel. One lens per *group of adjacent findings on the same
// line* to avoid stacking near-duplicate lenses when a line trips more
// than one rule.
export class OptiQraCodeLensProvider implements vscode.CodeLensProvider {
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this.emitter.event;

	constructor(private diagnostics: OptiQraDiagnostics) {}

	refresh() {
		this.emitter.fire();
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!getSettings().diagnostics.showCodeLens) return [];
		const findings = this.diagnostics.getFindings(document.uri);
		if (findings.length === 0) return [];

		const byLine = new Map<number, typeof findings>();
		for (const f of findings) {
			const line = f.range.start.line;
			const arr = byLine.get(line) ?? [];
			arr.push(f);
			byLine.set(line, arr);
		}

		const lenses: vscode.CodeLens[] = [];
		for (const [line, group] of byLine) {
			const range = new vscode.Range(line, 0, line, 0);
			const worst = group.slice().sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
			const icon = worst.severity === "critical" || worst.severity === "high" ? "🤖" : "🤖";
			const label = group.length > 1 ? `${icon} Fix ${group.length} issues with OPCA` : `${icon} Fix with OPCA · ${truncate(worst.title, 42)}`;

			lenses.push(
				new vscode.CodeLens(range, {
					title: label,
					command: "optiqra.fixIssueAtCursor",
					arguments: [document.uri, range],
					tooltip: "Let OPCA fix this in place — you'll get a diff to approve first.",
				}),
			);
			lenses.push(
				new vscode.CodeLens(range, {
					title: "💬 Ask OPCA",
					command: "optiqra.askOpcaAboutIssue",
					arguments: [document.uri, undefined],
					tooltip: `Ask OPCA to explain: ${worst.title}`,
				}),
			);
		}
		return lenses;
	}
}

function severityRank(s: string): number {
	return { critical: 5, high: 4, medium: 3, low: 2, informational: 1, good: 0 }[s] ?? 0;
}
function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
