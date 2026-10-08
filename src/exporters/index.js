/**
 * exporters - Excel (one sheet per module), CSV, Jira-ready CSV, Markdown.
 *
 * Excel deliberately uses styled ranges rather than Excel Table objects:
 * Table objects break on re-import and on some Excel/LibreOffice versions.
 */
import ExcelJS from 'exceljs';

const COLUMNS = [
  { header: 'Test Case ID', key: 'id', width: 20 },
  { header: 'Module', key: 'module', width: 18 },
  { header: 'Sub Module', key: 'subModule', width: 22 },
  { header: 'Title', key: 'title', width: 52 },
  { header: 'Description', key: 'description', width: 50 },
  { header: 'Type', key: 'type', width: 12 },
  { header: 'Category', key: 'category', width: 16 },
  { header: 'Priority', key: 'priority', width: 9 },
  { header: 'Severity', key: 'severity', width: 10 },
  { header: 'Preconditions', key: 'preconditions', width: 38 },
  { header: 'Test Data', key: 'testData', width: 40 },
  { header: 'Steps', key: 'steps', width: 64 },
  { header: 'Expected Result', key: 'expectedResult', width: 64 },
  { header: 'Actual Result', key: 'actualResult', width: 30 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Smoke', key: 'isSmoke', width: 8 },
  { header: 'Regression', key: 'isRegression', width: 11 },
  { header: 'Automatable', key: 'automatable', width: 12 },
  { header: 'Source', key: 'source', width: 10 },
  { header: 'Rule ID', key: 'ruleId', width: 26 },
  { header: 'Page URL', key: 'pageUrl', width: 44 },
  { header: 'Page Owner', key: 'pageOwner', width: 13 },
  { header: 'Created By', key: 'createdBy', width: 12 },
  { header: 'Tags', key: 'tags', width: 24 },
];

const flatten = (c) => ({
  ...c,
  preconditions: (c.preconditions || []).join('\n'),
  testData: Object.entries(c.testData || {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
  steps: (c.steps || []).map((s) => `${s.step}. ${s.action}${s.data ? ` [${s.data}]` : ''}`).join('\n'),
  tags: (c.tags || []).join(', '),
  isSmoke: c.isSmoke ? 'Yes' : 'No',
  isRegression: c.isRegression ? 'Yes' : 'No',
  automatable: c.automatable ? 'Yes' : 'No',
});

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };

function styleSheet(ws) {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  head.fill = HEADER_FILL;
  head.alignment = { vertical: 'middle', horizontal: 'left' };
  head.height = 24;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
    if (i % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };
    }
    const pri = row.getCell('priority').value;
    if (pri === 'P1') row.getCell('priority').font = { bold: true, color: { argb: 'FFB00020' } };
  });
}

