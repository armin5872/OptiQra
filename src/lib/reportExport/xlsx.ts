import type { ReportModel } from './model';
import { reportFileBaseName } from './model';
import { downloadBlob } from './download';

// Requires the `xlsx` package (SheetJS): npm install xlsx
// Loaded dynamically so it's only pulled into the bundle when a user actually
// clicks "Download as Excel spreadsheet".

export async function exportReportXlsx(model: ReportModel): Promise<void> {
  let XLSX: any;
  try {
    XLSX = await import('xlsx');
  } catch (e) {
    throw new Error('xlsx library not available. Please install it: npm install xlsx');
  }

  const wb = XLSX.utils.book_new();

  // --- Summary sheet ---------------------------------------------------
  const summaryAOA: (string | number)[][] = [
    ['OptiQra Audit Report'],
    ['Site', model.siteUrl],
    ['Scan type', model.mode === 'site' ? 'Full site crawl' : 'Single page'],
    ['Generated', model.generatedAt],
    ['Overall score', model.overallScore],
  ];
  if (model.pagesScanned?.length) {
    summaryAOA.push([
      'Pages scanned',
      model.crawlTruncated ? `${model.pagesScanned.length} (limit reached)` : model.pagesScanned.length,
    ]);
  }
  summaryAOA.push([], ['Category', 'Score', 'Open Issues', 'Total Issues', 'Passed Checks', 'Source', 'Pages Analyzed']);
  model.categories.forEach((c) => {
    summaryAOA.push([c.label, c.score, c.openIssues, c.totalIssues, c.passedCount, c.source, c.pagesAnalyzed ?? '']);
  });
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAOA);
  summarySheet['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // --- Issues sheet ------------------------------------------------------
  const issuesAOA: (string | number)[][] = [
    ['Category', 'Severity', 'Status', 'Title', 'Detail', 'Suggested Fix', 'Weight', 'Issue ID'],
    ...model.issues.map((i) => [i.category, i.severity, i.status, i.title, i.detail, i.fix, i.weight, i.id]),
  ];
  const issuesSheet = XLSX.utils.aoa_to_sheet(issuesAOA);
  issuesSheet['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 32 }, { wch: 50 }, { wch: 40 }, { wch: 8 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, issuesSheet, 'Issues');

  // --- Passed checks sheet ------------------------------------------------
  if (model.passedChecks.length) {
    const passedAOA: (string | number)[][] = [
      ['Category', 'Passed Check'],
      ...model.passedChecks.map((p) => [p.category, p.title]),
    ];
    const passedSheet = XLSX.utils.aoa_to_sheet(passedAOA);
    passedSheet['!cols'] = [{ wch: 20 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, passedSheet, 'Passed checks');
  }

  // --- Per-page scores sheet -----------------------------------------------
  if (model.pages?.length) {
    const header = ['Page URL', 'Depth', 'Overall Score', ...model.pages[0].categoryScores.map((c) => c.label)];
    const pagesAOA: (string | number)[][] = [
      header,
      ...model.pages.map((p) => [p.url, p.depth, p.score, ...p.categoryScores.map((c) => c.score)]),
    ];
    const pagesSheet = XLSX.utils.aoa_to_sheet(pagesAOA);
    pagesSheet['!cols'] = [{ wch: 50 }, { wch: 8 }, { wch: 12 }, ...header.slice(3).map(() => ({ wch: 14 }))];
    XLSX.utils.book_append_sheet(wb, pagesSheet, 'Per-page scores');
  }

  // --- Skipped pages sheet ------------------------------------------------
  if (model.pagesSkipped?.length) {
    const skippedAOA: (string | number)[][] = [
      ['Page URL', 'Reason'],
      ...model.pagesSkipped.map((s) => [s.url, s.reason]),
    ];
    const skippedSheet = XLSX.utils.aoa_to_sheet(skippedAOA);
    skippedSheet['!cols'] = [{ wch: 50 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, skippedSheet, 'Skipped pages');
  }

  const wbout: ArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `${reportFileBaseName(model)}.xlsx`);
}
