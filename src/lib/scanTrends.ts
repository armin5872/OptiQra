/**
 * Trend analysis and "predictive scan" support for scheduled scans.
 *
 * This is deliberately a pure, dependency-free module (no `idb`, no
 * `window`, no Node builtins) so the exact same logic can run from:
 *   - src/lib/scheduler.ts (browser tab / installed PWA)
 *   - server/scheduler-daemon.ts (desktop sidecar, background)
 * without duplicating the math in two places the way computeNextRun()
 * historically had to be (see the comment at the top of
 * scheduler-daemon.ts). Only computeScoreTrend/findChronicIssues/
 * suggestFrequency live here — callers still own fetching scan history
 * and persisting the result, since that part *does* differ (IndexedDB vs.
 * a file store).
 */

// Deliberately NOT importing ScanFrequency from scheduleStore.ts — that
// file also pulls in `idb` at module scope, and the whole point of this
// module is to be safely importable from both the browser bundle and the
// Node/pkg server build (see scheduler-daemon.ts's own note about the same
// tradeoff for its Category type). Keep this list in sync with
// scheduleStore.ts's ScanFrequency if it ever changes.
export type ScanFrequency = "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

export type TrendPoint = { at: number; overallScore: number };

export type TrendDirection = "up" | "down" | "flat";

export interface ScoreTrend {
	direction: TrendDirection;
	/** Score points gained/lost per day, from a least-squares fit. */
	slopePerDay: number;
	/** Score projected 14 days out if the current trend holds, clamped 0–100.
	 *  This is a naive linear projection, not a real forecast model — it's
	 *  meant to prompt "worth a look," not to be taken as precise. */
	predicted14d: number;
	/** How many data points fed the fit — more points, more trust. */
	confidence: "low" | "medium" | "high";
	/** Standard deviation of score deltas between consecutive scans —
	 *  a rough proxy for "how much does this site's score bounce around." */
	volatility: number;
}

const FLAT_THRESHOLD_PER_DAY = 0.2; // ignore drift smaller than this

/**
 * Fits a line to (day offset, score) pairs and returns direction/slope/
 * a 14-day projection. Returns null when there isn't enough history yet
 * (fewer than 3 prior scans) — predicting off 1–2 points isn't a trend,
 * it's noise, so callers should just skip showing anything in that case.
 */
export function computeScoreTrend(history: TrendPoint[]): ScoreTrend | null {
	const points = [...history].sort((a, b) => a.at - b.at).slice(-8); // last 8 scans is plenty
	if (points.length < 3) return null;

	const t0 = points[0].at;
	const xs = points.map((p) => (p.at - t0) / (24 * 60 * 60 * 1000)); // days since first point
	const ys = points.map((p) => p.overallScore);

	const n = xs.length;
	const xMean = xs.reduce((a, b) => a + b, 0) / n;
	const yMean = ys.reduce((a, b) => a + b, 0) / n;

	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i++) {
		num += (xs[i] - xMean) * (ys[i] - yMean);
		den += (xs[i] - xMean) ** 2;
	}
	// All scans landed on the same timestamp (den === 0) — can't fit a
	// slope through a single point in time, so treat as flat/no-op rather
	// than dividing by zero.
	const slopePerDay = den === 0 ? 0 : num / den;

	const deltas: number[] = [];
	for (let i = 1; i < n; i++) deltas.push(ys[i] - ys[i - 1]);
	const deltaMean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
	const variance = deltas.reduce((a, d) => a + (d - deltaMean) ** 2, 0) / deltas.length;
	const volatility = Math.sqrt(variance);

	const lastScore = ys[n - 1];
	const predicted14d = Math.max(0, Math.min(100, Math.round(lastScore + slopePerDay * 14)));

	const direction: TrendDirection =
		slopePerDay > FLAT_THRESHOLD_PER_DAY ? "up" : slopePerDay < -FLAT_THRESHOLD_PER_DAY ? "down" : "flat";

	const confidence: ScoreTrend["confidence"] = n >= 8 ? "high" : n >= 5 ? "medium" : "low";

	return { direction, slopePerDay, predicted14d, confidence, volatility };
}

/** Minimal shape needed from a stored scan report to check for recurring
 *  issues — matches the Category shape both schedulers already carry a
 *  copy of (reportAggregate.ts's real Category satisfies this too). */
export interface TrendCategory {
	issues: { id: string; title: string; severity: string }[];
}

export interface ChronicIssue {
	id: string;
	title: string;
	severity: string;
	/** How many scans in a row (most recent first) this issue has shown up
	 *  unresolved. */
	streak: number;
}

/**
 * Finds issues that keep showing up scan after scan instead of getting
 * fixed — these are usually more worth surfacing than "N new issues this
 * run," since a single recurring issue silently sitting at medium severity
 * for two months is easy to miss in a per-run diff.
 *
 * @param reportsNewestFirst Full category maps from the most recent scans,
 *   ordered newest → oldest (typically minStreak+2 or so entries).
 */
export function findChronicIssues(
	reportsNewestFirst: Record<string, TrendCategory>[],
	minStreak = 3,
): ChronicIssue[] {
	if (reportsNewestFirst.length < minStreak) return [];

	const latest = reportsNewestFirst[0];
	const latestIssues = new Map<string, { title: string; severity: string }>();
	for (const cat of Object.values(latest)) {
		for (const issue of cat.issues) latestIssues.set(issue.id, { title: issue.title, severity: issue.severity });
	}

	const chronic: ChronicIssue[] = [];
	for (const [id, meta] of latestIssues) {
		let streak = 0;
		for (const report of reportsNewestFirst) {
			const present = Object.values(report).some((cat) => cat.issues.some((i) => i.id === id));
			if (!present) break;
			streak++;
		}
		if (streak >= minStreak) chronic.push({ id, streak, ...meta });
	}

	return chronic.sort((a, b) => b.streak - a.streak);
}

const FREQUENCY_ORDER: ScanFrequency[] = ["hourly", "daily", "weekly", "monthly", "yearly"];

/**
 * Suggests a faster or slower cadence based on how much a site's score
 * has actually been moving — the point being that a schedule created once
 * shouldn't necessarily keep the same frequency forever. This never
 * changes anything on its own; callers surface it as a one-tap suggestion
 * the person applies (or ignores) explicitly.
 */
export function suggestFrequency(
	current: ScanFrequency,
	trend: ScoreTrend | null,
	current_frequency_idx = FREQUENCY_ORDER.indexOf(current),
): { suggestion: ScanFrequency; reason: string } | null {
	if (!trend || current_frequency_idx === -1) return null;

	const idx = current_frequency_idx;
	const volatile = trend.volatility >= 8 || trend.direction !== "flat";
	const veryStable = trend.volatility < 2 && trend.direction === "flat";

	if (volatile && idx > 0) {
		return {
			suggestion: FREQUENCY_ORDER[idx - 1],
			reason:
				trend.direction === "flat"
					? "This site's score has been bouncing around between scans — checking more often would catch swings sooner."
					: `Score has been trending ${trend.direction} — checking more often would catch this earlier.`,
		};
	}
	if (veryStable && idx < FREQUENCY_ORDER.length - 1 && idx >= 2) {
		// Only offer to slow down from weekly-or-slower — don't suggest
		// stretching an hourly check straight out to monthly in one jump.
		return {
			suggestion: FREQUENCY_ORDER[idx + 1],
			reason: "This site's score has been flat for a while — you could check less often without missing much.",
		};
	}
	return null;
}
