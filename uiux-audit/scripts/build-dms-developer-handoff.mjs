import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(packageRoot, 'output', 'dms-uiux-review');
const reportPath = path.join(outputRoot, 'combined-report.json');
const verificationCasesPath = path.join(outputRoot, 'verification-cases.json');
const combinedCasesPath = path.join(outputRoot, 'combined-cases.json');
const referenceMatrixPath = path.join(outputRoot, 'browser-matrix-reference-executed', 'matrix.json');
const referenceMatrixCsvPath = path.join(outputRoot, 'browser-matrix-reference-executed', 'matrix.csv');
const workbookPath = path.join(outputRoot, 'DMS-UIUX-Developer-Fix-Report.xlsx');
const htmlPath = path.join(outputRoot, 'developer-fix-report.html');
const pdfPath = path.join(outputRoot, 'DMS-UIUX-Developer-Fix-Report.pdf');

const COLORS = {
  ink: 'FF0F172A',
  muted: 'FF475569',
  white: 'FFFFFFFF',
  navy: 'FF172554',
  blue: 'FF2563EB',
  bluePale: 'FFDBEAFE',
  green: 'FF166534',
  greenPale: 'FFDCFCE7',
  amber: 'FFB45309',
  amberPale: 'FFFEF3C7',
  red: 'FFB91C1C',
  redPale: 'FFFEE2E2',
  purple: 'FF6D28D9',
  purplePale: 'FFF3E8FF',
  slatePale: 'FFF1F5F9',
  border: 'FFCBD5E1',
};

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3, KEEP: 4 };
const STATUS_ORDER = { MISMATCH: 0, 'PARTIAL MATCH': 1, MATCH: 2 };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractCases(document, report) {
  if (Array.isArray(document)) return document;
  if (Array.isArray(document?.cases)) return document.cases;
  if (Array.isArray(document?.verificationCases)) return document.verificationCases;
  if (Array.isArray(report.verificationCases)) return report.verificationCases;
  throw new Error('No verification cases were found in verification-cases.json or combined-report.json.');
}

