import type { ReportModel } from './model';

const scoreLabel = (score: number) => (score >= 80 ? 'Good' : score >= 60 ? 'Needs work' : 'Critical');

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export function toJSON(model: ReportModel): string {
  return JSON.stringify(model, null, 2);
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function toMarkdown(model: ReportModel): string {
  const lines: string[] = [];

  lines.push(`# OptiQra audit report`, '');
  lines.push(`**Site:** ${model.siteUrl}`);
  lines.push(`**Scan type:** ${model.mode === 'site' ? 'Full site crawl' : 'Single page'}`);
  lines.push(`**Generated:** ${model.generatedAt}`);
  lines.push(`**Overall score:** ${model.overallScore}/100 (${scoreLabel(model.overallScore)})`, '');

  if (model.pagesScanned?.length) {
    lines.push(
      `Scanned ${model.pagesScanned.length} page${model.pagesScanned.length === 1 ? '' : 's'}${
        model.crawlTruncated ? ' (limit reached — more pages were found but not scanned)' : ''
      }.`,
      '',
    );
  }

  lines.push('## Category scores', '');
  lines.push('| Category | Score | Open issues | Total issues | Passed checks | Source |');
  lines.push('|---|---|---|---|---|---|');
  model.categories.forEach((c) => {
    lines.push(
      `| ${c.label} | ${c.score}/100 | ${c.openIssues} | ${c.totalIssues} | ${c.passedCount} | ${c.source}${
        c.pagesAnalyzed ? ` · ${c.pagesAnalyzed} pages` : ''
      } |`,
    );
  });
  lines.push('');

  if (model.pages?.length) {
    lines.push('## Per-page scores', '');
    lines.push('| Page | Depth | Overall | ' + model.pages[0].categoryScores.map((c) => c.label).join(' | ') + ' |');
    lines.push('|---|---|---|' + model.pages[0].categoryScores.map(() => '---').join('|') + '|');
    model.pages.forEach((p) => {
      lines.push(
        `| ${p.url} | ${p.depth} | ${p.score} | ${p.categoryScores.map((c) => c.score).join(' | ')} |`,
      );
    });
    lines.push('');
  }

  lines.push('## Issues', '');
  const byCategory = groupBy(model.issues, (i) => i.category);
  byCategory.forEach((rows, category) => {
    lines.push(`### ${category}`, '');
    rows.forEach((r) => {
      lines.push(`- **[${r.severity.toUpperCase()}] ${r.title}** — ${r.status}`);
      if (r.detail) lines.push(`  - Detail: ${r.detail}`);
      if (r.fix) lines.push(`  - Fix: ${r.fix}`);
    });
    lines.push('');
  });

  if (model.passedChecks.length) {
    lines.push('## Passed checks', '');
    const byCategoryPassed = groupBy(model.passedChecks, (i) => i.category);
    byCategoryPassed.forEach((rows, category) => {
      lines.push(`### ${category}`, '');
      rows.forEach((r) => lines.push(`- ${r.title}`));
      lines.push('');
    });
  }

  if (model.pagesSkipped?.length) {
    lines.push('## Skipped pages', '');
    model.pagesSkipped.forEach((s) => lines.push(`- ${s.url} — ${s.reason}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function toTxt(model: ReportModel): string {
  const lines: string[] = [];
  const rule = '='.repeat(70);

  lines.push(rule, 'OPTIQRA AUDIT REPORT', rule, '');
  lines.push(`Site:          ${model.siteUrl}`);
  lines.push(`Scan type:     ${model.mode === 'site' ? 'Full site crawl' : 'Single page'}`);
  lines.push(`Generated:     ${model.generatedAt}`);
  lines.push(`Overall score: ${model.overallScore}/100 (${scoreLabel(model.overallScore)})`);
  if (model.pagesScanned?.length) {
    lines.push(`Pages scanned: ${model.pagesScanned.length}${model.crawlTruncated ? ' (limit reached)' : ''}`);
  }
  lines.push('', '-'.repeat(70), 'CATEGORY SCORES', '-'.repeat(70), '');

  model.categories.forEach((c) => {
    lines.push(
      `${c.label.padEnd(28)} ${String(c.score).padStart(3)}/100   open: ${c.openIssues}, total: ${c.totalIssues}, passed: ${c.passedCount}`,
    );
  });

  lines.push('', '-'.repeat(70), 'ISSUES', '-'.repeat(70), '');
  const byCategory = groupBy(model.issues, (i) => i.category);
  byCategory.forEach((rows, category) => {
    lines.push('', `[${category}]`, '');
    rows.forEach((r, idx) => {
      lines.push(`${idx + 1}. (${r.severity.toUpperCase()}, ${r.status}) ${r.title}`);
      if (r.detail) lines.push(`   Detail: ${r.detail}`);
      if (r.fix) lines.push(`   Fix:    ${r.fix}`);
      lines.push('');
    });
  });

  if (model.passedChecks.length) {
    lines.push('-'.repeat(70), 'PASSED CHECKS', '-'.repeat(70), '');
    const byCategoryPassed = groupBy(model.passedChecks, (i) => i.category);
    byCategoryPassed.forEach((rows, category) => {
      lines.push('', `[${category}]`, '');
      rows.forEach((r) => lines.push(`- ${r.title}`));
    });
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CSV / TSV — shared row-building, different delimiter + escaping rules
// ---------------------------------------------------------------------------

function escapeCsvField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeTsvField(value: string): string {
  return value.replace(/[\t\r\n]/g, ' ');
}

function rowsToDelimited(rows: (string | number)[][], delimiter: '\t' | ','): string {
  const escape = delimiter === '\t' ? (v: string) => escapeTsvField(v) : (v: string) => escapeCsvField(v, delimiter);
  return rows.map((row) => row.map((cell) => escape(String(cell))).join(delimiter)).join('\r\n');
}

function buildDelimited(model: ReportModel, delimiter: '\t' | ','): string {
  const blocks: string[] = [];

  const summaryRows: (string | number)[][] = [
    ['Category', 'Score', 'Open Issues', 'Total Issues', 'Passed Checks', 'Source', 'Pages Analyzed'],
    ...model.categories.map((c) => [c.label, c.score, c.openIssues, c.totalIssues, c.passedCount, c.source, c.pagesAnalyzed ?? '']),
  ];
  blocks.push(`# Site: ${model.siteUrl} | Overall score: ${model.overallScore}/100 | Generated: ${model.generatedAt}`);
  blocks.push(rowsToDelimited(summaryRows, delimiter));

  const issueRows: (string | number)[][] = [
    ['Category', 'Severity', 'Status', 'Title', 'Detail', 'Suggested Fix', 'Weight', 'Issue ID'],
    ...model.issues.map((i) => [i.category, i.severity, i.status, i.title, i.detail, i.fix, i.weight, i.id]),
  ];
  blocks.push('# Issues');
  blocks.push(rowsToDelimited(issueRows, delimiter));

  if (model.passedChecks.length) {
    const passedRows: (string | number)[][] = [
      ['Category', 'Passed Check'],
      ...model.passedChecks.map((p) => [p.category, p.title]),
    ];
    blocks.push('# Passed checks');
    blocks.push(rowsToDelimited(passedRows, delimiter));
  }

  if (model.pages?.length) {
    const header = ['Page URL', 'Depth', 'Overall Score', ...model.pages[0].categoryScores.map((c) => c.label)];
    const pageRows: (string | number)[][] = [
      header,
      ...model.pages.map((p) => [p.url, p.depth, p.score, ...p.categoryScores.map((c) => c.score)]),
    ];
    blocks.push('# Per-page scores');
    blocks.push(rowsToDelimited(pageRows, delimiter));
  }

  return blocks.join('\r\n\r\n');
}

export function toCSV(model: ReportModel): string {
  return buildDelimited(model, ',');
}

export function toTSV(model: ReportModel): string {
  return buildDelimited(model, '\t');
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  });
  return map;
}
