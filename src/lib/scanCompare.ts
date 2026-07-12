/**
 * Diffs two /api/analyze report payloads (as stored by scanStore.ts) so a
 * scheduled re-scan can tell the user what actually changed since last
 * time, instead of just "here's a new score".
 */

type Issue = {
	id: string;
	title: string;
	severity: "critical" | "high" | "medium" | "low" | "informational" | "good";
	weight: number;
};

type Category = {
	label: string;
	score: number;
	issues: Issue[];
};

type ReportLike = {
	url: string;
	categories: Record<string, Category>;
};

export type CategoryDelta = {
	key: string;
	label: string;
	previousScore: number;
	currentScore: number;
	delta: number;
};

export type IssueChange = {
	id: string;
	title: string;
	category: string;
	severity: Issue["severity"];
};

export type ScanComparison = {
	previousOverall: number;
	currentOverall: number;
	overallDelta: number;
	categories: CategoryDelta[];
	newIssues: IssueChange[];
	resolvedIssues: IssueChange[];
	unchanged: boolean;
};

function overallFromCategories(categories: Record<string, Category>): number {
	const keys = Object.keys(categories);
	if (!keys.length) return 0;
	const sum = keys.reduce((a, k) => a + categories[k].score, 0);
	return Math.round(sum / keys.length);
}

/** Compares `current` against `previous` (both full report payloads for the
 * same URL/mode). Safe to call even if the report shapes drifted slightly
 * between app versions — anything missing is just treated as "no data". */
export function compareScans(
	previous: ReportLike,
	current: ReportLike,
): ScanComparison {
	const previousOverall = overallFromCategories(previous.categories ?? {});
	const currentOverall = overallFromCategories(current.categories ?? {});

	const categoryKeys = new Set([
		...Object.keys(previous.categories ?? {}),
		...Object.keys(current.categories ?? {}),
	]);

	const categories: CategoryDelta[] = [];
	const newIssues: IssueChange[] = [];
	const resolvedIssues: IssueChange[] = [];

	for (const key of categoryKeys) {
		const prevCat = previous.categories?.[key];
		const curCat = current.categories?.[key];
		const prevScore = prevCat?.score ?? 0;
		const curScore = curCat?.score ?? 0;

		categories.push({
			key,
			label: curCat?.label ?? prevCat?.label ?? key,
			previousScore: prevScore,
			currentScore: curScore,
			delta: curScore - prevScore,
		});

		const prevIssueIds = new Set((prevCat?.issues ?? []).map((i) => i.id));
		const curIssueIds = new Set((curCat?.issues ?? []).map((i) => i.id));

		for (const issue of curCat?.issues ?? []) {
			if (!prevIssueIds.has(issue.id)) {
				newIssues.push({
					id: issue.id,
					title: issue.title,
					category: curCat?.label ?? key,
					severity: issue.severity,
				});
			}
		}
		for (const issue of prevCat?.issues ?? []) {
			if (!curIssueIds.has(issue.id)) {
				resolvedIssues.push({
					id: issue.id,
					title: issue.title,
					category: prevCat?.label ?? key,
					severity: issue.severity,
				});
			}
		}
	}

	categories.sort((a, b) => a.label.localeCompare(b.label));

	return {
		previousOverall,
		currentOverall,
		overallDelta: currentOverall - previousOverall,
		categories,
		newIssues,
		resolvedIssues,
		unchanged:
			currentOverall === previousOverall &&
			newIssues.length === 0 &&
			resolvedIssues.length === 0,
	};
}

/** One-line human summary, used in notifications and the schedule list. */
export function summarizeComparison(cmp: ScanComparison): string {
	if (cmp.unchanged) return "No change since the last scan.";
	const parts: string[] = [];
	if (cmp.overallDelta !== 0) {
		parts.push(
			`score ${cmp.overallDelta > 0 ? "+" : ""}${cmp.overallDelta} (now ${cmp.currentOverall})`,
		);
	}
	if (cmp.newIssues.length) {
		parts.push(`${cmp.newIssues.length} new issue${cmp.newIssues.length === 1 ? "" : "s"}`);
	}
	if (cmp.resolvedIssues.length) {
		parts.push(
			`${cmp.resolvedIssues.length} resolved`,
		);
	}
	return parts.join(", ") || "No change since the last scan.";
}
