import type { Issue, Severity } from "@/lib/auditUtils";

function severityFromAuditScore(auditScore: number): Severity {
	if (auditScore < 0.2) return "critical";
	if (auditScore < 0.5) return "high";
	if (auditScore < 0.7) return "medium";
	return "low";
}

const PSI_ENDPOINT =
	"https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

type PSIReport = {
	score: number;
	issues: Issue[];
	passed: Issue[];
};

function cleanDescription(markdown: string) {
	if (!markdown) return "";
	return markdown
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
}

function mapCategory(lhr: any, categoryKey: string): PSIReport | null {
	const category = lhr.categories?.[categoryKey];
	if (!category) return null;

	const score = Math.round((category.score ?? 0) * 100);
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	for (const ref of category.auditRefs || []) {
		const audit = lhr.audits?.[ref.id];
		if (
			!audit ||
			audit.scoreDisplayMode === "informative" ||
			audit.scoreDisplayMode === "notApplicable" ||
			audit.scoreDisplayMode === "manual"
		)
			continue;

		const auditScore = audit.score;
		if (auditScore === null || auditScore === undefined) continue;

		if (auditScore < 0.9) {
			const weight = Math.round(
				(1 - auditScore) * (ref.weight ? Math.min(ref.weight, 12) + 4 : 10),
			);
			issues.push({
				id: ref.id,
				title: audit.title,
				detail: cleanDescription(audit.description),
				fix:
					audit.displayValue ?
						`Current: ${audit.displayValue}`
					:	"See details for the specific elements affected.",
				weight: Math.max(3, weight),
				severity: severityFromAuditScore(auditScore),
				resolved: false,
			});
		} else if (ref.weight > 0) {
			passed.push({
				id: ref.id,
				title: audit.title,
				detail: "",
				weight: 0,
				severity: "good",
				resolved: true,
			});
		}
	}

	issues.sort((a, b) => b.weight - a.weight);
	return { score, issues: issues.slice(0, 8), passed: passed.slice(0, 6) };
}

export async function runPageSpeed(targetUrl: string) {
	const apiKey = process.env.PSI_API_KEY;
	const params = new URLSearchParams({ url: targetUrl, strategy: "mobile" });
	["performance", "accessibility", "seo", "best-practices"].forEach((c) =>
		params.append("category", c),
	);
	if (apiKey) params.set("key", apiKey);

	// Cache PSI results heavily (1 hour) to protect quota
	const res = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
		signal: AbortSignal.timeout(25000),
		next: { revalidate: 3600 },
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(
			`PageSpeed Insights request failed (${res.status}): ${body.slice(0, 200)}`,
		);
	}

	const data = await res.json();
	const lhr = data.lighthouseResult;
	if (!lhr) throw new Error("PageSpeed Insights returned no Lighthouse result");

	return {
		speed: mapCategory(lhr, "performance"),
		seo: mapCategory(lhr, "seo"),
		a11y: mapCategory(lhr, "accessibility"),
		bestPractices: mapCategory(lhr, "best-practices"),
		fetchedAt: new Date().toISOString(),
		source: "pagespeed-insights",
	};
}
