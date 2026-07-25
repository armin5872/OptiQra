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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
			<p className="mb-4 text-sm text-ink-soft">
				Write a small JS rule that post-processes your last scan&apos;s results and surfaces
				extra findings — right here, in this browser. <strong className="text-ink">Enabled rules run automatically</strong>{" "}
				against your latest scan. This can&apos;t reach the actual crawler/analyzer running on
				the server (that would mean letting any visitor run code on the server, which
				isn&apos;t safe to offer anyone), so rules work on scan data you already have. Happy
				with a rule? Use <strong className="text-ink">&quot;Propose to upstream repo&quot;</strong> to draft a
				real pull request for it via your own GitHub account — no tokens involved, the repo
				owner reviews and merges it like any other contribution.
			</p>

			<div className="rounded-(--radius) border border-line bg-card px-4">
				<div className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<strong className="text-sm font-semibold text-critical">Your rules</strong>
						<span className="text-xs text-ink-soft">
							{rules.length === 0 ? "None yet" : `${rules.length} saved`}
						</span>
					</div>
					<Button type="button" variant="outline" size="sm" onClick={startNew}>
						+ New rule
					</Button>
				</div>
			</div>

			{rules.map((rule) => {
				const state = runState[rule.id] ?? { status: "idle" as const };
				return (
					<div key={rule.id} className="mt-2 rounded-(--radius) border border-line bg-card px-4 py-3.5">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="flex flex-col gap-0.5">
								<strong className="text-sm font-semibold text-ink">{rule.name}</strong>
								<span className="text-xs text-ink-soft">
									{rule.description || "No description"}
									{rule.enabled ? " · Enabled (auto-running)" : " · Disabled"}
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-1.5">
								<Button type="button" variant="outline" size="sm" onClick={() => handleToggle(rule)}>
									{rule.enabled ? "Disable" : "Enable"}
								</Button>
								<Button type="button" variant="outline" size="sm" onClick={() => startEdit(rule)}>
									Edit
								</Button>
								<Button type="button" variant="outline" size="sm" onClick={() => handlePropose(rule)}>
									Propose to upstream repo
								</Button>
								<Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(rule.id)}>
									Delete
								</Button>
							</div>
						</div>

						{state.status === "no-scan" && (
							<p className="mt-2 text-xs text-ink-soft">
								Run a scan first — this rule needs a finished report to check.
							</p>
						)}
						{state.status === "error" && (
							<p className="mt-2 text-xs text-critical">Error: {state.error}</p>
						)}
						{state.status === "ok" && (
							<div className="mt-2 text-xs text-ink-soft">
								{state.findings.length === 0 ?
									`No findings against ${state.scanUrl}.`
								:	<>
										{state.findings.length} finding{state.findings.length === 1 ? "" : "s"} against{" "}
										{state.scanUrl}:
										<ul className="mt-1.5 list-disc pl-4.5">
											{state.findings.map((f, i) => (
												<li key={i}>
													<strong className="text-ink">{f.title}</strong>
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

			{editingId !== null && (
				<div className="mt-4 flex flex-col gap-2.5 rounded-(--radius) border border-line bg-card px-4 py-3.5">
					<strong className="text-sm font-semibold text-ink">
						{editingId === "new" ? "New rule" : "Edit rule"}
					</strong>
					<Input
						type="text"
						placeholder="Rule name"
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
					/>
					<Input
						type="text"
						placeholder="Short description (optional)"
						value={draftDesc}
						onChange={(e) => setDraftDesc(e.target.value)}
					/>
					<Textarea
						value={draftCode}
						onChange={(e) => setDraftCode(e.target.value)}
						spellCheck={false}
						rows={12}
						className="font-(family-name:--font-mono) text-xs"
					/>
					<div className="flex items-center gap-2">
						<Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
							Cancel
						</Button>
						<Button type="button" variant="brand" size="sm" onClick={submitDraft}>
							Save rule
						</Button>
					</div>
				</div>
			)}
		</>
	);
}