function text(value, separator = '\n') {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => text(item, separator)).filter(Boolean).join(separator);
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${text(item, '; ')}`)
      .join(separator);
  }
  return String(value);
}

function safeCell(value) {
  const normalized = text(value);
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function escapeHtml(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugLabel(value) {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sortPriority(a, b) {
  return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    || String(a.id).localeCompare(String(b.id));
}

function caseSteps(testCase) {
  return (testCase.steps || [])
    .map((step, index) => `${index + 1}. ${step.action || step.step || text(step)}`)
    .join('\n');
}

function pageNames(ids, pageById) {
  const values = Array.isArray(ids) ? ids : String(ids || '').split(/\s+/).filter(Boolean);
  return values.map((id) => pageById.get(id)?.label || slugLabel(id)).join(', ');
}

function linkedItems(action, comparisons, cases) {
  const linkedComparisons = comparisons.filter((item) => item.linkedActionId === action.id);
  const linkedCases = cases.filter((item) => item.linkedActionId === action.id
    || (item.linkedComparisonIds || []).some((id) => linkedComparisons.some((comparison) => comparison.id === id)));
  return { linkedComparisons, linkedCases };
}

function makeCoverageRows(targetPageNames, referencePageName, referenceMatrix) {
  const pages = targetPageNames.join(', ');
  const savedEvidencePages = [referencePageName, ...targetPageNames].filter(Boolean).join(', ');
  const commonExecuted = {
    coverageType: 'Executed visual evidence',
    platform: 'Saved Playwright profile',
    browser: 'Chromium',
    zoomScale: '100%',
    executionStatus: 'EXECUTED - SAVED EVIDENCE',
    result: 'Evidence captured; use linked findings and cases for pass/fail outcomes.',
    pages: savedEvidencePages,
    checks: 'Rendered layout, computed styles, geometry, interaction samples, assets, full-page capture',
    blockerEvidence: 'Available under the page screenshot and audit artifact folders.',
  };

  const rows = [
    { id: 'COV-001', ...commonExecuted, viewport: '320x568', orientation: 'Portrait', input: 'Narrow viewport' },
    { id: 'COV-002', ...commonExecuted, viewport: '390x844', orientation: 'Portrait', input: 'Mobile viewport' },
    { id: 'COV-003', ...commonExecuted, viewport: '768x1024', orientation: 'Portrait', input: 'Tablet viewport' },
    { id: 'COV-004', ...commonExecuted, viewport: '1440x900', orientation: 'Landscape', input: 'Desktop viewport' },
  ];

  const publicSmoke = (id, browser, incompleteImages) => ({
    id,
    coverageType: 'Public reference browser smoke',
    platform: 'Playwright desktop profile',
    browser,
    viewport: '390x844',
    orientation: 'Portrait',
    zoomScale: '100%',
    input: 'Browser smoke only',
    executionStatus: 'EXECUTED - REFERENCE REVIEW',
    result: 'REVIEW - public reference loaded with no document overflow or page errors. This is not a local-page compatibility verdict.',
    pages: referencePageName || 'Ledgers.cloud reference',
    checks: 'HTTP response, title, document width, page errors, raw offscreen/font/image heuristic',
    blockerEvidence: `HTTP 200; title loaded; documentWidth=viewportWidth=390; 0 page errors. Raw heuristic only: 7 offscreen controls, minimum font 8.5px, ${incompleteImages} incomplete images. Carousel/lazy loading may explain these review signals; they are not classified as failures.`,
    referenceStatus: 'REVIEW',
    rootOverflowPx: 0,
    minimumFontPx: 8.5,
    incompleteImageCount: incompleteImages,
    evidencePath: 'Public-reference smoke supplied during audit review',
  });

  if (Array.isArray(referenceMatrix?.results) && referenceMatrix.results.length) {
    rows.push(...referenceMatrix.results.map((profile, index) => {
      const viewport = profile.viewport || {};
      const checks = profile.checks || {};
      const horizontalOverflow = checks.documentOverflow?.horizontalOverflow ?? profile.metrics?.horizontalOverflow ?? 'unknown';
      const pageErrors = checks.runtimeErrors?.pageErrors?.length ?? 0;
      const offscreenCount = checks.offscreenInteractive?.count ?? 0;
      const overlapCount = checks.bottomOverlap?.count ?? 0;
      const minimumFont = checks.minimumFont?.minimumObservedPx ?? 'unknown';
      const incompleteImages = checks.incompleteImages?.count ?? 0;
      const runtimeSignals = checks.runtimeErrors?.total ?? 0;
      return {
        id: `REF-${String(index + 1).padStart(3, '0')}`,
        coverageType: 'Executed public reference matrix',
        platform: viewport.hasTouch ? 'Playwright touch viewport' : 'Playwright desktop viewport',
        browser: `${profile.browser}${profile.browserVersion ? ` ${profile.browserVersion}` : ''}${profile.browser === 'webkit' ? ' (proxy, not real Safari)' : ''}`,
        viewport: `${viewport.width}x${viewport.height} (${viewport.name || 'custom'})`,
        orientation: viewport.width >= viewport.height ? 'Landscape' : 'Portrait',
        zoomScale: '100%',
        input: viewport.hasTouch ? 'Touch profile' : 'Mouse + keyboard profile',
        executionStatus: `EXECUTED - REFERENCE ${profile.status || 'REVIEW'}`,
        result: `${profile.status || 'REVIEW'} - HTTP ${profile.httpStatus ?? 'n/a'}; root horizontal overflow ${horizontalOverflow}px; page errors ${pageErrors}. This is reference-only evidence, not a local-page verdict.`,
        pages: referencePageName || 'Ledgers.cloud reference',
        checks: 'HTTP/content, root overflow, offscreen controls, bottom overlap, minimum font, incomplete images, runtime signals',
        blockerEvidence: `Heuristic review only: ${offscreenCount} offscreen controls, ${overlapCount} bottom-overlap candidates, minimum font ${minimumFont}px, ${incompleteImages} incomplete/lazy images, ${runtimeSignals} runtime/CSP/network signals. These are not automatic failures. Evidence: browser-matrix-reference-executed/matrix.json.`,
        referenceStatus: profile.status || 'REVIEW',
        rootOverflowPx: Number(horizontalOverflow),
        minimumFontPx: Number(minimumFont),
        offscreenCount,
        overlapCount,
        incompleteImageCount: incompleteImages,
        runtimeSignalCount: runtimeSignals,
        evidencePath: 'browser-matrix-reference-executed/matrix.json',
      };
    }));
  } else {
    rows.push(
      publicSmoke('COV-005', 'Chromium', 7),
      publicSmoke('COV-006', 'Google Chrome', 12),
      publicSmoke('COV-007', 'Microsoft Edge', 7),
      publicSmoke('COV-008', 'Firefox', 16),
      publicSmoke('COV-009', 'WebKit proxy (not real Safari)', 12),
    );
  }

  const blocked = (id, coverageType, platform, browser, viewport, orientation, zoomScale, input, checks) => ({
    id,
    coverageType,
    platform,
    browser,
    viewport,
    orientation,
    zoomScale,
    input,
    executionStatus: 'BLOCKED - NOT EXECUTED',
    result: 'No compatibility verdict. Do not treat this row as a pass.',
    pages,
    checks,
    blockerEvidence: 'Internal target URLs timed out from the current execution environment. Re-run when the environment or VPN is reachable.',
  });

  rows.push(
    blocked('COV-010', 'Windows size + browser', 'Windows 11', 'Chrome', '1024x768', 'Landscape', '100%', 'Mouse + keyboard', 'Reflow, wrapping, font rendering, CTA states'),
    blocked('COV-011', 'Windows size + browser', 'Windows 11', 'Chrome', '1280x720', 'Landscape', '100%', 'Mouse + keyboard', 'Short-height layout, fixed elements, footer reachability'),
    blocked('COV-012', 'Windows size + browser', 'Windows 11', 'Chrome', '1366x768', 'Landscape', '100%', 'Mouse + keyboard', 'Common laptop layout, font and component bounds'),
    blocked('COV-013', 'Windows size + browser', 'Windows 11', 'Chrome', '1536x864', 'Landscape', '100%', 'Mouse + keyboard', 'Wide laptop rails, content widths, spacing'),
    blocked('COV-014', 'Windows size + browser', 'Windows 11', 'Chrome', '1920x1080', 'Landscape', '100%', 'Mouse + keyboard', 'Large-screen rails, maximum content width'),
    blocked('COV-015', 'Cross-browser', 'Windows 11', 'Edge', '1366x768', 'Landscape', '100%', 'Mouse + keyboard', 'Font rendering, controls, focus, wrapping'),
    blocked('COV-016', 'Cross-browser', 'Windows 11', 'Edge', '1920x1080', 'Landscape', '100%', 'Mouse + keyboard', 'Large-screen layout and design tokens'),
    blocked('COV-017', 'Cross-browser', 'Windows 11', 'Firefox', '1366x768', 'Landscape', '100%', 'Mouse + keyboard', 'Font metrics, wrapping, focus, controls'),
    blocked('COV-018', 'Cross-browser', 'Windows 11', 'Firefox', '1920x1080', 'Landscape', '100%', 'Mouse + keyboard', 'Large-screen layout and component bounds'),
    blocked('COV-019', 'WebKit proxy', 'Playwright desktop profile', 'WebKit proxy (not real Safari)', '1440x900', 'Landscape', '100%', 'Mouse + keyboard', 'WebKit layout, font metrics, controls'),
    blocked('COV-020', 'WebKit proxy', 'Playwright mobile profile', 'WebKit proxy (not real iOS Safari)', '390x844', 'Portrait', '100%', 'Touch profile', 'Mobile WebKit reflow and fixed elements'),
    blocked('COV-021', 'Automated zoom/reflow', 'Windows 11', 'Chromium', '1280x720', 'Landscape', '200% browser zoom', 'Keyboard', 'WCAG zoom, component bounds, focused-element visibility'),
    blocked('COV-022', 'Automated zoom/reflow', 'Windows 11', 'Chromium', '1280x720', 'Landscape', '400% / 320 CSS px equivalent', 'Keyboard', 'WCAG reflow, no two-dimensional scrolling for content'),
    blocked('COV-023', 'Breakpoint boundary', 'Automation profile', 'Chrome, Edge, Firefox, WebKit proxy', 'Each real CSS breakpoint: -1 / exact / +1 px', 'Both', '100%', 'Keyboard + pointer', 'Breakpoint-specific wrapping, visibility, component bounds'),
  );

  const manual = (id, coverageType, platform, browser, viewport, orientation, zoomScale, input, checks, note) => ({
    id,
    coverageType,
    platform,
    browser,
    viewport,
    orientation,
    zoomScale,
    input,
    executionStatus: 'PLANNED MANUAL - NOT EXECUTED',
    result: 'No device verdict. Do not treat this row as a pass.',
    pages,
    checks,
    blockerEvidence: note,
  });

  rows.push(
    manual('COV-024', 'Real mobile device', 'iPhone compact', 'iOS Safari', '375x667', 'Portrait', 'Default', 'Touch + VoiceOver spot check', 'Safe areas, fixed tray, text, tap targets, keyboard', 'Requires a physical iPhone or approved remote-device service.'),
    manual('COV-025', 'Real mobile device', 'iPhone standard', 'iOS Safari', '390x844', 'Portrait', 'Default', 'Touch + VoiceOver spot check', 'Safe areas, fixed tray, text, tap targets, keyboard', 'Requires a physical iPhone or approved remote-device service.'),
    manual('COV-026', 'Real mobile device', 'iPhone large', 'iOS Safari', '430x932', 'Portrait', 'Default', 'Touch + VoiceOver spot check', 'Large-mobile rails, safe areas, text and CTA hierarchy', 'Requires a physical iPhone or approved remote-device service.'),
    manual('COV-027', 'Real mobile device', 'Android compact', 'Chrome Android', '360x800', 'Portrait', 'Default', 'Touch + TalkBack spot check', 'Reflow, fixed tray, media loading, tap targets', 'Requires a physical Android device or approved remote-device service.'),
    manual('COV-028', 'Real mobile device', 'Android standard', 'Chrome Android', '412x915', 'Portrait', 'Default', 'Touch + TalkBack spot check', 'Reflow, fixed tray, media loading, tap targets', 'Requires a physical Android device or approved remote-device service.'),
    manual('COV-029', 'Real tablet device', 'iPad', 'iPadOS Safari', '768x1024', 'Portrait', 'Default', 'Touch', 'Tablet rails, menu, cards, footer badges', 'Requires a physical iPad or approved remote-device service.'),
    manual('COV-030', 'Real tablet device', 'iPad Air', 'iPadOS Safari', '820x1180', 'Portrait', 'Default', 'Touch', 'Tablet rails, menu, cards, footer badges', 'Requires a physical iPad or approved remote-device service.'),
    manual('COV-031', 'Real tablet device', 'iPad landscape', 'iPadOS Safari', '1024x768', 'Landscape', 'Default', 'Touch', 'Orientation transition, navigation, component bounds', 'Requires a physical iPad or approved remote-device service.'),
    manual('COV-032', 'Windows display scaling', 'Windows 11 laptop', 'Edge or Chrome', '1366x768', 'Landscape', '125% OS scaling', 'Mouse + keyboard', 'Font clarity, clipping, dialogs, fixed controls', 'Requires a Windows display session configured to 125% scaling.'),
    manual('COV-033', 'Windows display scaling', 'Windows 11 laptop', 'Edge or Chrome', '1366x768', 'Landscape', '150% OS scaling', 'Mouse + keyboard', 'Font clarity, clipping, dialogs, fixed controls', 'Requires a Windows display session configured to 150% scaling.'),
    manual('COV-034', 'Windows display scaling', 'Windows 11 laptop', 'Edge or Chrome', '1366x768', 'Landscape', '200% OS scaling', 'Mouse + keyboard', 'Font clarity, clipping, dialogs, fixed controls', 'Requires a Windows display session configured to 200% scaling.'),
    manual('COV-035', 'Real mobile orientation', 'iPhone standard landscape', 'iOS Safari', '844x390', 'Landscape', 'Default', 'Touch + dynamic browser controls', 'Rotation, safe-area insets, fixed tray, navigation, CTA and product preview', 'Requires a real iPhone or approved real-device service; WebKit automation is not proof of real iOS behavior.'),
    manual('COV-036', 'Real mobile orientation', 'Android compact landscape', 'Chrome Android', '800x360', 'Landscape', 'Default', 'Touch + dynamic browser controls', 'Rotation, virtual-keyboard clearance, fixed tray and required controls', 'Requires a real Android device or approved real-device service.'),
    manual('COV-037', 'Real mobile orientation', 'Android standard landscape', 'Chrome Android', '915x412', 'Landscape', 'Default', 'Touch + dynamic browser controls', 'Rotation, virtual-keyboard clearance, fixed tray and required controls', 'Requires a real Android device or approved real-device service.'),
    manual('COV-038', 'Windows display scaling', 'Windows 11 laptop', 'Chrome, Edge, and Firefox', '1366x768', 'Landscape', '100% OS scaling', 'Mouse + keyboard', 'Baseline font metrics, content rails, clipping and controls', 'Requires a Windows display session at 100% scaling for a baseline against 125% and 150%.'),
    manual('COV-039', 'Font delivery resilience', 'Windows 11 laptop', 'Chrome, Edge, and Firefox', '1366x768', 'Landscape', '100%, 125%, and 150% OS scaling', 'Throttled or blocked font request', 'Font swap, fallback stack, weights, layout shift, clipping, wrapping and 65ch body measure', 'Requires throttled and failed Inter-font scenarios. Record evidence for every browser and scale; do not infer a pass from normal-load Chromium evidence.'),
    blocked('COV-040', 'Large Windows desktop', 'Windows 11', 'Chrome, Edge, and Firefox', '2560x1440', 'Landscape', '100%', 'Mouse + keyboard', 'Maximum rails, oversized whitespace, image sharpness, content alignment and CTA hierarchy'),
    manual('COV-041', '4K Windows desktop', 'Windows 11 4K display', 'Chrome or Edge', '3840x2160', 'Landscape', '150% and 200% OS scaling', 'Mouse + keyboard', 'Effective viewport, text sharpness, content rails, media density and fixed controls', 'Requires a physical or remote 4K Windows display at the stated OS scaling. This is optional extended coverage, not an executed result.'),
    manual('COV-042', 'Windows accessibility colors', 'Windows 11', 'Edge, Chrome, and Firefox', '1366x768', 'Landscape', 'Forced colors / high contrast', 'Keyboard', 'Text and icon visibility, system-color mapping, focus, borders, disabled and selected states', 'Requires Windows forced-colors/high-contrast profiles. Record each browser result; do not infer support from normal-color evidence.'),
    blocked('COV-043', 'Browser zoom sampling', 'Windows 11', 'Chrome, Edge, and Firefox', '1366x768', 'Landscape', '80%, 90%, 110%, and 125% browser zoom', 'Mouse + keyboard', 'Font rasterization, wrapping, rails, fixed controls and accidental clipping'),
    blocked('COV-044', 'Reduced motion preference', 'Automation and real-device profiles', 'Supported browsers', 'All critical viewports', 'Both', 'prefers-reduced-motion: reduce', 'Keyboard + pointer', 'Animations, counters, transitions, auto-play, focus and final content state'),
    manual('COV-045', 'Conditional dark scheme', 'Supported OS and device profiles', 'Supported browsers', 'Representative mobile, tablet, and desktop widths', 'Both', 'prefers-color-scheme: dark', 'Keyboard + pointer', 'Semantic colors, contrast, media, focus, borders and browser chrome integration', 'Execute only if the product officially supports a dark scheme. Until support is confirmed, this remains conditional planned coverage and has no verdict.'),
  );

  return rows;
}

function fillForValue(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'P0' || normalized.includes('MISMATCH') || normalized.includes('BLOCKED')) {
    return { fill: COLORS.redPale, font: COLORS.red };
  }
  if (normalized === 'P1' || normalized.includes('PARTIAL') || normalized.includes('REVIEW') || normalized.includes('PLANNED') || normalized.includes('NOT TESTED') || normalized.includes('NOT RETESTED')) {
    return { fill: COLORS.amberPale, font: COLORS.amber };
  }
  if (normalized.includes('MATCH') || normalized.includes('KEEP')) {
    return { fill: COLORS.greenPale, font: COLORS.green };
  }
  if (normalized.includes('EXECUTED') || normalized.includes('AVAILABLE')) {
    return { fill: COLORS.bluePale, font: COLORS.navy };
  }
  if (normalized === 'P2') return { fill: COLORS.purplePale, font: COLORS.purple };
  return null;
}

function setSheetFrame(worksheet, { title, subtitle, note, columns, tabColor }) {
  const lastColumn = columns.length;
  worksheet.mergeCells(1, 1, 1, lastColumn);
  worksheet.getCell(1, 1).value = title;
  worksheet.getCell(1, 1).font = { bold: true, size: 18, color: { argb: COLORS.white } };
  worksheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
  worksheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 31;

  worksheet.mergeCells(2, 1, 2, lastColumn);
  worksheet.getCell(2, 1).value = subtitle;
  worksheet.getCell(2, 1).font = { bold: true, size: 12, color: { argb: COLORS.red } };
  worksheet.getCell(2, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redPale } };
  worksheet.getCell(2, 1).alignment = { vertical: 'middle', wrapText: true };
  worksheet.getRow(2).height = 28;

  worksheet.mergeCells(3, 1, 3, lastColumn);
  worksheet.getCell(3, 1).value = note;
  worksheet.getCell(3, 1).font = { italic: true, color: { argb: COLORS.muted } };
  worksheet.getCell(3, 1).alignment = { vertical: 'top', wrapText: true };
  worksheet.getRow(3).height = 38;

  const headerRow = 5;
  columns.forEach((column, index) => {
    const cell = worksheet.getCell(headerRow, index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ink } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: COLORS.blue } } };
    worksheet.getColumn(index + 1).width = column.width;
  });
  worksheet.getRow(headerRow).height = 31;
  worksheet.views = [{ state: 'frozen', ySplit: headerRow, xSplit: Math.min(2, lastColumn), topLeftCell: 'C6', zoomScale: 85 }];
  worksheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: lastColumn } };
  worksheet.properties.defaultRowHeight = 20;
  worksheet.properties.tabColor = { argb: tabColor || COLORS.blue };
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.15, footer: 0.15 },
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  worksheet.headerFooter.oddHeader = `&L&BDMS UI/UX Developer Handoff&R${title}`;
  worksheet.headerFooter.oddFooter = '&LConfidential developer handoff&CPage &P of &N&RGenerated from saved audit evidence';
  return headerRow;
}

function addRows(worksheet, columns, rows, headerRow) {
  rows.forEach((item, rowIndex) => {
    const rowNumber = headerRow + 1 + rowIndex;
    const row = worksheet.getRow(rowNumber);
    columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.value = safeCell(item[column.key]);
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.font = { size: 10, color: { argb: COLORS.ink } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'hair', color: { argb: COLORS.border } },
      };
      if (rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.slatePale } };
      }
      if (column.status) {
        const style = fillForValue(item[column.key]);
        if (style) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
          cell.font = { bold: true, size: 10, color: { argb: style.font } };
        }
      }
    });
    row.height = Math.min(150, Math.max(30, 15 + Math.max(...columns.map((column) => text(item[column.key]).split('\n').length)) * 13));
  });
}

function addListValidation(worksheet, columnNumber, startRow, endRow, values) {
  for (let row = startRow; row <= endRow; row += 1) {
    worksheet.getCell(row, columnNumber).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`"${values.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Choose a listed status',
      error: 'Use the drop-down status so the handoff remains filterable.',
    };
  }
}

