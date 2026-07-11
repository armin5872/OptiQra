import type { AIProviderId } from "@/lib/aiFix";

/** Compact, prompt-ready slice of a Category — just enough for the model to
 *  reason about site-wide patterns without shipping every issue's full detail. */
export interface InsightsCategorySummary {
	label: string;
	score: number;
	pagesAnalyzed?: number;
	totalIssues: number;
	topIssues: {
		title: string;
		detail: string;
		severity: string;
		weight: number;
	}[];
}

export interface GenerateInsightsRequest {
	provider: AIProviderId;
	apiKey: string;
	model?: string;
	siteUrl: string;
	mode: "single" | "site";
	pagesScanned?: number;
	overallScore: number;
	categories: InsightsCategorySummary[];
}
