import { v } from "convex/values";
import { anyApi } from "convex/server";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  applyUnconfirmedNameMatchGate,
  decidePublishedDateAction,
  normalizeCameraStatus,
  PRESENCE_POLICY_POSITIVE,
  reconcileAttendanceRows,
} from "./attendanceImportValidate";
import { ATTENDANCE_IMPORT_MAX_BYTES, ATTENDANCE_IMPORT_TTL_MS } from "./attendanceImportSheet";
import {
  applyPublicationPolicy,
  attendanceImportPublishResult,
  planAttendanceImportWrites,
} from "./studentAttendancePolicy";
import {
  assertClassSupervisor,
  homeroomActorOrThrow,
  writeAudit,
} from "./homeroomContext";
import { enrollmentsCoveringDate } from "./homeroomCatalog";
import { assertYmd } from "./homeroomTime";
import type { DbCtx } from "./lib";
import { assertImportUploadUsable } from "./userImportPolicy";
import { assertRosterUploadMatchesClass, assertStoredImportMetadata } from "./studentRosterImportValidate";

const internal = anyApi;

const mappingValidator = v.object({
  studentCode: v.optional(v.string()),
  studentName: v.optional(v.string()),
  classCode: v.optional(v.string()),
  observedAt: v.optional(v.string()),
  sourceStatus: v.optional(v.string()),
});

export const generateUploadUrl = mutation({
  args: { classId: v.string(), attendanceDate: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    await assertClassSupervisor(ctx, actor, args.classId, assertYmd(args.attendanceDate));
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    schoolYearId: v.string(),
    classId: v.string(),
    attendanceDate: v.string(),
    presencePolicy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, actor } = await homeroomActorOrThrow(ctx);
    const attendanceDate = assertYmd(args.attendanceDate);
    const klass = await assertClassSupervisor(ctx, actor, args.classId, attendanceDate);
    if (klass.schoolYearId !== args.schoolYearId) throw new Error("ENROLLMENT_YEAR_MISMATCH");
    const stored = await ctx.db.system.get("_storage", args.storageId);
    assertStoredImportMetadata(stored, { fileSize: args.fileSize, maxBytes: ATTENDANCE_IMPORT_MAX_BYTES });
    const fileName = args.fileName.trim();
    if (!fileName.toLowerCase().endsWith(".xlsx")) throw new Error("INVALID_IMPORT_FILE");
    const now = Date.now();
    const uploadId = await ctx.db.insert("attendanceImportUploads", {
      schoolYearId: args.schoolYearId,
      classId: args.classId,
      attendanceDate,
      sourceKind: "camera_excel",
      fileName,
      fileSize: args.fileSize,
      checksum: "pending",
      storageId: args.storageId,
      uploadedBy: String(user._id),
      columnMapping: {},
      presencePolicy: args.presencePolicy || PRESENCE_POLICY_POSITIVE,
      status: "uploaded",
      rowCount: 0,
      matchedCount: 0,
      warningCount: 0,
      errorCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ATTENDANCE_IMPORT_TTL_MS,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "attendanceImport.upload",
      details: JSON.stringify({ uploadId, attendanceDate }),
    });
    return { uploadId };
  },
});

export const inspectColumns = action({
  args: { uploadId: v.string() },
  handler: async (ctx, args) => {
    const upload = await ctx.runQuery(internal.attendanceImport.getUploadInternal, { uploadId: args.uploadId });
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    const inspected = await ctx.runAction(internal.attendanceImportParse.inspectStorageXlsx, {
      storageId: upload.storageId,
    });
    if (!inspected.ok) throw new Error(inspected.message || "INVALID_IMPORT_FILE");
    await ctx.runMutation(internal.attendanceImport.patchChecksumInternal, {
      uploadId: args.uploadId,
      checksum: inspected.checksum,
    });
    return inspected.inspect;
  },
});

export const validate = action({
  args: {
    uploadId: v.string(),
    sheetName: v.string(),
    headerRowIndex: v.number(),
    mapping: mappingValidator,
    confirmNameMatches: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.runQuery(internal.attendanceImport.getUploadInternal, { uploadId: args.uploadId });
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    const parsed = await ctx.runAction(internal.attendanceImportParse.parseMappedStorageXlsx, {
      storageId: upload.storageId,
      sheetName: args.sheetName,
      headerRowIndex: args.headerRowIndex,
      mapping: args.mapping,
    });
    if (!parsed.ok) throw new Error(parsed.message || "INVALID_IMPORT_FILE");
    const roster = await ctx.runQuery(internal.attendanceImport.listClassRosterInternal, {
      classId: upload.classId,
      attendanceDate: upload.attendanceDate,
    });
    const result = applyUnconfirmedNameMatchGate(
      reconcileAttendanceRows(parsed.rows, {
        attendanceDate: upload.attendanceDate,
        classId: upload.classId,
        classCode: roster.classCode,
        students: roster.students,
        presencePolicy: upload.presencePolicy,
      }),
      { confirmNameMatches: args.confirmNameMatches },
    );
    await ctx.runMutation(internal.attendanceImport.storePreviewInternal, {
      uploadId: args.uploadId,
      mapping: args.mapping,
      rowCount: parsed.rows.length,
      matchedCount: result.matchedCount,
      warningCount: result.warningCount,
      errorCount: result.errorCount,
      status: result.ok ? "validated" : "rejected",
      rows: result.rows.map((row) => ({
        rowNumber: row.rowNumber,
        rawStudentCode: row.rawStudentCode,
        rawStudentName: row.rawStudentName,
        rawClassCode: row.rawClassCode,
        rawObservedAt: row.rawObservedAt,
        rawStatus: row.rawStatus,
        matchedStudentId: row.matchedStudentId,
        matchedClassId: row.matchedClassId,
        resolution: row.resolution,
        messages: result.issues.filter((item) => item.rowNumber === row.rowNumber).map((item) => item.message),
        normalizedObservedAt: row.normalizedObservedAt,
      })),
    });
    return result;
  },
});