function makeDesignRows(design) {
  const rows = [
    { category: 'Typography', token: 'Font family', value: design.fontFamily, developerRule: 'Use the shared font stack on all three product pages.' },
    { category: 'Typography', token: 'Font weights', value: design.fontWeights, developerRule: 'Limit weights to the documented semantic roles.' },
  ];
  Object.entries(design.typeScale || {}).forEach(([key, value]) => rows.push({
    category: 'Typography', token: slugLabel(key), value, developerRule: 'Apply the shared responsive type scale; verify wrapping at every coverage width.',
  }));
  Object.entries(design.contentWidth || {}).forEach(([key, value]) => rows.push({
    category: 'Content width', token: slugLabel(key), value, developerRule: 'Keep shared rails and readable text measure consistent.',
  }));
  Object.entries(design.colors || {}).forEach(([key, value]) => rows.push({
    category: 'Color', token: slugLabel(key), value, developerRule: 'Use semantic tokens and remeasure all interaction states.',
  }));
  rows.push({
    category: 'Spacing', token: 'Approved scale', value: (design.spacing || []).map((item) => `${item}px`).join(', '), developerRule: 'Use only documented spacing values unless an exception is approved.',
  });
  Object.entries(design.radii || {}).forEach(([key, value]) => rows.push({
    category: 'Radius', token: slugLabel(key), value, developerRule: 'Use the shared component radius token.',
  }));
  Object.entries(design.controls || {}).forEach(([key, value]) => rows.push({
    category: 'Controls', token: slugLabel(key), value, developerRule: 'Keep control construction and focus behavior consistent.',
  }));
  return rows;
}

