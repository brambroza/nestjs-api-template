import ExcelJS from 'exceljs';

import { ImportFileInvalidError } from '../domain';

import { XlsxItemRowsParser } from './xlsx-item-rows.parser';

async function workbook(
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Items');
  ws.addRow([...header]);
  for (const r of rows) ws.addRow([...r]);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

describe('XlsxItemRowsParser', () => {
  const parser = new XlsxItemRowsParser();

  it('maps aliased headers, keeps spreadsheet row numbers, skips blank rows', async () => {
    const buf = await workbook(
      [
        'SKU',
        'Item Name',
        'Default UOM Code',
        'Category',
        'Tracking',
        'Shelf Life Days',
        'Remarks',
      ],
      [
        ['A-1', 'Alpha', 'PCS', 'RM', 'LOT', 90, 'first'],
        [null, null, null, null, null, null, null],
        ['A-2', 'Beta', 'KG', null, null, null, null],
      ],
    );
    const rows = await parser.parse(buf);
    expect(rows).toEqual([
      {
        rowNumber: 2,
        sku: 'A-1',
        name: 'Alpha',
        defaultUomCode: 'PCS',
        description: 'first',
        categoryCode: 'RM',
        trackingPolicy: 'LOT',
        shelfLifeDays: '90',
      },
      {
        rowNumber: 4,
        sku: 'A-2',
        name: 'Beta',
        defaultUomCode: 'KG',
        description: null,
        categoryCode: null,
        trackingPolicy: null,
        shelfLifeDays: null,
      },
    ]);
  });

  it('rejects a sheet without the required columns', async () => {
    const buf = await workbook(['sku', 'name'], [['A', 'B']]);
    await expect(parser.parse(buf)).rejects.toThrow(ImportFileInvalidError);
  });

  it('rejects a non-xlsx buffer', async () => {
    await expect(parser.parse(Buffer.from('sku,name\nA,B'))).rejects.toThrow(
      ImportFileInvalidError,
    );
  });
});
