/* Word (.docx) report builders: individual labour, monthly totals, yearly totals.
 * Follows docx-js core rules: real heading styles, table header rows with
 * tableHeader/cantSplit, cell margins, footer with page numbers. */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  VerticalAlign, Footer, PageNumber,
} = require('docx');

/* ---------------- shared helpers ---------------- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const ACCENT = '4F46E5';
const HEAD_FILL = 'EEF0FF';
const TOTAL_FILL = 'F4F5FB';
const BORDER_COLOR = 'C9D2E3';
const MUTED = '6B7590';
const PAGE_W = 9638; // A4 width minus 2 cm margins, in twips

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};
const fmtDateLong = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const BASE_NAMES = { 1: 'Full Day', 0.5: 'Half Day', 0.25: 'Quarter Day', 0: 'Absent' };
const dayLabel = (base, extra) => {
  const b = BASE_NAMES[base];
  if (!b) return `${base} days`;
  if (!extra) return b;
  return `${b} + ${extra === 0.5 ? '½' : '¼'} extra`;
};

const periodText = (wp) => {
  const parts = [];
  if (wp.years) parts.push(`${wp.years} year${wp.years === 1 ? '' : 's'}`);
  if (wp.months) parts.push(`${wp.months} month${wp.months === 1 ? '' : 's'}`);
  if (wp.days || parts.length === 0) parts.push(`${wp.days} day${wp.days === 1 ? '' : 's'}`);
  return parts.join(' ');
};

const thin = { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR };
const TABLE_BORDERS = {
  top: thin, bottom: thin, left: thin, right: thin,
  insideHorizontal: thin, insideVertical: thin,
};

// spec: string | { text, bold?, fill?, color?, size? }; opts: { width, align }
function makeCell(spec, { width, align = AlignmentType.LEFT } = {}) {
  const { text = '', bold = false, fill, color, size = 20 } =
    typeof spec === 'object' && spec !== null ? spec : { text: spec };
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      spacing: { after: 0, line: 276 },
      children: [new TextRun({ text: String(text ?? ''), bold, color, size })],
    })],
  });
}

// headerLabels: string[]; rows: (string | {text, bold?, fill?})[][]; widths: DXA[]
function makeTable(headerLabels, rows, widths, aligns = []) {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headerLabels.map((h, i) =>
      makeCell({ text: h, bold: true, fill: HEAD_FILL, color: '3B4160' }, { width: widths[i], align: aligns[i] })),
  });
  const dataRows = rows.map((r) => {
    const cells = Array.isArray(r) ? r : r.cells;
    return new TableRow({
      cantSplit: true,
      children: cells.map((c, i) => makeCell(c, { width: widths[i], align: aligns[i] })),
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    borders: TABLE_BORDERS,
    rows: [headerRow, ...dataRows],
  });
}

function heading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    children: [new TextRun(text)],
  });
}

function note(text) {
  return new Paragraph({
    spacing: { before: 80, after: 160 },
    children: [new TextRun({ text, italics: true, color: MUTED, size: 20 })],
  });
}

function titleBlock({ title, subtitle, meta }) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(title)],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: subtitle, size: 27, bold: true, color: ACCENT })],
    }),
    new Paragraph({
      spacing: { after: 300 },
      border: { bottom: { color: BORDER_COLOR, size: 6, style: BorderStyle.SINGLE, space: 6 } },
      children: [new TextRun({ text: meta, size: 18, color: MUTED, italics: true })],
    }),
  ];
}

function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        children: ['Labour Manager — Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
        size: 16,
        color: '9AA3B5',
      })],
    })],
  });
}

function baseDocument(children) {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 21 },
          paragraph: { spacing: { line: 312, after: 100 } },
        },
        heading1: {
          run: { font: 'Calibri', size: 34, bold: true, color: '111827' },
          paragraph: { spacing: { before: 0, after: 80 } },
        },
        heading2: {
          run: { font: 'Calibri', size: 25, bold: true, color: ACCENT },
          paragraph: { spacing: { before: 300, after: 120 } },
        },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
      },
      footers: { default: pageFooter() },
      children,
    }],
  });
}

const sumRow = (cells) => ({ cells });

/* ---------------- 1. individual labour report ---------------- */