function createWorkbook(report, cases, coverageRows, sourceLabel) {
  const pageById = new Map((report.pages || []).map((page) => [page.id, page]));
  const comparisons = [...(report.statusComparisons || [])].sort((a, b) => (
    (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
      || (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
      || String(a.id).localeCompare(String(b.id))
  ));
  const actions = [...(report.actions || [])].sort(sortPriority);
  const fixFirst = actions.filter((action) => ['P0', 'P1'].includes(action.priority));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QA Copilot - Standalone UI/UX Audit';
  workbook.lastModifiedBy = 'QA Copilot - Standalone UI/UX Audit';
  workbook.created = new Date(report.generatedAt || Date.now());
  workbook.modified = new Date();
  workbook.title = 'DMS UI/UX Developer Fix Report';
  workbook.subject = 'Prioritized UI/UX fixes, browser-size coverage, verification cases, and design baseline';
  workbook.company = 'Ledgers';
  workbook.calcProperties.fullCalcOnLoad = true;

  const fixColumns = [
    { header: 'Rank', key: 'rank', width: 8 },
    { header: 'Release Gate', key: 'releaseGate', width: 17, status: true },
    { header: 'Priority', key: 'priority', width: 9, status: true },
    { header: 'Action ID', key: 'actionId', width: 13 },
    { header: 'Finding IDs', key: 'findingIds', width: 15 },
    { header: 'Problem', key: 'problem', width: 42 },
    { header: 'Measured Evidence', key: 'evidence', width: 48 },
    { header: 'Affected Pages', key: 'pages', width: 28 },
    { header: 'Browser / Size Scope', key: 'scope', width: 34 },
    { header: 'Developer Change', key: 'fix', width: 52 },
    { header: 'Done When', key: 'acceptance', width: 52 },
    { header: 'Owner', key: 'owner', width: 24 },
    { header: 'Test Cases', key: 'caseIds', width: 19 },
    { header: 'Developer Status', key: 'developerStatus', width: 18, status: true },
    { header: 'QA Status', key: 'qaStatus', width: 17, status: true },
  ];
  const fixRows = fixFirst.map((action, index) => {
    const { linkedComparisons, linkedCases } = linkedItems(action, comparisons, cases);
    return {
      rank: index + 1,
      releaseGate: action.priority === 'P0' ? 'BLOCKS RELEASE' : 'FIX BEFORE SIGN-OFF',
      priority: action.priority,
      actionId: action.id,
      findingIds: linkedComparisons.map((item) => item.id).join(', '),
      problem: `${action.title}\n${action.finding}`,
      evidence: linkedCases.map((item) => item.evidence).filter(Boolean).join('\n')
        || linkedComparisons.map((item) => item.local).filter(Boolean).join('\n'),
      pages: pageNames(action.scope, pageById),
      scope: 'Saved Chromium evidence: 320x568, 390x844, 768x1024, 1440x900. Repeat blocked browser/device matrix after the fix.',
      fix: action.fix,
      acceptance: action.acceptance,
      owner: action.owner,
      caseIds: linkedCases.map((item) => item.id).join(', '),
      developerStatus: 'OPEN',
      qaStatus: 'NOT RETESTED',
    };
  });
  const fixSheet = workbook.addWorksheet('01 Fix First');
  const fixHeader = setSheetFrame(fixSheet, {
    title: '01 - Fix First: P0 and P1 Developer Actions',
    subtitle: `Release decision: ${report.decisionSummary?.releaseDecision || report.executiveSummary?.outcome || 'FIX BEFORE UI/UX SIGN-OFF'}`,
    note: `Start here. ${fixRows.filter((row) => row.priority === 'P0').length} P0 release blockers and ${fixRows.filter((row) => row.priority === 'P1').length} P1 sign-off fixes. Evidence source: ${sourceLabel}. Unexecuted browser/device rows are never marked as passed.`,
    columns: fixColumns,
    tabColor: COLORS.red,
  });
  addRows(fixSheet, fixColumns, fixRows, fixHeader);
  const developerStatusColumn = fixColumns.findIndex((column) => column.key === 'developerStatus') + 1;
  const qaStatusColumn = fixColumns.findIndex((column) => column.key === 'qaStatus') + 1;
  addListValidation(fixSheet, developerStatusColumn, fixHeader + 1, fixHeader + fixRows.length, ['OPEN', 'IN PROGRESS', 'READY FOR QA', 'FIXED', 'ACCEPTED RISK']);
  addListValidation(fixSheet, qaStatusColumn, fixHeader + 1, fixHeader + fixRows.length, ['NOT RETESTED', 'PASS', 'FAIL', 'BLOCKED']);

  const differenceColumns = [
    { header: 'Comparison ID', key: 'id', width: 14 },
    { header: 'Status', key: 'status', width: 17, status: true },
    { header: 'Priority', key: 'priority', width: 10, status: true },
    { header: 'Area', key: 'area', width: 31 },
    { header: 'Reference / Expected', key: 'reference', width: 43 },
    { header: 'Current Local Evidence', key: 'local', width: 48 },
    { header: 'eStamp', key: 'estamp', width: 19, status: true },
    { header: 'Document Management', key: 'documents', width: 22, status: true },
    { header: 'Aadhaar eSign', key: 'aadhaar', width: 19, status: true },
    { header: 'Gap', key: 'gap', width: 43 },
    { header: 'Required Fix / Keep Rule', key: 'fix', width: 47 },
    { header: 'Action ID', key: 'actionId', width: 13 },
    { header: 'Case ID', key: 'caseId', width: 15 },
  ];
  const differenceRows = comparisons.map((item) => ({
    id: item.id,
    status: item.status,
    priority: item.priority,
    area: item.area,
    reference: item.reference,
    local: item.local,
    estamp: item.pages?.estamp2?.status || (item.affectedPages || []).includes('estamp2') ? item.pages?.estamp2?.status || item.status : 'N/A',
    documents: item.pages?.['document-management']?.status || (item.affectedPages || []).includes('document-management') ? item.pages?.['document-management']?.status || item.status : 'N/A',
    aadhaar: item.pages?.['aadhar-esign']?.status || (item.affectedPages || []).includes('aadhar-esign') ? item.pages?.['aadhar-esign']?.status || item.status : 'N/A',
    gap: item.gap,
    fix: item.fix,
    actionId: item.linkedActionId || '',
    caseId: item.caseId || '',
  }));
  const differenceSheet = workbook.addWorksheet('02 Differences');
  const differenceHeader = setSheetFrame(differenceSheet, {
    title: '02 - Clear Difference Matrix',
    subtitle: `${report.decisionSummary?.mismatchCount ?? comparisons.filter((item) => item.status === 'MISMATCH').length} mismatches, ${report.decisionSummary?.partialMatchCount ?? comparisons.filter((item) => item.status === 'PARTIAL MATCH').length} partial matches, ${report.decisionSummary?.matchCount ?? comparisons.filter((item) => item.status === 'MATCH').length} matches`,
    note: 'Red means change is required, amber means verify or complete the gap, and green means keep the behavior. Each row links the expected state, local evidence, fix, action, and verification case.',
    columns: differenceColumns,
    tabColor: COLORS.amber,
  });
  addRows(differenceSheet, differenceColumns, differenceRows, differenceHeader);

  const coverageColumns = [
    { header: 'Coverage ID', key: 'id', width: 13 },
    { header: 'Coverage Type', key: 'coverageType', width: 24 },
    { header: 'Platform / Profile', key: 'platform', width: 24 },
    { header: 'Browser / Engine', key: 'browser', width: 29 },
    { header: 'Viewport', key: 'viewport', width: 23 },
    { header: 'Orientation', key: 'orientation', width: 13 },
    { header: 'Zoom / OS Scale', key: 'zoomScale', width: 21 },
    { header: 'Input', key: 'input', width: 25 },
    { header: 'Execution Status', key: 'executionStatus', width: 29, status: true },
    { header: 'Result', key: 'result', width: 43 },
    { header: 'Pages', key: 'pages', width: 29 },
    { header: 'Required Checks', key: 'checks', width: 43 },
    { header: 'Evidence / Blocker', key: 'blockerEvidence', width: 48 },
  ];
  const coverageSheet = workbook.addWorksheet('03 Browser Sizes');
  const coverageHeader = setSheetFrame(coverageSheet, {
    title: '03 - Browser, Window Size, Device, Zoom, and Scaling Coverage',
    subtitle: `${coverageRows.filter((row) => row.coverageType === 'Executed visual evidence').length} saved full-page Chromium rows plus ${coverageRows.filter((row) => row.coverageType.toLowerCase().includes('public reference')).length} executed public-reference browser/viewport rows; internal compatibility remains BLOCKED or PLANNED`,
    note: 'Coverage Type describes what must be checked. Execution Status describes what was actually run. EXECUTED means evidence exists; it is not a pass. BLOCKED and PLANNED MANUAL rows have no compatibility verdict.',
    columns: coverageColumns,
    tabColor: COLORS.blue,
  });
  addRows(coverageSheet, coverageColumns, coverageRows, coverageHeader);

  const caseColumns = [
    { header: 'Case ID', key: 'id', width: 15 },
    { header: 'Status Before', key: 'statusBefore', width: 18, status: true },
    { header: 'Evidence Status', key: 'evidenceStatus', width: 18, status: true },
    { header: 'Coverage Type', key: 'coverageType', width: 18, status: true },
    { header: 'Priority', key: 'priority', width: 10, status: true },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Mode', key: 'type', width: 13 },
    { header: 'Automatable', key: 'automatable', width: 13 },
    { header: 'Title', key: 'title', width: 45 },
    { header: 'Affected Pages', key: 'pages', width: 29 },
    { header: 'Required Browser / Size Coverage', key: 'coverage', width: 38 },
    { header: 'Evidence', key: 'evidence', width: 48 },
    { header: 'Preconditions', key: 'preconditions', width: 38 },
    { header: 'Atomic Steps', key: 'steps', width: 62 },
    { header: 'Expected Result', key: 'expectedResult', width: 54 },
    { header: 'Acceptance Criteria', key: 'acceptanceCriteria', width: 52 },
    { header: 'Comparison IDs', key: 'comparisonIds', width: 20 },
    { header: 'Action ID', key: 'actionId', width: 14 },
  ];
  const caseRows = [...cases].sort(sortPriority).map((item) => ({
    id: item.id,
    statusBefore: item.statusBefore,
    evidenceStatus: item.evidenceStatus || (item.statusBefore === 'NOT TESTED' ? 'NOT TESTED' : 'SAVED EVIDENCE'),
    coverageType: item.coverageType || (item.statusBefore === 'NOT TESTED' ? 'PLANNED' : 'EXECUTED BASELINE'),
    priority: item.priority,
    category: item.category,
    type: item.type,
    automatable: item.automatable ? 'YES' : 'NO - HUMAN JUDGEMENT',
    title: item.title,
    pages: pageNames(item.affectedPages, pageById),
    coverage: 'Execute at saved Chromium widths first; then complete every applicable blocked/manual row in 03 Browser Sizes.',
    evidence: item.evidence,
    preconditions: text(item.preconditions),
    steps: caseSteps(item),
    expectedResult: item.expectedResult,
    acceptanceCriteria: text(item.acceptanceCriteria),
    comparisonIds: text(item.linkedComparisonIds, ', '),
    actionId: item.linkedActionId || '',
  }));
  const caseSheet = workbook.addWorksheet('04 Test Cases');
  const caseHeader = setSheetFrame(caseSheet, {
    title: '04 - Verification Cases',
    subtitle: `${caseRows.length} precise cases; execute P0 first, then P1, then P2 and KEEP regression cases`,
    note: 'Each case contains evidence, preconditions, atomic steps, a checkable expected result, and acceptance criteria. A case is not passed until its stated browser/size coverage is executed.',
    columns: caseColumns,
    tabColor: COLORS.purple,
  });
  addRows(caseSheet, caseColumns, caseRows, caseHeader);

  const designColumns = [
    { header: 'Record Type', key: 'recordType', width: 18 },
    { header: 'Category / Page', key: 'category', width: 27 },
    { header: 'Token / Evidence', key: 'token', width: 30 },
    { header: 'Value / URL', key: 'value', width: 58 },
    { header: 'Developer Rule / Audit Summary', key: 'developerRule', width: 59 },
    { header: 'Artifact Paths', key: 'artifacts', width: 62 },
  ];
  const designRows = makeDesignRows(report.recommendedDesignSystem || {}).map((item) => ({
    recordType: 'DESIGN BASELINE',
    category: item.category,
    token: item.token,
    value: item.value,
    developerRule: item.developerRule,
    artifacts: '',
  }));
  designRows.push({
    recordType: 'COVERAGE SCOPE',
    category: 'Executed browser evidence',
    token: 'Executed browsers',
    value: text(report.scope?.executedBrowsers, ', ') || 'Chromium saved evidence',
    developerRule: 'Executed evidence is limited to the stated browser. Do not extend it to unexecuted browsers or real devices.',
    artifacts: 'combined-report.json',
  });
  designRows.push({
    recordType: 'COVERAGE SCOPE',
    category: 'Compatibility coverage',
    token: `${report.scope?.compatibilityCoverage?.status || 'NOT TESTED'} / ${report.scope?.compatibilityCoverage?.coverageType || 'PLANNED'}`,
    value: text(report.scope?.compatibilityCoverage?.items),
    developerRule: 'Complete and record these rows before a cross-browser, real-device, scaling, or font-resilience sign-off.',
    artifacts: '03 Browser Sizes / UIUX-TC-016 / UIUX-TC-017 / UIUX-TC-018',
  });
  const publicReferenceRows = coverageRows.filter((row) => row.coverageType.toLowerCase().includes('public reference'));
  if (publicReferenceRows.length) designRows.push({
    recordType: 'EVIDENCE',
    category: 'Public reference browser matrix',
    token: `${publicReferenceRows.length} executed profiles / REVIEW`,
    value: `${new Set(publicReferenceRows.map((row) => row.browser)).size} browser engines/channels across ${new Set(publicReferenceRows.map((row) => row.viewport)).size} viewports; zero root horizontal overflow in ${publicReferenceRows.filter((row) => Number.isFinite(row.rootOverflowPx) && row.rootOverflowPx <= 1).length}/${publicReferenceRows.length} profiles.`,
    developerRule: 'Heuristic small-text, overlap, offscreen-control, lazy-image, CSP, and runtime signals remain REVIEW only. This public reference evidence is not proof that the three internal target pages work in those browsers.',
    artifacts: 'browser-matrix-reference-executed/matrix.json\nbrowser-matrix-reference-executed/matrix.csv',
  });
  (report.pages || []).forEach((page) => designRows.push({
    recordType: 'EVIDENCE',
    category: page.label,
    token: `${page.captures?.valid || 0}/${page.captures?.total || 0} valid captures`,
    value: page.url,
    developerRule: `Verdict: ${page.verdict || 'See report'}\nDistinct objective findings: ${page.findings?.distinctObjective ?? 'n/a'}\nDistinct review findings: ${page.findings?.distinctReview ?? 'n/a'}\nNo page-level overflow: ${page.captures?.noHorizontalOverflow ?? 'n/a'}/${page.captures?.total ?? 'n/a'}`,
    artifacts: [page.artifacts?.report, page.artifacts?.audit, ...(page.artifacts?.screenshots || [])].filter(Boolean).join('\n'),
  }));
  const designSheet = workbook.addWorksheet('05 Design & Evidence');
  const designHeader = setSheetFrame(designSheet, {
    title: '05 - Design Baseline and Evidence Index',
    subtitle: 'One shared UI system with product-specific accents and traceable saved evidence',
    note: 'Apply these tokens consistently. Relative artifact paths work when this workbook is shared with the full dms-uiux-review output folder; the issue evidence itself is included in the workbook and PDF.',
    columns: designColumns,
    tabColor: COLORS.green,
  });
  addRows(designSheet, designColumns, designRows, designHeader);

  workbook.worksheets.forEach((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.protection = { locked: false };
      });
    });
  });

  return { workbook, fixRows, differenceRows, caseRows, designRows };
}