export const publish = mutation({
  args: { uploadId: v.string(), replaceMode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await publishStoredImport(ctx, args);
  },
});

export const replacePublishedImport = mutation({
  args: { uploadId: v.string(), mode: v.string() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId as Id<"attendanceImportUploads">);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    await assertAttendanceUploadActor(ctx, upload);
    return { uploadId: args.uploadId, mode: args.mode };
  },
});

export const getResult = query({
  args: { uploadId: v.string() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId as Id<"attendanceImportUploads">);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    await assertAttendanceUploadActor(ctx, upload);
    const rows = (await ctx.db.query("attendanceImportRows").collect()).filter(
      (row) => row.importId === args.uploadId,
    );
    return { upload, rows };
  },
});

async function assertAttendanceUploadActor(
  ctx: DbCtx,
  upload: {
    uploadedBy: string;
    status: string;
    expiresAt?: number;
    classId?: string;
    attendanceDate: string;
    schoolYearId: string;
  },
) {
  const { actor } = await homeroomActorOrThrow(ctx);
  assertImportUploadUsable(
    {
      uploadedBy: upload.uploadedBy,
      status: upload.status,
      expiresAt: upload.expiresAt ?? 0,
    },
    { actorId: actor.userId },
  );
  const klass = await assertClassSupervisor(ctx, actor, upload.classId || "", upload.attendanceDate);
  assertRosterUploadMatchesClass({ schoolYearId: upload.schoolYearId, classId: upload.classId || "" }, klass);
  return { actor, klass };
}

export const getUploadInternal = internalQuery({
  args: { uploadId: v.string() },
  handler: async (ctx, args) => {
    if (!args.uploadId || /\s/.test(args.uploadId)) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    let upload;
    try {
      upload = await ctx.db.get(args.uploadId as Id<"attendanceImportUploads">);
    } catch {
      throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    }
    if (!upload) return null;
    await assertAttendanceUploadActor(ctx, upload);
    return upload;
  },
});

export const listClassRosterInternal = internalQuery({
  args: { classId: v.string(), attendanceDate: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const date = assertYmd(args.attendanceDate);
    const klass = await assertClassSupervisor(ctx, actor, args.classId, date);
    const enrollments = enrollmentsCoveringDate(await ctx.db.query("classEnrollments").collect(), {
      classId: args.classId,
      date,
    });
    const students = [];
    for (const enrollment of enrollments) {
      const student = await ctx.db.get(enrollment.studentId as Id<"students">);
      if (!student) continue;
      students.push({
        studentId: String(student._id),
        studentCode: student.studentCode,
        fullName: student.fullName,
        classId: args.classId,
        classCode: klass.code,
        enrollmentId: String(enrollment._id),
      });
    }
    return { classCode: klass.code, students };
  },
});

export const patchChecksumInternal = internalMutation({
  args: { uploadId: v.string(), checksum: v.string() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId as Id<"attendanceImportUploads">);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    await assertAttendanceUploadActor(ctx, upload);
    if (upload.status === "published") throw new Error("ATTENDANCE_ALREADY_PUBLISHED");
    await ctx.db.patch(upload._id, { checksum: args.checksum, updatedAt: Date.now() });
  },
});