async function buildLabourReport({ labour, periods, working_period, history, today }) {
  const wp = working_period;
  const children = [
    ...titleBlock({
      title: 'Labour Wage Report',
      subtitle: `${labour.name}${labour.role ? ` — ${labour.role}` : ''}`,
      meta: `Generated on ${fmtDateLong(today)}  ·  Working period: ${periodText(wp)} (${wp.total_days} days)`,
    }),

    heading('Labour Details'),
    makeTable(
      ['Field', 'Details'],
      [
        [{ text: 'Name', bold: true, fill: TOTAL_FILL }, labour.name],
        [{ text: 'Role / Work type', bold: true, fill: TOTAL_FILL }, labour.role || '—'],
        [{ text: 'Phone', bold: true, fill: TOTAL_FILL }, labour.phone || '—'],
        [{ text: 'Joined on', bold: true, fill: TOTAL_FILL }, fmtDateLong(labour.join_date)],
        [{ text: 'Status', bold: true, fill: TOTAL_FILL }, labour.active ? 'Active' : 'Inactive'],
        [{ text: 'Working period', bold: true, fill: TOTAL_FILL },
          `${periodText(wp)}  (${fmtDateLong(wp.from)} to ${fmtDateLong(wp.to)}, ${wp.total_days} days)`],
        [{ text: 'Wage — full day', bold: true, fill: TOTAL_FILL }, inr(labour.wage_full)],
        [{ text: 'Wage — half day', bold: true, fill: TOTAL_FILL }, inr(labour.wage_half)],
        [{ text: 'Wage — quarter day', bold: true, fill: TOTAL_FILL }, inr(labour.wage_quarter)],
      ],
      [2800, 6838],
    ),

    heading('Wage Summary'),
    makeTable(
      ['Period', 'From', 'To', 'Entries', 'Days Worked', 'Wages'],
      [
        [periods.week.label, fmtDate(periods.week.from), fmtDate(periods.week.to),
          String(periods.week.entries), String(periods.week.days), inr(periods.week.amount)],
        [periods.month.label, fmtDate(periods.month.from), fmtDate(periods.month.to),
          String(periods.month.entries), String(periods.month.days), inr(periods.month.amount)],
        [periods.year.label, fmtDate(periods.year.from), fmtDate(periods.year.to),
          String(periods.year.entries), String(periods.year.days), inr(periods.year.amount)],
        [periods.all.label, '—', '—',
          String(periods.all.entries), String(periods.all.days), { text: inr(periods.all.amount), bold: true }],
      ],
      [1800, 1400, 1400, 1000, 1900, 2138],
      [AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT],
    ),

    heading('Attendance History'),
  ];

  if (history.length === 0) {
    children.push(note('No attendance records found for this labour yet.'));
  } else {
    const totalDays = history.reduce((s, h) => s + h.days_worked, 0);
    const totalWages = history.reduce((s, h) => s + h.amount, 0);
    children.push(makeTable(
      ['Date', 'Work Done', 'Days', 'Wage', 'Note'],
      [
        ...history.map((h) => [
          fmtDate(h.date),
          dayLabel(h.base, h.extra),
          String(h.days_worked),
          inr(h.amount),
          h.note || '—',
        ]),
        sumRow([
          { text: 'Total', bold: true, fill: TOTAL_FILL },
          { text: `${history.length} entries`, bold: true, fill: TOTAL_FILL },
          { text: String(Math.round(totalDays * 100) / 100), bold: true, fill: TOTAL_FILL },
          { text: inr(Math.round(totalWages * 100) / 100), bold: true, fill: TOTAL_FILL },
          { text: '', fill: TOTAL_FILL },
        ]),
      ],
      [1700, 2600, 1000, 1700, 2638],
      [AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.LEFT],
    ));
  }

  return Packer.toBuffer(baseDocument(children));
}

/* ---------------- 2. monthly report ---------------- */