function statusClass(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('mismatch') || normalized.includes('block') || normalized === 'p0') return 'bad';
  if (normalized.includes('partial') || normalized.includes('review') || normalized.includes('planned') || normalized.includes('not tested') || normalized.includes('not retested') || normalized === 'p1') return 'warn';
  if (normalized.includes('match') || normalized.includes('keep')) return 'good';
  if (normalized.includes('executed')) return 'info';
  return 'neutral';
}

function renderFixCards(fixRows, casesById) {
  return fixRows.map((row) => {
    const linkedCases = row.caseIds.split(',').map((id) => casesById.get(id.trim())).filter(Boolean);
    return `<article class="fix-card ${row.priority.toLowerCase()}">
      <div class="fix-heading">
        <div><span class="badge ${statusClass(row.releaseGate)}">${escapeHtml(row.releaseGate)}</span><span class="badge ${statusClass(row.priority)}">${escapeHtml(row.priority)}</span></div>
        <strong>${escapeHtml(row.actionId)}</strong>
      </div>
      <h3>${escapeHtml(row.problem.split('\n')[0])}</h3>
      <div class="meta"><span><b>Pages:</b> ${escapeHtml(row.pages)}</span><span><b>Owner:</b> ${escapeHtml(row.owner)}</span><span><b>Cases:</b> ${escapeHtml(row.caseIds)}</span></div>
      <div class="fix-grid">
        <div><h4>Problem and evidence</h4><p>${escapeHtml(row.problem.split('\n').slice(1).join('\n'))}</p><p class="evidence">${escapeHtml(row.evidence)}</p></div>
        <div><h4>Developer change</h4><p>${escapeHtml(row.fix)}</p></div>
        <div><h4>Done when</h4><p>${escapeHtml(row.acceptance)}</p></div>
      </div>
      ${linkedCases.length ? `<details><summary>Verification steps</summary>${linkedCases.map((testCase) => `<div class="case-mini"><b>${escapeHtml(testCase.id)} - ${escapeHtml(testCase.title)}</b><ol>${(testCase.steps || []).map((step) => `<li>${escapeHtml(step.action || step.step || text(step))}</li>`).join('')}</ol><p><b>Expected:</b> ${escapeHtml(testCase.expectedResult)}</p></div>`).join('')}</details>` : ''}
    </article>`;
  }).join('\n');
}

function renderCoverageRows(rows) {
  return rows.map((row) => `<tr>
    <td>${escapeHtml(row.id)}</td>
    <td>${escapeHtml(row.coverageType)}</td>
    <td>${escapeHtml(row.platform)}</td>
    <td>${escapeHtml(row.browser)}</td>
    <td>${escapeHtml(row.viewport)}</td>
    <td>${escapeHtml(row.zoomScale)}</td>
    <td><span class="badge ${statusClass(row.executionStatus)}">${escapeHtml(row.executionStatus)}</span></td>
    <td>${escapeHtml(row.result)}</td>
    <td>${escapeHtml(row.blockerEvidence)}</td>
  </tr>`).join('\n');
}

