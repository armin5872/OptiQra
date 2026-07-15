"use client";

import { useEffect, useState } from "react";
import {
	getAllRules,
	saveRule,
	deleteRule,
	EXAMPLE_RULE_CODE,
	type CustomRule,
} from "@/lib/customRulesStore";
import { runCustomRule, type CustomRuleFinding } from "@/lib/customCode";
import { getRecentScans } from "@/lib/scanStore";
import { buildRuleContributeUrl } from "@/lib/githubContribute";

type RunState =
	| { status: "idle" }
	| { status: "ok"; findings: CustomRuleFinding[]; scanUrl: string }
	| { status: "error"; error: string }
	| { status: "no-scan" };

export default function CustomRulesPanel() {
	const [rules, setRules] = useState<CustomRule[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [editingId, setEditingId] = useState<string | "new" | null>(null);
	const [draftName, setDraftName] = useState("");
	const [draftDesc, setDraftDesc] = useState("");
	const [draftCode, setDraftCode] = useState(EXAMPLE_RULE_CODE);
	const [runState, setRunState] = useState<Record<string, RunState>>({});

	const refresh = () => getAllRules().then(setRules);

	useEffect(() => {
		refresh().finally(() => setLoaded(true));
	}, []);

	// Auto-run all enabled rules against the latest scan whenever rules change
	useEffect(() => {
		if (!loaded) return;
		const runEnabledRules = async () => {
			const recent = await getRecentScans(1);
			const latest = recent[0];
			if (!latest) {
				setRunState({});
				return;
			}
			const newRunState: Record<string, RunState> = {};
			for (const rule of rules) {
				if (!rule.enabled) {
					newRunState[rule.id] = { status: "idle" };
					continue;
				}
				const result = runCustomRule(rule.code, latest.data);
				newRunState[rule.id] =
					result.ok ?
						{ status: "ok", findings: result.findings, scanUrl: latest.url }
					:	{ status: "error", error: result.error };
			}
			setRunState(newRunState);
		};
		runEnabledRules();
	}, [loaded, rules]);

	const startNew = () => {
		setEditingId("new");
		setDraftName("");
		setDraftDesc("");
		setDraftCode(EXAMPLE_RULE_CODE);
	};

	const startEdit = (rule: CustomRule) => {
		setEditingId(rule.id);
		setDraftName(rule.name);
		setDraftDesc(rule.description);
		setDraftCode(rule.code);
	};

	const cancelEdit = () => setEditingId(null);

	const submitDraft = async () => {
		if (!draftName.trim() || !draftCode.trim()) return;
		const existing = editingId !== "new" ? rules.find((r) => r.id === editingId) : undefined;
		await saveRule({
			id: existing?.id,
			name: draftName.trim(),
			description: draftDesc.trim(),
			code: draftCode,
			enabled: existing?.enabled ?? true,
		});
		setEditingId(null);
		refresh();
	};

	const handleDelete = async (id: string) => {
		await deleteRule(id);
		refresh();
	};

	const handleToggle = async (rule: CustomRule) => {
		const updated = { ...rule, enabled: !rule.enabled };
		await saveRule(updated);
		refresh();
	};

	const handlePropose = (rule: CustomRule) => {
		const url = buildRuleContributeUrl({
			name: rule.name,
			description: rule.description,
			code: rule.code,
		});
		window.open(url, "_blank", "noopener,noreferrer");
	};

	if (!loaded) return null;

	return (
		<>
			<p className="settings-section-desc">
				Write a small JS rule that post-processes your last scan&apos;s results and surfaces
				extra findings — right here, in this browser. <strong>Enabled rules run automatically</strong>{" "}
				against your latest scan. This can&apos;t reach the actual crawler/analyzer running on
				the server (that would mean letting any visitor run code on the server, which
				isn&apos;t safe to offer anyone), so rules work on scan data you already have. Happy
				with a rule? Use <strong>&quot;Propose to upstream repo&quot;</strong> to draft a
				real pull request for it via your own GitHub account — no tokens involved, the repo
				owner reviews and merges it like any other contribution.
			</p>

			<div className="settings-group">
				<div className="settings-danger-row">
					<div className="settings-row-label">
						<strong>Your rules</strong>
						<span>{rules.length === 0 ? "None yet" : `${rules.length} saved`}</span>
					</div>
					<button type="button" className="settings-btn-outline" onClick={startNew}>
						+ New rule
					</button>
				</div>

				{rules.map((rule) => {
					const state = runState[rule.id] ?? { status: "idle" as const };
					return (
						<div key={rule.id} className="settings-group" style={{ marginTop: 8 }}>
							<div className="settings-row">
								<div className="settings-row-label">
									<strong>{rule.name}</strong>
									<span>
										{rule.description || "No description"}
										{rule.enabled ? " · Enabled (auto-running)" : " · Disabled"}
									</span>
								</div>
								<div className="settings-row-control" style={{ gap: 6, flexWrap: "wrap" }}>
									<button
										type="button"
										className="settings-btn-outline"
										onClick={() => handleToggle(rule)}
									>
										{rule.enabled ? "Disable" : "Enable"}
									</button>
									<button
										type="button"
										className="settings-btn-outline"
										onClick={() => startEdit(rule)}
									>
										Edit
									</button>
									<button
										type="button"
										className="settings-btn-outline"
										onClick={() => handlePropose(rule)}
									>
										Propose to upstream repo
									</button>
									<button
										type="button"
										className="settings-btn-danger"
										onClick={() => handleDelete(rule.id)}
									>
										Delete
									</button>
								</div>
							</div>

							{state.status === "no-scan" && (
								<p className="settings-section-desc">
									Run a scan first — this rule needs a finished report to check.
								</p>
							)}
							{state.status === "error" && (
								<p className="settings-section-desc" style={{ color: "var(--critical)" }}>
									Error: {state.error}
								</p>
							)}
							{state.status === "ok" && (
								<div className="settings-section-desc">
									{state.findings.length === 0 ?
										`No findings against ${state.scanUrl}.`
									:	<>
											{state.findings.length} finding{state.findings.length === 1 ? "" : "s"} against{" "}
											{state.scanUrl}:
											<ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
												{state.findings.map((f, i) => (
													<li key={i}>
														<strong>{f.title}</strong>
														{f.detail ? ` — ${f.detail}` : ""}
													</li>
												))}
											</ul>
										</>
									}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{editingId !== null && (
				<div className="settings-group">
					<div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
						<div className="settings-row-label">
							<strong>{editingId === "new" ? "New rule" : "Edit rule"}</strong>
						</div>
						<input
							type="text"
							placeholder="Rule name"
							value={draftName}
							onChange={(e) => setDraftName(e.target.value)}
							className="settings-text-input"
						/>
						<input
							type="text"
							placeholder="Short description (optional)"
							value={draftDesc}
							onChange={(e) => setDraftDesc(e.target.value)}
							className="settings-text-input"
						/>
						<textarea
							value={draftCode}
							onChange={(e) => setDraftCode(e.target.value)}
							className="settings-code-textarea"
							spellCheck={false}
							rows={12}
						/>
						<div className="settings-row-control" style={{ marginTop: 8 }}>
							<button type="button" className="settings-btn-outline" onClick={cancelEdit}>
								Cancel
							</button>
							<button type="button" className="settings-btn-primary" onClick={submitDraft}>
								Save rule
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
