import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import {
  ImportFileInvalidError,
  ImportTooLargeError,
  MAX_IMPORT_ROWS,
  type ItemImportRow,
} from '../domain';

/**
 * Header aliases, matched case-insensitively after stripping spaces,
 * underscores and dashes — "Default UOM Code", "default_uom_code" and
 * "uom" all map to defaultUomCode.
 */
const COLUMN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  sku: ['sku', 'itemcode', 'code'],
  name: ['name', 'itemname', 'description1'],
  defaultUomCode: ['defaultuomcode', 'uom', 'uomcode', 'unit', 'baseuom'],
  description: ['description', 'desc', 'remark', 'remarks'],
  categoryCode: ['categorycode', 'category', 'group'],
  trackingPolicy: ['trackingpolicy', 'tracking', 'lotserial'],
  shelfLifeDays: ['shelflifedays', 'shelflife', 'expirydays'],
};
const REQUIRED: readonly (keyof typeof COLUMN_ALIASES)[] = [
  'sku',
  'name',
  'defaultUomCode',
];

function normaliseHeader(raw: string): string {
  return raw.toLowerCase().replace(/[\s_\-.]/g, '');
}

/**
 * Reads the first worksheet of an .xlsx into ItemImportRow[]. Fully
 * blank rows are skipped; the row cap is enforced here too so a
 * 200k-row sheet is refused before it is materialised.
 */
@Injectable()
export class XlsxItemRowsParser {
  async parse(buffer: Buffer): Promise<readonly ItemImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (err) {
      throw new ImportFileInvalidError(
        `not a readable .xlsx file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new ImportFileInvalidError('workbook has no worksheet');
    }

    const columns = this.mapHeader(sheet);
    const rows: ItemImportRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const text = (key: keyof typeof COLUMN_ALIASES): string => {
        const col = columns.get(key);
        if (col === undefined) return '';
        return row.getCell(col).text.trim();
      };
      const sku = text('sku');
      const name = text('name');
      const uom = text('defaultUomCode');
      if (sku === '' && name === '' && uom === '') return; // blank row
      rows.push({
        rowNumber,
        sku,
        name,
        defaultUomCode: uom,
        description: text('description') || null,
        categoryCode: text('categoryCode') || null,
        trackingPolicy: text('trackingPolicy') || null,
        shelfLifeDays: text('shelfLifeDays') || null,
      });
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new ImportTooLargeError(rows.length);
      }
    });
    return rows;
  }

  private mapHeader(sheet: ExcelJS.Worksheet): ReadonlyMap<string, number> {
    const header = sheet.getRow(1);
    const found = new Map<string, number>();
    header.eachCell((cell, colNumber) => {
      const norm = normaliseHeader(cell.text);
      for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (!found.has(key) && aliases.includes(norm)) {
          found.set(key, colNumber);
        }
      }
    });
    const missing = REQUIRED.filter((k) => !found.has(k));
    if (missing.length > 0) {
      throw new ImportFileInvalidError(
        `header row is missing required column(s): ${missing.join(', ')}`,
      );
    }
    return found;
  }
}