function renderHtml(report, cases, coverageRows, fixRows, differenceRows, sourceLabel) {
  const casesById = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const p0 = fixRows.filter((row) => row.priority === 'P0').length;
  const p1 = fixRows.filter((row) => row.priority === 'P1').length;
  const mismatch = differenceRows.filter((row) => row.status === 'MISMATCH').length;
  const partial = differenceRows.filter((row) => row.status === 'PARTIAL MATCH').length;
  const match = differenceRows.filter((row) => row.status === 'MATCH').length;
  const executedCoverage = coverageRows.filter((row) => row.executionStatus.startsWith('EXECUTED'));
  const savedViewportCoverage = executedCoverage.filter((row) => row.coverageType === 'Executed visual evidence');
  const publicReferenceCoverage = executedCoverage.filter((row) => row.coverageType.toLowerCase().includes('public reference'));
  const pendingCoverage = coverageRows.filter((row) => !row.executionStatus.startsWith('EXECUTED'));
  const publicGroups = new Map();
  publicReferenceCoverage.forEach((row) => {
    if (!publicGroups.has(row.browser)) publicGroups.set(row.browser, []);
    publicGroups.get(row.browser).push(row);
  });
  const publicBrowserSummary = [...publicGroups.entries()].map(([browser, rows]) => {
    const finite = (values) => values.filter(Number.isFinite);
    const minimumFonts = finite(rows.map((row) => row.minimumFontPx));
    const incompleteImages = finite(rows.map((row) => row.incompleteImageCount));
    const max = (values) => values.length ? Math.max(...values) : 'n/a';
    const min = (values) => values.length ? Math.min(...values) : 'n/a';
    return {
      browser,
      profiles: rows.length,
      status: [...new Set(rows.map((row) => row.referenceStatus || 'REVIEW'))].join(', '),
      zeroOverflow: rows.filter((row) => Number.isFinite(row.rootOverflowPx) && row.rootOverflowPx <= 1).length,
      viewports: rows.map((row) => row.viewport).join(', '),
      review: `min font ${min(minimumFonts)}px; max offscreen ${max(finite(rows.map((row) => row.offscreenCount)))}; max overlap ${max(finite(rows.map((row) => row.overlapCount)))}; incomplete/lazy images ${min(incompleteImages)}-${max(incompleteImages)}; max runtime signals ${max(finite(rows.map((row) => row.runtimeSignalCount)))}`,
      evidencePath: rows[0]?.evidencePath || 'Public-reference smoke supplied during review',
    };
  });
  const p2Actions = (report.actions || []).filter((action) => action.priority === 'P2').sort(sortPriority);
  const designRows = makeDesignRows(report.recommendedDesignSystem || {});
  const targetPages = (report.pages || []).filter((page) => page.role !== 'Visual reference');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DMS UI/UX Developer Fix Report</title>
<style>
:root{--ink:#0f172a;--muted:#475569;--line:#cbd5e1;--surface:#f8fafc;--navy:#172554;--blue:#2563eb;--red:#b91c1c;--red-bg:#fee2e2;--amber:#92400e;--amber-bg:#fef3c7;--green:#166534;--green-bg:#dcfce7;--info:#1e3a8a;--info-bg:#dbeafe}
*{box-sizing:border-box}body{margin:0;font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#e2e8f0}.shell{width:min(1180px,calc(100% - 32px));margin:auto}.cover{padding:48px 0 36px;color:white;background:linear-gradient(135deg,#0f172a,#172554 58%,#1d4ed8)}.kicker{text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:800;color:#bfdbfe}.cover h1{max-width:840px;margin:8px 0 12px;font-size:38px;line-height:1.1}.cover p{max-width:900px;color:#dbeafe}.release{display:inline-flex;margin:13px 0;padding:9px 13px;border:1px solid #fca5a5;border-radius:9px;background:#7f1d1d;font-weight:800}.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:24px}.stat{padding:14px;border:1px solid #ffffff35;border-radius:11px;background:#ffffff12}.stat b{display:block;font-size:25px}.stat span{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#dbeafe}nav{position:sticky;top:0;z-index:2;background:white;border-bottom:1px solid var(--line)}nav .shell{display:flex;gap:18px;overflow:auto;padding:11px 0}nav a{white-space:nowrap;color:var(--navy);font-weight:700;text-decoration:none}main{background:white}section{padding:38px 0;border-bottom:1px solid #e2e8f0}.section-head{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:20px}.section-head h2{margin:2px 0;font-size:27px}.section-head p{max-width:630px;margin:0;color:var(--muted)}.legend{display:flex;gap:8px;flex-wrap:wrap}.badge{display:inline-block;margin-right:6px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.03em}.badge.bad{color:#991b1b;background:var(--red-bg)}.badge.warn{color:var(--amber);background:var(--amber-bg)}.badge.good{color:var(--green);background:var(--green-bg)}.badge.info{color:var(--info);background:var(--info-bg)}.badge.neutral{color:#334155;background:#e2e8f0}.fix-stack{display:grid;gap:16px}.fix-card{border:1px solid var(--line);border-left:6px solid #f59e0b;border-radius:12px;padding:19px;background:white;box-shadow:0 8px 24px #0f172a0a}.fix-card.p0{border-left-color:#dc2626}.fix-card h3{margin:10px 0 7px;font-size:20px}.fix-heading,.meta{display:flex;align-items:center;justify-content:space-between;gap:12px}.meta{justify-content:flex-start;flex-wrap:wrap;color:var(--muted);font-size:12px}.fix-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:15px;margin-top:15px}.fix-grid>div{padding:13px;border-radius:9px;background:var(--surface)}h4{margin:0 0 7px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--navy)}p{white-space:pre-line}.evidence{color:var(--muted);font-size:12px}details{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}summary{cursor:pointer;font-weight:800;color:var(--blue)}.case-mini{padding-top:10px}.case-mini ol{columns:2;column-gap:32px}.callout{padding:14px 16px;border-left:5px solid var(--blue);border-radius:8px;background:var(--info-bg);color:#172554}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px}table{width:100%;border-collapse:collapse;font-size:12px}th{position:sticky;top:0;padding:10px;text-align:left;color:white;background:var(--ink)}td{vertical-align:top;padding:9px;border-bottom:1px solid #e2e8f0;white-space:pre-line}tr:nth-child(even) td{background:#f8fafc}.compact td,.compact th{padding:7px}.difference-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.difference{padding:13px;border:1px solid var(--line);border-radius:9px}.difference h3{margin:7px 0;font-size:15px}.difference p{margin:5px 0;color:var(--muted)}.next-list{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.next-card{padding:14px;border:1px solid var(--line);border-radius:9px;background:var(--surface)}.next-card h3{margin:7px 0}.spec-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.spec{padding:12px;border:1px solid var(--line);border-radius:8px}.spec b{display:block;color:var(--navy)}.spec small{display:block;color:var(--muted)}footer{padding:28px 0;background:#0f172a;color:#cbd5e1}.page-break{break-before:page}
@media(max-width:800px){.stats,.fix-grid,.difference-grid,.next-list,.spec-grid{grid-template-columns:1fr}.cover h1{font-size:31px}.section-head{display:block}.case-mini ol{columns:1}}
@page{size:A4 landscape}
@media print{body{background:white;font-size:10px}.shell{width:100%;max-width:none}.cover{padding:22px 0;background:#172554!important}.cover h1{font-size:27px}.stats{grid-template-columns:repeat(6,1fr);margin-top:12px}.stat{padding:8px}.stat b{font-size:18px}nav{display:none}section{padding:22px 0}.section-head{margin-bottom:12px}.section-head h2{font-size:20px}.fix-card,.next-card,.difference,.spec{break-inside:avoid;box-shadow:none}.fix-card{padding:12px;margin:0}.fix-grid{gap:8px}.fix-grid>div{padding:8px}details{display:block}details>summary{display:none}details>*{display:block}.case-mini ol{columns:2}table{font-size:8px}.table-wrap{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}a{color:inherit;text-decoration:none}footer{display:none}}
</style>
</head>
<body>
<header class="cover"><div class="shell">
  <div class="kicker">Developer handoff - UI/UX audit comparison</div>
  <h1>DMS UI/UX fixes with exact evidence and acceptance criteria</h1>
  <div class="release">${escapeHtml(report.decisionSummary?.releaseDecision || 'FIX BEFORE UI/UX SIGN-OFF')}</div>
  <p>Use this document to implement and verify the highest-risk frontend changes. It separates saved evidence from required browser/device coverage, so an unexecuted check can never look like a pass.</p>
  <div class="stats">
    <div class="stat"><b>${p0}</b><span>P0 blockers</span></div><div class="stat"><b>${p1}</b><span>P1 fixes</span></div><div class="stat"><b>${mismatch}</b><span>Mismatches</span></div><div class="stat"><b>${partial}</b><span>Partial</span></div><div class="stat"><b>${match}</b><span>Keep</span></div><div class="stat"><b>${executedCoverage.length}/${coverageRows.length}</b><span>Coverage executed</span></div>
  </div>
</div></header>
<nav><div class="shell"><a href="#fix">Fix first</a><a href="#coverage">Browser & sizes</a><a href="#differences">Differences</a><a href="#next">P2 actions</a><a href="#cases">Cases</a><a href="#design">Design baseline</a><a href="#evidence">Evidence</a></div></nav>
<main>
<section id="fix"><div class="shell">
  <div class="section-head"><div><div class="kicker" style="color:#2563eb">Release work</div><h2>Fix these P0 and P1 items first</h2></div><p>P0 blocks UI/UX release. P1 must be resolved before sign-off. Every card contains the observed problem, exact change, owner, and acceptance condition.</p></div>
  <div class="legend"><span class="badge bad">P0 / BLOCKS RELEASE</span><span class="badge warn">P1 / FIX BEFORE SIGN-OFF</span><span class="badge info">NOT RETESTED UNTIL EVIDENCE EXISTS</span></div>
  <div class="fix-stack" style="margin-top:14px">${renderFixCards(fixRows, casesById)}</div>
</div></section>
<section id="coverage" class="page-break"><div class="shell">
  <div class="section-head"><div><div class="kicker" style="color:#2563eb">Coverage truth</div><h2>Browser, window size, device, zoom, and scaling matrix</h2></div><p><b>Coverage Type</b> says what must be checked. <b>Execution Status</b> says what actually ran. Executed evidence is not automatically a pass.</p></div>
  <div class="callout"><b>Current limitation:</b> ${savedViewportCoverage.length} saved full-page Chromium rows and ${publicReferenceCoverage.length} public-reference browser/viewport rows have evidence. The public matrix is REVIEW evidence only. ${pendingCoverage.length} internal cross-browser, real-device, zoom, breakpoint, or Windows-scaling rows remain blocked or planned because the internal targets timed out.</div>
  <h3>Executed saved full-page evidence</h3><div class="table-wrap"><table><thead><tr><th>ID</th><th>Type</th><th>Platform</th><th>Browser</th><th>Viewport</th><th>Scale</th><th>Status</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${renderCoverageRows(savedViewportCoverage)}</tbody></table></div>
  <h3>Executed public reference matrix - concise browser summary</h3><div class="table-wrap"><table><thead><tr><th>Browser / engine</th><th>Profiles</th><th>Status</th><th>Root overflow</th><th>Heuristic review signals</th><th>Evidence</th></tr></thead><tbody>${publicBrowserSummary.map((row) => `<tr><td>${escapeHtml(row.browser)}</td><td>${escapeHtml(row.profiles)}</td><td><span class="badge ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td><td>${escapeHtml(`${row.zeroOverflow}/${row.profiles} profiles at 0-1px`)}</td><td>${escapeHtml(row.review)}</td><td>${escapeHtml(row.evidencePath)}</td></tr>`).join('')}</tbody></table></div>
  <h3>Required coverage - no verdict yet</h3><div class="table-wrap"><table><thead><tr><th>ID</th><th>Type</th><th>Platform</th><th>Browser</th><th>Viewport</th><th>Scale</th><th>Status</th><th>Result</th><th>Blocker / requirement</th></tr></thead><tbody>${renderCoverageRows(pendingCoverage)}</tbody></table></div>
</div></section>
<section id="differences" class="page-break"><div class="shell">
  <div class="section-head"><div><div class="kicker" style="color:#2563eb">Comparison</div><h2>Clear difference index</h2></div><p>Red requires a change, amber requires review or additional evidence, and green is behavior to protect.</p></div>
  <div class="difference-grid">${differenceRows.map((row) => `<article class="difference"><span class="badge ${statusClass(row.status)}">${escapeHtml(row.status)}</span><span class="badge ${statusClass(row.priority)}">${escapeHtml(row.priority)}</span><h3>${escapeHtml(row.id)} - ${escapeHtml(row.area)}</h3><p><b>Gap:</b> ${escapeHtml(row.gap)}</p><p><b>Fix/keep:</b> ${escapeHtml(row.fix)}</p><p><b>Trace:</b> ${escapeHtml(row.actionId || 'No fix action')} / ${escapeHtml(row.caseId)}</p></article>`).join('')}</div>
</div></section>
<section id="next"><div class="shell">
  <div class="section-head"><div><div class="kicker" style="color:#2563eb">After release blockers</div><h2>P2 improvement actions</h2></div><p>Complete these after P0/P1 unless product ownership changes the priority.</p></div>
  <div class="next-list">${p2Actions.map((action) => `<article class="next-card"><span class="badge neutral">${escapeHtml(action.priority)}</span><b>${escapeHtml(action.id)}</b><h3>${escapeHtml(action.title)}</h3><p><b>Fix:</b> ${escapeHtml(action.fix)}</p><p><b>Done when:</b> ${escapeHtml(action.acceptance)}</p></article>`).join('')}</div>
</div></section>
<section id="cases" class="page-break"><div class="shell">
  <div class="section-head"><div><div class="kicker" style="color:#2563eb">QA verification</div><h2>${cases.length} cases, prioritized for retest</h2></div><p>The Excel workbook contains every atomic step. The index below keeps this PDF compact while preserving exact expected results.</p></div>
  <div class="table-wrap"><table class="compact"><thead><tr><th>ID</th><th>Priority</th><th>Before</th><th>Evidence</th><th>Coverage</th><th>Title</th><th>Pages</th><th>Expected result</th><th>Action</th></tr></thead><tbody>${[...cases].sort(sortPriority).map((item) => `<tr><td>${escapeHtml(item.id)}</td><td><span class="badge ${statusClass(item.priority)}">${escapeHtml(item.priority)}</span></td><td><span class="badge ${statusClass(item.statusBefore)}">${escapeHtml(item.statusBefore)}</span></td><td><span class="badge ${statusClass(item.evidenceStatus || (item.statusBefore === 'NOT TESTED' ? 'NOT TESTED' : 'SAVED EVIDENCE'))}">${escapeHtml(item.evidenceStatus || (item.statusBefore === 'NOT TESTED' ? 'NOT TESTED' : 'SAVED EVIDENCE'))}</span></td><td>${escapeHtml(item.coverageType || (item.statusBefore === 'NOT TESTED' ? 'PLANNED' : 'EXECUTED BASELINE'))}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.affectedPages.map(slugLabel).join(', '))}</td><td>${escapeHtml(item.expectedResult)}</td><td>${escapeHtml(item.linkedActionId || '')}</td></tr>`).join('')}</tbody></table></div>
</div></section>
<section id="design" class="page-break"><div class="shell">
  <div class="section-head"><div><div class="kicker" style="color:#2563eb">Frontend baseline</div><h2>Fonts, widths, colors, spacing, and controls</h2></div><p>Use one shared construction across all three pages and change only the approved product accent.</p></div>
  <div class="spec-grid">${designRows.map((item) => `<article class="spec"><small>${escapeHtml(item.category)}</small><b>${escapeHtml(item.token)}</b><span>${escapeHtml(item.value)}</span></article>`).join('')}</div>
</div></section>
<section id="evidence"><div class="shell">
  <div class="section-head"><div><div class="kicker" style="color:#2563eb">Traceability</div><h2>Evidence sources and limitations</h2></div><p>Share the full output folder with the workbook and PDF if developers need to open relative screenshots and detailed audit files.</p></div>
  <div class="table-wrap"><table><thead><tr><th>Page</th><th>URL</th><th>Captures</th><th>Objective findings</th><th>Review findings</th><th>Audit artifact</th></tr></thead><tbody>${(report.pages || []).map((page) => `<tr><td>${escapeHtml(page.label)}</td><td>${escapeHtml(page.url)}</td><td>${escapeHtml(`${page.captures?.valid || 0}/${page.captures?.total || 0} valid`)}</td><td>${escapeHtml(page.findings?.distinctObjective ?? 'n/a')}</td><td>${escapeHtml(page.findings?.distinctReview ?? 'n/a')}</td><td>${escapeHtml(page.artifacts?.audit || '')}</td></tr>`).join('')}</tbody></table></div>
  <div class="callout" style="margin-top:14px"><b>Evidence source:</b> ${escapeHtml(sourceLabel)}. <b>Generated:</b> ${escapeHtml(report.generatedAt)}. <b>Limit:</b> saved evidence covers the light theme and initial page state. Real devices, non-Chromium engines, Windows display scaling, breakpoint boundaries, and zoom/reflow need the rows above to be executed when the internal environment is reachable.</div>
  <h3>Target pages</h3><ul>${targetPages.map((page) => `<li><b>${escapeHtml(page.label)}:</b> ${escapeHtml(page.url)}</li>`).join('')}</ul>
</div></section>
</main>
<footer><div class="shell">DMS UI/UX Developer Fix Report - generated from saved rendered evidence. Reference: ${escapeHtml(report.reference || 'https://ledgers.cloud/')}</div></footer>
</body></html>`;
}

async function validateWorkbook(filePath, expected) {
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.readFile(filePath);
  const expectedNames = ['01 Fix First', '02 Differences', '03 Browser Sizes', '04 Test Cases', '05 Design & Evidence'];
  const actualNames = loaded.worksheets.map((sheet) => sheet.name);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Unexpected workbook sheets: ${actualNames.join(', ')}`);
  }
  for (const [sheetName, minimumRows] of Object.entries(expected.minimumRows)) {
    const sheet = loaded.getWorksheet(sheetName);
    if (!sheet || sheet.actualRowCount < minimumRows) {
      throw new Error(`${sheetName} has ${sheet?.actualRowCount || 0} rows; expected at least ${minimumRows}.`);
    }
  }
  const formulaCells = [];
  loaded.worksheets.forEach((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
    if (cell.type === ExcelJS.ValueType.Formula) formulaCells.push(`${sheet.name}!${cell.address}`);
    if (typeof cell.value === 'string' && cell.value.length > 32767) {
      throw new Error(`${sheet.name}!${cell.address} exceeds Excel's cell text limit.`);
    }
  })));
  if (formulaCells.length) throw new Error(`Unexpected formulas found: ${formulaCells.join(', ')}`);
  return { sheets: actualNames.length, names: actualNames };
}

