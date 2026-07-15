// Normalizes the shape kept in page.tsx's `reportData` state into a flat,
// format-agnostic model. Every exporter (CSV, TSV, Markdown, TXT, JSON, PDF,
// DOCX) is built on top of this so adding a new download format only means
// adding a new function that reads `ReportModel`, not touching page.tsx.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational' | 'good';

export interface SourceIssue {
  id: string;
  title: string;
  detail: string;
  fix?: string;
  weight: number;
  severity: Severity;
  resolved: boolean;
}

export interface SourceCategory {
  label: string;
  score: number;
  issues: SourceIssue[];
  passed: SourceIssue[];
  source: string;
  pagesAnalyzed?: number;
}

export interface SourcePageNode {
  url: string;
  parentUrl?: string;
  depth: number;
  score: number;
  categories: Record<string, { label: string; score: number; issues: SourceIssue[]; passed: SourceIssue[] }>;
}

export interface SourceReportData {
  url: string;
  mode?: 'single' | 'site';
  categories: Record<string, SourceCategory>;
  lighthouseAvailable: boolean;
  pagesScanned?: string[];
  pagesSkipped?: { url: string; reason: string }[];
  crawlTruncated?: boolean;
  pages?: SourcePageNode[];
  timestamp?: string;
}

export interface ReportIssueRow {
  category: string;
  id: string;
  severity: Severity;
  status: 'Open' | 'Resolved';
  title: string;
  detail: string;
  fix: string;
  weight: number;
}

export interface ReportPassedRow {
  category: string;
  title: string;
}

export interface ReportCategorySummary {
  key: string;
  label: string;
  score: number;
  source: string;
  pagesAnalyzed?: number;
  openIssues: number;
  totalIssues: number;
  passedCount: number;
}

export interface ReportPageRow {
  url: string;
  depth: number;
  score: number;
  categoryScores: { label: string; score: number }[];
}

export interface ReportModel {
  siteUrl: string;
  mode: 'single' | 'site';
  generatedAt: string;
  overallScore: number;
  pagesScanned?: string[];
  pagesSkipped?: { url: string; reason: string }[];
  crawlTruncated?: boolean;
  categories: ReportCategorySummary[];
  issues: ReportIssueRow[];
  passedChecks: ReportPassedRow[];
  pages?: ReportPageRow[];
}

const readableSource = (source: string) => {
  if (source === 'lighthouse' || source === 'pagespeed-insights') return 'Google Lighthouse (PageSpeed Insights)';
  if (source === 'security-headers-audit') return 'Security headers audit';
  return 'Live HTML scan';
};

export function buildReportModel(
  reportData: SourceReportData,
  overallScore: number,
  options?: { includePassedChecks?: boolean },
): ReportModel {
  const includePassedChecks = options?.includePassedChecks ?? true;
  const categories: ReportCategorySummary[] = [];
  const issues: ReportIssueRow[] = [];
  const passedChecks: ReportPassedRow[] = [];

  Object.entries(reportData.categories).forEach(([key, cat]) => {
    categories.push({
      key,
      label: cat.label,
      score: cat.score,
      source: readableSource(cat.source),
      pagesAnalyzed: cat.pagesAnalyzed,
      openIssues: cat.issues.filter((i) => !i.resolved).length,
      totalIssues: cat.issues.length,
      passedCount: cat.passed.length,
    });

    cat.issues.forEach((iss) => {
      issues.push({
        category: cat.label,
        id: iss.id,
        severity: iss.severity,
        status: iss.resolved ? 'Resolved' : 'Open',
        title: iss.title,
        detail: iss.detail,
        fix: iss.fix || '',
        weight: iss.weight,
      });
    });

    if (includePassedChecks) {
      cat.passed.forEach((p) => {
        passedChecks.push({ category: cat.label, title: p.title });
      });
    }
  });

  // Highest-impact, still-open issues first; resolved issues sink to the bottom.
  issues.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Open' ? -1 : 1;
    return b.weight - a.weight;
  });

  const pages: ReportPageRow[] | undefined = reportData.pages?.map((p) => ({
    url: p.url,
    depth: p.depth,
    score: p.score,
    categoryScores: Object.values(p.categories).map((c) => ({ label: c.label, score: c.score })),
  }));

  return {
    siteUrl: reportData.url,
    mode: reportData.mode === 'site' ? 'site' : 'single',
    generatedAt: reportData.timestamp || new Date().toISOString(),
    overallScore,
    pagesScanned: reportData.pagesScanned,
    pagesSkipped: reportData.pagesSkipped,
    crawlTruncated: reportData.crawlTruncated,
    categories,
    issues,
    passedChecks,
    pages,
  };
}

/** Base filename (no extension) shared by every exporter, e.g.
 *  "optiqra-report-example.com-2026-07-12". */
export function reportFileBaseName(model: ReportModel): string {
  let host = model.siteUrl;
  try {
    host = new URL(model.siteUrl).hostname;
  } catch {
    // leave as-is if the URL doesn't parse
  }
  const date = model.generatedAt.slice(0, 10);
  const safeHost = host.replace(/[^a-z0-9.-]/gi, '_');
  return `optiqra-report-${safeHost}-${date}`;
}
