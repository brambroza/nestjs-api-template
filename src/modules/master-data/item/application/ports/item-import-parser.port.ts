import type { ItemImportRow } from '../../domain';

export const ITEM_IMPORT_PARSER = Symbol('ITEM_IMPORT_PARSER');

/**
 * Turns an uploaded file into rows. The xlsx implementation lives in
 * infrastructure; a CSV one can be added without touching the use case
 * or the controller.
 */
export interface ItemImportRowsParser {
  parse(buffer: Buffer): Promise<readonly ItemImportRow[]>;
}