export const storePreviewInternal = internalMutation({
  args: {
    uploadId: v.string(),
    mapping: mappingValidator,
    rowCount: v.number(),
    matchedCount: v.number(),
    warningCount: v.number(),
    errorCount: v.number(),
    status: v.string(),
    rows: v.array(
      v.object({
        rowNumber: v.number(),
        rawStudentCode: v.optional(v.string()),
        rawStudentName: v.optional(v.string()),
        rawClassCode: v.optional(v.string()),
        rawObservedAt: v.optional(v.string()),
        rawStatus: v.optional(v.string()),
        matchedStudentId: v.optional(v.string()),
        matchedClassId: v.optional(v.string()),
        resolution: v.string(),
        messages: v.array(v.string()),
        normalizedObservedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId as Id<"attendanceImportUploads">);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    await assertAttendanceUploadActor(ctx, upload);
    if (upload.status === "published") throw new Error("ATTENDANCE_ALREADY_PUBLISHED");
    const existing = (await ctx.db.query("attendanceImportRows").collect()).filter(
      (row) => row.importId === args.uploadId,
    );
    for (const row of existing) await ctx.db.delete(row._id);
    const now = Date.now();
    for (const row of args.rows) {
      await ctx.db.insert("attendanceImportRows", {
        importId: args.uploadId,
        ...row,
        createdAt: now,
      });
    }
    await ctx.db.patch(upload._id, {
      columnMapping: args.mapping,
      rowCount: args.rowCount,
      matchedCount: args.matchedCount,
      warningCount: args.warningCount,
      errorCount: args.errorCount,
      status: args.status,
      updatedAt: now,
    });
  },
});

async function publishStoredImport(
  ctx: MutationCtx,
  args: { uploadId: string; replaceMode?: string },
) {
    const upload = await ctx.db.get(args.uploadId as Id<"attendanceImportUploads">);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    if (upload.status === "published") return { importId: args.uploadId, idempotent: true };
    const { actor } = await assertAttendanceUploadActor(ctx, upload);
    if (upload.status !== "validated") throw new Error("IMPORT_ROWS_UNRESOLVED");
    const published = (await ctx.db.query("attendanceImportUploads").collect()).find(
      (row) =>
        row.attendanceDate === upload.attendanceDate &&
        row.classId === upload.classId &&
        row.status === "published",
    );
    const decision = decidePublishedDateAction({
      existingPublished: published
        ? { importId: String(published._id), checksum: published.checksum, attendanceDate: published.attendanceDate }
        : null,
      nextChecksum: upload.checksum,
      attendanceDate: upload.attendanceDate,
      requestedMode: args.replaceMode,
    });
    if (decision.action === "idempotent") return { importId: decision.importId, idempotent: true };
    if (decision.action === "require_mode") throw new Error("ATTENDANCE_REPLACE_MODE_REQUIRED");
    if (decision.action === "cancel") return { cancelled: true };
    const storedRows = (await ctx.db.query("attendanceImportRows").collect()).filter(
      (row) => row.importId === args.uploadId,
    );
    if (storedRows.some((row) => row.resolution !== "matched" && row.resolution !== "unmatched")) {
      if (storedRows.some((row) => ["invalid", "ambiguous", "duplicate", "wrong_class"].includes(row.resolution))) {
        throw new Error("IMPORT_ROWS_UNRESOLVED");
      }
    }
    const roster = enrollmentsCoveringDate(await ctx.db.query("classEnrollments").collect(), {
      classId: upload.classId || "",
      date: upload.attendanceDate,
    });
    const publishedDays = applyPublicationPolicy({
      enrollments: roster.map((row) => ({
        enrollmentId: String(row._id),
        studentId: row.studentId,
        classId: row.classId,
        schoolYearId: row.schoolYearId,
      })),
      matchedRows: storedRows.map((row) => ({
        matchedStudentId: row.matchedStudentId,
        rawObservation: normalizeCameraStatus(row.rawStatus),
        normalizedObservedAt: row.normalizedObservedAt,
      })),
      presencePolicy: upload.presencePolicy,
      attendanceDate: upload.attendanceDate,
      sourceImportId: args.uploadId,
    });
    const now = Date.now();
    const existingDays = (await ctx.db.query("studentAttendanceDays").collect()).filter(
      (row) => row.classId === upload.classId && row.attendanceDate === upload.attendanceDate,
    );
    if (decision.action === "publish" && existingDays.length) {
      throw new Error("ATTENDANCE_ALREADY_PUBLISHED");
    }
    const plan = planAttendanceImportWrites({
      incomingDays: publishedDays.days,
      existingDays,
      mode: decision.action,
    });
    for (const day of plan.inserts) {
      await ctx.db.insert("studentAttendanceDays", {
        ...day,
        firstPublishedAt: now,
        updatedAt: now,
        updatedBy: actor.userId,
      });
    }
    for (const update of plan.updates) {
      const current = existingDays.find((row) => row.studentId === update.studentId);
      if (!current) continue;
      await ctx.db.patch(current._id, {
        rawObservation: update.rawObservation,
        rawObservedAt: update.rawObservedAt,
        sourceImportId: args.uploadId,
        effectiveStatus: update.effectiveStatus,
        updatedAt: now,
        updatedBy: actor.userId,
      });
    }
    if (published && decision.action === "replace") {
      await ctx.db.patch(published._id, { status: "superseded", updatedAt: now });
      await ctx.db.patch(upload._id, { supersedesImportId: String(published._id) });
    }
    await ctx.db.patch(upload._id, { status: "published", publishedAt: now, updatedAt: now });
    await writeAudit(ctx, {
      actorUserId: actor.userId,
      action: "attendanceImport.publish",
      details: JSON.stringify({ uploadId: args.uploadId, mode: decision.action }),
    });
    return attendanceImportPublishResult({
      uploadId: args.uploadId,
      changedCount: plan.changedCount,
    });
}