function validateTraceability(report, cases, fixRows, coverageRows) {
  const caseIds = new Set(cases.map((item) => item.id));
  const actionIds = new Set((report.actions || []).map((item) => item.id));
  const errors = [];
  const coverageIds = new Set(coverageRows.map((row) => row.id));
  if (coverageIds.size !== coverageRows.length) errors.push('Coverage matrix contains duplicate IDs.');
  (report.statusComparisons || []).filter((item) => item.status === 'MISMATCH').forEach((item) => {
    if (!item.caseId || !caseIds.has(item.caseId)) errors.push(`${item.id} has no valid case.`);
    if (!item.linkedActionId || !actionIds.has(item.linkedActionId)) errors.push(`${item.id} has no valid action.`);
  });
  (report.actions || []).filter((item) => ['P0', 'P1'].includes(item.priority)).forEach((item) => {
    if (!fixRows.some((row) => row.actionId === item.id)) errors.push(`${item.id} is missing from Fix First.`);
  });
  coverageRows.filter((row) => !row.executionStatus.startsWith('EXECUTED')).forEach((row) => {
    if (/\bpass(?:ed)?\b/i.test(row.result) && !/not.*pass/i.test(row.result)) {
      errors.push(`${row.id} gives an unexecuted pass verdict.`);
    }
  });
  cases.filter((item) => item.statusBefore === 'NOT TESTED').forEach((item) => {
    if (item.evidenceStatus !== 'NOT TESTED') errors.push(`${item.id} must retain evidenceStatus NOT TESTED.`);
    if (item.coverageType !== 'PLANNED') errors.push(`${item.id} must retain coverageType PLANNED.`);
  });
  if (coverageRows.some((row) => row.coverageType === 'Executed public reference matrix')) {
    if (!fs.existsSync(referenceMatrixPath)) errors.push('Public reference matrix JSON is missing.');
    if (!fs.existsSync(referenceMatrixCsvPath)) errors.push('Public reference matrix CSV is missing.');
  }
  (report.pages || []).forEach((page) => {
    [page.artifacts?.report, page.artifacts?.audit, ...(page.artifacts?.screenshots || [])].filter(Boolean).forEach((relativePath) => {
      if (!fs.existsSync(path.join(outputRoot, relativePath))) errors.push(`Missing artifact: ${relativePath}`);
    });
  });
  if (errors.length) throw new Error(`Handoff traceability failed:\n- ${errors.join('\n- ')}`);
}

