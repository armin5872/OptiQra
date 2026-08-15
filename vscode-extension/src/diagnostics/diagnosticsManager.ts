import * as vscode from "vscode";
import { scanTextForFindings, type LiveFinding } from "./liveScanner";
import { getSettings } from "../settings";

export const OPTIQRA_DIAGNOSTIC_SOURCE = "OptiQra";

const SEVERITY_TO_VSCODE: Record<LiveFinding["severity"], vscode.DiagnosticSeverity> = {
	critical: vscode.DiagnosticSeverity.Error,
	high: vscode.DiagnosticSeverity.Error,
	medium: vscode.DiagnosticSeverity.Warning,
	low: vscode.DiagnosticSeverity.Warning,
	informational: vscode.DiagnosticSeverity.Information,
	good: vscode.DiagnosticSeverity.Hint,
};

const SEVERITY_RANK: Record<LiveFinding["severity"], number> = {
	critical: 5,
	high: 4,
	medium: 3,
	low: 2,
	informational: 1,
	good: 0,
};

export interface StoredFinding extends LiveFinding {
	range: vscode.Range;
}

export class OptiQraDiagnostics {
	private collection: vscode.DiagnosticCollection;
	private findingsByDoc = new Map<string, StoredFinding[]>();

	constructor() {
		this.collection = vscode.languages.createDiagnosticCollection("optiqra");
	}

	dispose() {
		this.collection.dispose();
	}

	getFindings(uri: vscode.Uri): StoredFinding[] {
		return this.findingsByDoc.get(uri.toString()) ?? [];
	}

	clear(uri: vscode.Uri) {
		this.collection.delete(uri);
		this.findingsByDoc.delete(uri.toString());
	}

	update(document: vscode.TextDocument) {
		const settings = getSettings();
		if (!settings.diagnostics.enabled) {
			this.clear(document.uri);
			return;
		}
		const relPath = vscode.workspace.asRelativePath(document.uri, false);
		const text = document.getText();
		let findings = scanTextForFindings(relPath, text);

		const minRank = SEVERITY_RANK[settings.diagnostics.minSeverity];
		findings = findings.filter((f) => SEVERITY_RANK[f.severity] >= minRank);

		const stored: StoredFinding[] = findings.map((f) => ({
			...f,
			range: new vscode.Range(document.positionAt(f.start), document.positionAt(f.end)),
		}));
		this.findingsByDoc.set(document.uri.toString(), stored);

		const diagnostics = stored.map((f) => this.toDiagnostic(f, settings.diagnostics.severityMap));
		this.collection.set(document.uri, diagnostics);
	}

	private toDiagnostic(f: StoredFinding, map: string): vscode.Diagnostic {
		let severity = SEVERITY_TO_VSCODE[f.severity];
		if (map === "all-warning") severity = vscode.DiagnosticSeverity.Warning;
		if (map === "all-error") severity = vscode.DiagnosticSeverity.Error;

		const d = new vscode.Diagnostic(f.range, `${f.title} — ${f.detail}`, severity);
		d.source = OPTIQRA_DIAGNOSTIC_SOURCE;
		d.code = { value: f.ruleId, target: vscode.Uri.parse(`https://github.com/armin5872/OptiQra/wiki`) };
		(d as any).optiqraCategory = f.category;
		(d as any).optiqraQuickFix = f.quickFixAvailable;
		return d;
	}
}
