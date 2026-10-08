import test from 'node:test';
import assert from 'node:assert/strict';

import ExcelJS from 'exceljs';

test('ExcelJS remains functional with the patched UUID dependency override', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Audit');
  sheet.columns = [
    { header: 'Check', key: 'check', width: 24 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  sheet.addRow({ check: 'Framework setup', status: 'PASS' });
  sheet.addConditionalFormatting({
    ref: 'B2',
    rules: [{
      type: 'cellIs',
      operator: 'equal',
      formulae: ['"PASS"'],
      style: { font: { bold: true } },
    }],
  });

  const bytes = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  assert.equal(reopened.getWorksheet('Audit').getCell('B2').value, 'PASS');
});
