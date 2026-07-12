import type { ReportModel } from './model';
import { reportFileBaseName } from './model';
import { downloadBlob } from './download';

// Requires the `docx` package: npm install docx
// Loaded dynamically so it's only pulled into the bundle when a user actually
// clicks "Download as Word doc".

const SEVERITY_HEX: Record<string, string> = {
  critical: 'C82828',
  high: 'D26E14',
  medium: 'BE960A',
  low: '5A78C8',
  informational: '787878',
  good: '289656',
};

function scoreHex(score: number): string {
  if (score >= 80) return '289656';
  if (score >= 60) return 'BE960A';
  return 'C82828';
}

export async function exportReportDocx(model: ReportModel): Promise<void> {
  let Document: any, Packer: any, Paragraph: any, TextRun: any, HeadingLevel: any, Table: any, TableRow: any, TableCell: any, WidthType: any, ShadingType: any;
  try {
    const mod = await import('docx');
    Document = mod.Document;
    Packer = mod.Packer;
    Paragraph = mod.Paragraph;
    TextRun = mod.TextRun;
    HeadingLevel = mod.HeadingLevel;
    Table = mod.Table;
    TableRow = mod.TableRow;
    TableCell = mod.TableCell;
    WidthType = mod.WidthType;
    ShadingType = mod.ShadingType;
  } catch (e) {
    throw new Error(
      'docx library not available. Please install it: npm install docx',
    );
  }

  const cell = (text: string, opts: { bold?: boolean; color?: string; shade?: string } = {}) =>
    new TableCell({
      width: { size: 20, type: WidthType.PERCENTAGE },
      shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined,
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: opts.bold, color: opts.color })],
        }),
      ],
    });

  const summaryHeader = new TableRow({
    tableHeader: true,
    children: ['Category', 'Score', 'Open issues', 'Passed', 'Source'].map((h) => cell(h, { bold: true, shade: 'EEEEEE' })),
  });

  const summaryRows = model.categories.map(
    (c) =>
      new TableRow({
        children: [
          cell(c.label),
          cell(`${c.score}/100`, { bold: true, color: scoreHex(c.score) }),
          cell(String(c.openIssues)),
          cell(String(c.passedCount)),
          cell(c.source),
        ],
      }),
  );

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [summaryHeader, ...summaryRows],
  });

  const children: any[] = [
    new Paragraph({ text: 'OptiQra Audit Report', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Site: ${model.siteUrl}`, bold: true })] }),
    new Paragraph({ text: `Scan type: ${model.mode === 'site' ? 'Full site crawl' : 'Single page'}` }),
    new Paragraph({ text: `Generated: ${model.generatedAt}` }),
  ];

  if (model.pagesScanned?.length) {
    children.push(
      new Paragraph({
        text: `Pages scanned: ${model.pagesScanned.length}${model.crawlTruncated ? ' (limit reached)' : ''}`,
      }),
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({ text: `Overall score: ${model.overallScore}/100`, bold: true, size: 32, color: scoreHex(model.overallScore) }),
      ],
    }),
    new Paragraph({ text: 'Category scores', heading: HeadingLevel.HEADING_1 }),
    summaryTable,
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Issues', heading: HeadingLevel.HEADING_1 }),
  );

  const byCategory = new Map<string, typeof model.issues>();
  model.issues.forEach((iss) => {
    const list = byCategory.get(iss.category);
    if (list) list.push(iss);
    else byCategory.set(iss.category, [iss]);
  });

  byCategory.forEach((rows, category) => {
    children.push(new Paragraph({ text: category, heading: HeadingLevel.HEADING_2 }));
    rows.forEach((iss) => {
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({ text: `[${iss.severity.toUpperCase()}] `, bold: true, color: SEVERITY_HEX[iss.severity] || SEVERITY_HEX.informational }),
            new TextRun({ text: iss.title, bold: true }),
            new TextRun({ text: `  (${iss.status})`, italics: true, color: '808080' }),
          ],
        }),
      );
      if (iss.detail) children.push(new Paragraph({ text: iss.detail }));
      if (iss.fix) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Fix: `, bold: true, color: '1E6E3C' }), new TextRun({ text: iss.fix })],
          }),
        );
      }
    });
  });

  if (model.passedChecks.length) {
    children.push(new Paragraph({ text: 'Passed checks', heading: HeadingLevel.HEADING_1 }));
    model.passedChecks.forEach((p) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `✓ ${p.category}: `, bold: true, color: '289656' }), new TextRun({ text: p.title })],
        }),
      );
    });
  }

  if (model.pages?.length) {
    children.push(new Paragraph({ text: 'Per-page scores', heading: HeadingLevel.HEADING_1 }));
    const header = new TableRow({
      tableHeader: true,
      children: ['Page', 'Depth', 'Overall', ...model.pages[0].categoryScores.map((c) => c.label)].map((h) =>
        cell(h, { bold: true, shade: 'EEEEEE' }),
      ),
    });
    const rows = model.pages.map(
      (p) =>
        new TableRow({
          children: [cell(p.url), cell(String(p.depth)), cell(String(p.score)), ...p.categoryScores.map((c) => cell(String(c.score)))],
        }),
    );
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${reportFileBaseName(model)}.docx`);
}