export async function toExcel({ project, cases }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'QA Copilot';
  wb.created = new Date();

  /* ---- summary sheet ---- */
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 32 }, { width: 18 }, { width: 18 }];
  const rows = [
    ['Project', project.name],
    ['Product', project.product || '—'],
    ['Generated', new Date().toISOString().slice(0, 16).replace('T', ' ')],
    ['Pages', (project.pages || []).length],
    ['Total cases', cases.length],
    [],
    ['BY TYPE', 'Count', 'Share'],
    ...countRows(cases, 'type'),
    [],
    ['BY CATEGORY', 'Count', 'Share'],
    ...countRows(cases, 'category'),
    [],
    ['BY PRIORITY', 'Count', 'Share'],
    ...countRows(cases, 'priority'),
    [],
    ['BY MODULE', 'Count', 'Share'],
    ...countRows(cases, 'module'),
    [],
    ['BY STATUS', 'Count', 'Share'],
    ...countRows(cases, 'status'),
  ];
  rows.forEach((r) => sum.addRow(r));
  sum.getRow(1).font = { bold: true, size: 14 };
  sum.eachRow((row) => {
    const v = row.getCell(1).value;
    if (typeof v === 'string' && v === v.toUpperCase() && v.length > 2 && !v.includes(' ')) {
      row.font = { bold: true };
    }
    if (typeof v === 'string' && v.startsWith('BY ')) {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = HEADER_FILL;
    }
  });

  /* ---- one sheet per module ---- */
  const modules = [...new Set(cases.map((c) => c.module || 'GENERAL'))];
  for (const mod of modules) {
    const name = mod.replace(/[\\/*?:[\]]/g, '-').slice(0, 30) || 'GENERAL';
    const ws = wb.addWorksheet(name);
    ws.columns = COLUMNS;
    cases.filter((c) => (c.module || 'GENERAL') === mod).forEach((c) => ws.addRow(flatten(c)));
    styleSheet(ws);
  }

  if (!modules.length) {
    const ws = wb.addWorksheet('Test Cases');
    ws.columns = COLUMNS;
    styleSheet(ws);
  }

  return wb.xlsx.writeBuffer();
}

function countRows(cases, key) {
  const counts = cases.reduce((a, c) => { const k = c[key] || '—'; a[k] = (a[k] || 0) + 1; return a; }, {});
  const total = cases.length || 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => [k, n, `${((n / total) * 100).toFixed(0)}%`]);
}

/* ------------------------------------------------------------------- CSV */

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(cases) {
  const head = COLUMNS.map((c) => c.header).join(',');
  const body = cases.map(flatten)
    .map((c) => COLUMNS.map((col) => csvCell(c[col.key])).join(','))
    .join('\n');
  return `${head}\n${body}`;
}

/** Jira / Xray / Zephyr friendly shape. */
export function toJiraCsv(cases, { issueType = 'Test', project = '' } = {}) {
  const head = ['Summary', 'Description', 'Issue Type', 'Priority', 'Labels', 'Test Type', 'Manual Test Steps', 'Component'];
  const body = cases.map((c) => {
    const steps = (c.steps || [])
      .map((s) => `${s.step}. ${s.action}${s.data ? ` [${s.data}]` : ''}`).join(' \\n ');
    const desc = [
      c.description,
      c.preconditions?.length ? `Preconditions: ${c.preconditions.join('; ')}` : '',
      Object.keys(c.testData || {}).length
        ? `Test data: ${Object.entries(c.testData).map(([k, v]) => `${k}=${v}`).join('; ')}` : '',
      `Expected: ${c.expectedResult}`,
      `Page: ${c.pageUrl}`,
    ].filter(Boolean).join('\n');
    return [
      c.title,
      desc,
      issueType,
      c.priority === 'P1' ? 'Highest' : c.priority === 'P2' ? 'High' : c.priority === 'P3' ? 'Medium' : 'Low',
      [c.category, c.source, ...(c.tags || [])].join(' '),
      c.type,
      steps,
      c.module,
    ].map(csvCell).join(',');
  }).join('\n');
  return `${head.join(',')}\n${body}`;
}

/* -------------------------------------------------------------- Markdown */

export function toMarkdown({ project, cases }) {
  const byModule = cases.reduce((a, c) => {
    (a[c.module || 'GENERAL'] = a[c.module || 'GENERAL'] || []).push(c); return a;
  }, {});

  let out = `# Test Cases — ${project.name}\n\n`;
  out += `${cases.length} cases · generated ${new Date().toISOString().slice(0, 10)}\n\n`;

  for (const [mod, list] of Object.entries(byModule)) {
    out += `## ${mod} (${list.length})\n\n`;
    for (const c of list) {
      out += `### ${c.id} — ${c.title}\n\n`;
      out += `**${c.category}** · ${c.type} · ${c.priority}/${c.severity}`;
      out += `${c.isSmoke ? ' · smoke' : ''}${c.automatable ? '' : ' · not automatable'}\n\n`;
      if (c.description) out += `${c.description}\n\n`;
      if (c.preconditions?.length) out += `**Preconditions:** ${c.preconditions.join(' · ')}\n\n`;
      if (Object.keys(c.testData || {}).length) {
        out += '**Test data**\n\n';
        for (const [k, v] of Object.entries(c.testData)) out += `- \`${k}\`: ${v}\n`;
        out += '\n';
      }
      out += '**Steps**\n\n';
      for (const s of c.steps) out += `${s.step}. ${s.action}${s.data ? ` — \`${s.data}\`` : ''}\n`;
      out += `\n**Expected:** ${c.expectedResult}\n\n---\n\n`;
    }
  }
  return out;
}