async function buildPdf(inputHtmlPath, outputPdfPath) {
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(pathToFileURL(inputHtmlPath).href, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      document.querySelectorAll('details').forEach((details) => { details.open = true; });
    });
    const printState = await page.evaluate(() => ({
      details: [...document.querySelectorAll('details')].every((item) => item.open),
      text: document.body.innerText,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    if (!printState.details) throw new Error('Not all verification details were expanded before PDF generation.');
    if (printState.horizontalOverflow) throw new Error('Developer report has horizontal overflow in print mode.');
    await page.pdf({
      path: outputPdfPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      scale: 0.88,
      margin: { top: '14mm', right: '9mm', bottom: '15mm', left: '9mm' },
      headerTemplate: '<div style="width:100%;padding:0 9mm;font:8px Arial;color:#475569">DMS UI/UX Developer Fix Report</div>',
      footerTemplate: '<div style="width:100%;padding:0 9mm;font:8px Arial;color:#475569;display:flex;justify-content:space-between"><span>Saved audit evidence - developer handoff</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
    });
    return { pageErrors, printText: printState.text };
  } finally {
    await browser.close();
  }
}

function validatePdf(filePath, requiredText, printText, pageErrors) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Generated PDF has an invalid signature.');
  if (buffer.length < 20_000) throw new Error(`Generated PDF is unexpectedly small (${buffer.length} bytes).`);
  const missing = requiredText.filter((item) => !printText.includes(item));
  if (missing.length) throw new Error(`PDF source is missing required trace IDs: ${missing.join(', ')}`);
  if (pageErrors.length) throw new Error(`PDF page errors: ${pageErrors.join('; ')}`);
  const approximatePages = (buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  if (approximatePages < 2) throw new Error(`Generated PDF appears to have only ${approximatePages} page object(s).`);
  return { bytes: buffer.length, approximatePages };
}

async function main() {
  if (!fs.existsSync(reportPath)) throw new Error(`Missing source report: ${reportPath}`);
  const report = readJson(reportPath);
  const caseSourcePath = fs.existsSync(verificationCasesPath)
    ? verificationCasesPath
    : (fs.existsSync(combinedCasesPath) ? combinedCasesPath : null);
  const caseDocument = caseSourcePath ? readJson(caseSourcePath) : null;
  const cases = extractCases(caseDocument, report);
  const caseSourceLabel = caseSourcePath === verificationCasesPath
    ? 'combined-report.json + verification-cases.json'
    : (caseSourcePath === combinedCasesPath
      ? 'combined-report.json + combined-cases.json (verification-cases.json was not present)'
      : 'combined-report.json verificationCases (separate case files were not present)');
  const referenceMatrix = fs.existsSync(referenceMatrixPath) ? readJson(referenceMatrixPath) : null;
  const sourceLabel = referenceMatrix?.results?.length
    ? `${caseSourceLabel} + browser-matrix-reference-executed/matrix.json (${referenceMatrix.results.length} public reference profiles)`
    : caseSourceLabel;
  const targetPageNames = (report.pages || []).filter((page) => page.role !== 'Visual reference').map((page) => page.label);
  const referencePageName = (report.pages || []).find((page) => page.role === 'Visual reference')?.label || 'Ledgers.cloud';
  const coverageRows = makeCoverageRows(targetPageNames, referencePageName, referenceMatrix);
  const { workbook, fixRows, differenceRows, caseRows, designRows } = createWorkbook(report, cases, coverageRows, sourceLabel);
  validateTraceability(report, cases, fixRows, coverageRows);

  const html = renderHtml(report, cases, coverageRows, fixRows, differenceRows, sourceLabel);
  if (/\b(?:undefined|NaN)\b/.test(html)) throw new Error('Developer HTML contains undefined or NaN text.');
  fs.writeFileSync(htmlPath, html, 'utf8');
  await workbook.xlsx.writeFile(workbookPath);

  const workbookValidation = await validateWorkbook(workbookPath, {
    minimumRows: {
      '01 Fix First': 4 + fixRows.length,
      '02 Differences': 4 + differenceRows.length,
      '03 Browser Sizes': 4 + coverageRows.length,
      '04 Test Cases': 4 + caseRows.length,
      '05 Design & Evidence': 4 + designRows.length,
    },
  });
  const pdfBuild = await buildPdf(htmlPath, pdfPath);
  const requiredTraceIds = [
    ...(report.actions || []).filter((item) => ['P0', 'P1'].includes(item.priority)).map((item) => item.id),
    ...(report.statusComparisons || []).filter((item) => item.status === 'MISMATCH').map((item) => item.id),
    ...cases.map((item) => item.id),
  ];
  const pdfValidation = validatePdf(pdfPath, requiredTraceIds, pdfBuild.printText, pdfBuild.pageErrors);

  const result = {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: sourceLabel,
    outputs: {
      workbook: { path: workbookPath, bytes: fs.statSync(workbookPath).size },
      html: { path: htmlPath, bytes: fs.statSync(htmlPath).size },
      pdf: { path: pdfPath, ...pdfValidation },
    },
    counts: {
      p0Fixes: fixRows.filter((row) => row.priority === 'P0').length,
      p1Fixes: fixRows.filter((row) => row.priority === 'P1').length,
      differences: differenceRows.length,
      cases: cases.length,
      coverageRows: coverageRows.length,
      executedCoverageRows: coverageRows.filter((row) => row.executionStatus.startsWith('EXECUTED')).length,
      publicReferenceMatrixProfiles: coverageRows.filter((row) => row.coverageType === 'Executed public reference matrix').length,
      unexecutedCoverageRows: coverageRows.filter((row) => !row.executionStatus.startsWith('EXECUTED')).length,
      designAndEvidenceRows: designRows.length,
      workbookSheets: workbookValidation.sheets,
    },
    validation: {
      traceability: 'passed',
      unexecutedRowsNotPassed: 'passed',
      workbookReload: 'passed',
      workbookSheetNames: workbookValidation.names,
      pdfSignatureAndTraceIds: 'passed',
      publicReferenceMatrixEvidence: referenceMatrix?.results?.length ? 'included' : 'fallback smoke only',
    },
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
