"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";
import * as XLSX from "xlsx";
import { internalAction } from "./_generated/server";
import {
  ATTENDANCE_IMPORT_MAX_BYTES,
  ATTENDANCE_IMPORT_MAX_SHEETS,
  inspectAttendanceWorkbook,
  rowsFromMappedAttendanceMatrix,
  type AttendanceColumnKey,
} from "./attendanceImportSheet";

export const inspectStorageXlsx = internalAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) return { ok: false as const, message: "IMPORT_UPLOAD_NOT_FOUND" };
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (!buffer.length) return { ok: false as const, message: "IMPORT_FILE_EMPTY" };
    if (buffer.length > ATTENDANCE_IMPORT_MAX_BYTES) return { ok: false as const, message: "IMPORT_FILE_TOO_LARGE" };
    try {
      const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
      const sheetNames = workbook.SheetNames.slice(0, ATTENDANCE_IMPORT_MAX_SHEETS);
      const sheets: Record<string, unknown[][]> = {};
      for (const name of sheetNames) {
        sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
          header: 1,
          defval: "",
          raw: false,
        }) as unknown[][];
      }
      const checksum = createHash("sha256").update(buffer).digest("hex");
      return {
        ok: true as const,
        checksum,
        inspect: inspectAttendanceWorkbook({ sheetNames, sheets }),
        sheets,
      };
    } catch {
      return { ok: false as const, message: "INVALID_IMPORT_FILE" };
    }
  },
});

export const parseMappedStorageXlsx = internalAction({
  args: {
    storageId: v.id("_storage"),
    sheetName: v.string(),
    headerRowIndex: v.number(),
    mapping: v.object({
      studentCode: v.optional(v.string()),
      studentName: v.optional(v.string()),
      classCode: v.optional(v.string()),
      observedAt: v.optional(v.string()),
      sourceStatus: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) return { ok: false as const, message: "IMPORT_UPLOAD_NOT_FOUND", rows: [] as const };
    const buffer = Buffer.from(await blob.arrayBuffer());
    try {
      const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
      const sheet = workbook.Sheets[args.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
      return {
        ok: true as const,
        rows: rowsFromMappedAttendanceMatrix(matrix, {
          headerRowIndex: args.headerRowIndex,
          mapping: args.mapping as Partial<Record<AttendanceColumnKey, string>>,
        }),
      };
    } catch {
      return { ok: false as const, message: "INVALID_IMPORT_FILE", rows: [] as const };
    }
  },
});
