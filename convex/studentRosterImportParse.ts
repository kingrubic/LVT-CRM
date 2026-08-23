"use node";

import { v } from "convex/values";
import * as XLSX from "xlsx";
import { internalAction } from "./_generated/server";
import { ROSTER_IMPORT_MAX_BYTES, rowsFromRosterMatrix } from "./studentRosterImportSheet";

export const parseStorageXlsx = internalAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) return { ok: false as const, message: "IMPORT_UPLOAD_NOT_FOUND", rows: [] as const };
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (!buffer.length) return { ok: false as const, message: "IMPORT_FILE_EMPTY", rows: [] as const };
    if (buffer.length > ROSTER_IMPORT_MAX_BYTES) {
      return { ok: false as const, message: "IMPORT_FILE_TOO_LARGE", rows: [] as const };
    }
    try {
      const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return { ok: false as const, message: "INVALID_IMPORT_HEADERS", rows: [] as const };
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];
      const parsed = rowsFromRosterMatrix(matrix);
      if (!parsed.headersOk) return { ok: false as const, message: "INVALID_IMPORT_HEADERS", rows: [] as const };
      return { ok: true as const, message: null, rows: parsed.rows };
    } catch {
      return { ok: false as const, message: "INVALID_IMPORT_FILE", rows: [] as const };
    }
  },
});
