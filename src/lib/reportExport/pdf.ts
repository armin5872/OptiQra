import type { ReportModel } from './model';
import { reportFileBaseName } from './model';

// Requires the `jspdf` package: npm install jspdf
// Loaded dynamically so it's only pulled into the bundle when a user actually
// clicks "Download as PDF".

const PAGE_MARGIN = 48;
const LINE_HEIGHT = 14;

const severityColor: Record<string, [number, number, number]> = {
  critical: [200, 40, 40],
  high: [210, 110, 20],
  medium: [190, 150, 10],
  low: [90, 120, 200],
  informational: [120, 120, 120],
  good: [40, 150, 90],
};

function scoreColor(score: number): [number, number, number] {
  if (score >= 80) return [40, 150, 90];
  if (score >= 60) return [190, 150, 10];
  return [200, 40, 40];
}

export async function exportReportPdf(model: ReportModel): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  let y = PAGE_MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  const writeWrapped = (text: string, x: number, width: number, fontSize: number, lineGap = LINE_HEIGHT) => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, width);
    lines.forEach((line: string) => {
      ensureSpace(lineGap);
      doc.text(line, x, y);
      y += lineGap;
    });
  };

  // --- Title -----------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text('OptiQra Audit Report', PAGE_MARGIN, y);
  y += 26;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(`Site: ${model.siteUrl}`, PAGE_MARGIN, y);
  y += 16;
  doc.text(`Scan type: ${model.mode === 'site' ? 'Full site crawl' : 'Single page'}`, PAGE_MARGIN, y);
  y += 16;
  doc.text(`Generated: ${model.generatedAt}`, PAGE_MARGIN, y);
  y += 16;
  if (model.pagesScanned?.length) {
    doc.text(
      `Pages scanned: ${model.pagesScanned.length}${model.crawlTruncated ? ' (limit reached)' : ''}`,
      PAGE_MARGIN,
      y,
    );
    y += 16;
  }
  y += 8;

  // --- Overall score badge ----------------------------------------------
  const [r, g, b] = scoreColor(model.overallScore);
  doc.setFillColor(r, g, b);
  doc.roundedRect(PAGE_MARGIN, y, 90, 40, 6, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`${model.overallScore}/100`, PAGE_MARGIN + 12, y + 26);
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.text('Overall vitals score', PAGE_MARGIN + 100, y + 24);
  y += 60;

  // --- Category score table ----------------------------------------------
  ensureSpace(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text('Category scores', PAGE_MARGIN, y);
  y += 18;

  const colWidths = [contentWidth * 0.32, contentWidth * 0.13, contentWidth * 0.18, contentWidth * 0.18, contentWidth * 0.19];
  const headers = ['Category', 'Score', 'Open issues', 'Passed', 'Source'];

  const drawRow = (cells: string[], bold: boolean, textColor: [number, number, number]) => {
    ensureSpace(LINE_HEIGHT + 4);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...textColor);
    let x = PAGE_MARGIN;
    cells.forEach((cell, i) => {
      doc.text(String(cell), x, y, { maxWidth: colWidths[i] - 4 });
      x += colWidths[i];
    });
    y += LINE_HEIGHT + 4;
  };

  drawRow(headers, true, [20, 20, 20]);
  doc.setDrawColor(210, 210, 210);
  doc.line(PAGE_MARGIN, y - LINE_HEIGHT, pageWidth - PAGE_MARGIN, y - LINE_HEIGHT);

  model.categories.forEach((c) => {
    drawRow(
      [c.label, `${c.score}/100`, String(c.openIssues), String(c.passedCount), c.source],
      false,
      scoreColor(c.score),
    );
  });
  y += 12;

  // --- Issues, grouped by category ----------------------------------------
  const byCategory = new Map<string, typeof model.issues>();
  model.issues.forEach((iss) => {
    const list = byCategory.get(iss.category);
    if (list) list.push(iss);
    else byCategory.set(iss.category, [iss]);
  });

  byCategory.forEach((rows, category) => {
    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(category, PAGE_MARGIN, y);
    y += 18;

    rows.forEach((iss) => {
      ensureSpace(20);
      const [sr, sg, sb] = severityColor[iss.severity] || severityColor.informational;
      doc.setFillColor(sr, sg, sb);
      doc.circle(PAGE_MARGIN + 4, y - 4, 4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
      doc.text(`[${iss.severity.toUpperCase()}] ${iss.title}`, PAGE_MARGIN + 14, y, { maxWidth: contentWidth - 14 });
      y += LINE_HEIGHT;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text(iss.status, PAGE_MARGIN + 14, y);
      y += LINE_HEIGHT;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      if (iss.detail) writeWrapped(iss.detail, PAGE_MARGIN + 14, contentWidth - 14, 9.5);
      if (iss.fix) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 110, 60);
        writeWrapped(`Fix: ${iss.fix}`, PAGE_MARGIN + 14, contentWidth - 14, 9.5);
      }
      y += 6;
    });
    y += 6;
  });

  // --- Passed checks -------------------------------------------------------
  if (model.passedChecks.length) {
    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text('Passed checks', PAGE_MARGIN, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(40, 150, 90);
    model.passedChecks.forEach((p) => {
      writeWrapped(`✓ ${p.category}: ${p.title}`, PAGE_MARGIN, contentWidth, 9.5);
    });
  }

  // --- Footer page numbers -------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`OptiQra · ${model.siteUrl} · Page ${i} of ${pageCount}`, PAGE_MARGIN, pageHeight - 20);
  }

  doc.save(`${reportFileBaseName(model)}.pdf`);
}