async function buildMonthlyReport({ year, month, from, to, summary, details, today }) {
  const label = `${MONTHS[month - 1]} ${year}`;
  const children = [
    ...titleBlock({
      title: 'Monthly Wage Report',
      subtitle: label,
      meta: `Period: ${fmtDateLong(from)} to ${fmtDateLong(to)}  ·  Generated on ${fmtDateLong(today)}`,
    }),
  ];

  if (summary.length === 0) {
    children.push(note('No attendance records were found for this month.'));
  } else {
    const totEntries = summary.reduce((s, r) => s + r.entries, 0);
    const totDays = summary.reduce((s, r) => s + r.days, 0);
    const totWages = summary.reduce((s, r) => s + r.wages, 0);

    children.push(heading('Labour Summary'));
    children.push(makeTable(
      ['Labour', 'Role', 'Entries', 'Days Worked', 'Wages'],
      [
        ...summary.map((r) => [r.name, r.role || '—', String(r.entries),
          String(Math.round(r.days * 100) / 100), inr(r.wages)]),
        sumRow([
          { text: 'Total', bold: true, fill: TOTAL_FILL },
          { text: `${summary.length} labours`, bold: true, fill: TOTAL_FILL },
          { text: String(totEntries), bold: true, fill: TOTAL_FILL },
          { text: String(Math.round(totDays * 100) / 100), bold: true, fill: TOTAL_FILL },
          { text: inr(Math.round(totWages * 100) / 100), bold: true, fill: TOTAL_FILL },
        ]),
      ],
      [2800, 2100, 1200, 1700, 1838],
      [AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT],
    ));

    children.push(heading('Daily Records'));
    children.push(makeTable(
      ['Labour', 'Date', 'Work Done', 'Days', 'Wage', 'Note'],
      details.map((d) => [
        d.labour_name,
        fmtDate(d.date),
        dayLabel(d.base, d.extra),
        String(d.days_worked),
        inr(d.amount),
        d.note || '—',
      ]),
      [2000, 1500, 2100, 900, 1500, 1638],
      [AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.LEFT],
    ));
  }

  return Packer.toBuffer(baseDocument(children));
}

/* ---------------- 3. yearly report ---------------- */

async function buildYearlyReport({ year, from, to, summary, monthWise, today }) {
  const children = [
    ...titleBlock({
      title: 'Yearly Wage Report',
      subtitle: `Year ${year}`,
      meta: `Period: ${fmtDateLong(from)} to ${fmtDateLong(to)}  ·  Generated on ${fmtDateLong(today)}`,
    }),
  ];

  if (summary.length === 0) {
    children.push(note('No attendance records were found for this year.'));
  } else {
    const totEntries = summary.reduce((s, r) => s + r.entries, 0);
    const totDays = summary.reduce((s, r) => s + r.days, 0);
    const totWages = summary.reduce((s, r) => s + r.wages, 0);

    children.push(heading('Labour Summary'));
    children.push(makeTable(
      ['Labour', 'Role', 'Entries', 'Days Worked', 'Wages'],
      [
        ...summary.map((r) => [r.name, r.role || '—', String(r.entries),
          String(Math.round(r.days * 100) / 100), inr(r.wages)]),
        sumRow([
          { text: 'Total', bold: true, fill: TOTAL_FILL },
          { text: `${summary.length} labours`, bold: true, fill: TOTAL_FILL },
          { text: String(totEntries), bold: true, fill: TOTAL_FILL },
          { text: String(Math.round(totDays * 100) / 100), bold: true, fill: TOTAL_FILL },
          { text: inr(Math.round(totWages * 100) / 100), bold: true, fill: TOTAL_FILL },
        ]),
      ],
      [2800, 2100, 1200, 1700, 1838],
      [AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT],
    ));

    children.push(heading('Month-wise Totals'));
    children.push(makeTable(
      ['Month', 'Entries', 'Days Worked', 'Wages'],
      [
        ...monthWise.map((r) => [
          MONTHS[Number(r.ym.slice(5, 7)) - 1],
          String(r.entries),
          String(Math.round(r.days * 100) / 100),
          inr(r.wages),
        ]),
        sumRow([
          { text: 'Total', bold: true, fill: TOTAL_FILL },
          { text: String(totEntries), bold: true, fill: TOTAL_FILL },
          { text: String(Math.round(totDays * 100) / 100), bold: true, fill: TOTAL_FILL },
          { text: inr(Math.round(totWages * 100) / 100), bold: true, fill: TOTAL_FILL },
        ]),
      ],
      [3000, 2000, 2200, 2438],
      [AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT],
    ));
  }

  return Packer.toBuffer(baseDocument(children));
}

module.exports = { buildLabourReport, buildMonthlyReport, buildYearlyReport, fmtDateLong };
