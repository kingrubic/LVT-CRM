import { currentUserOrThrow, resolveUserMenuAccess } from "./lib";
import {
  assertCanBulkImportRoster,
  assertCanReadClass,
  assertCanSupervisorImport,
  assertCanWriteHomeroomCatalog,
  assertClassNotArchived,
  assertHomeroomActorReady,
  type HomeroomActor,
  type HomeroomAssignment,
} from "./homeroomPolicy";
import { vietnamDateFromUtcMs } from "./homeroomTime";
import type { MutationCtx } from "./_generated/server";
import type { DbCtx } from "./lib";

export async function homeroomActorFromUser(
  ctx: DbCtx,
  user: { _id: string; role: string; status: string; mustChangePassword?: boolean },
): Promise<HomeroomActor> {
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  return {
    userId: String(user._id),
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    menuAccess,
  };
}

export async function homeroomActorOrThrow(ctx: DbCtx) {
  const user = await currentUserOrThrow(ctx);
  const actor = await homeroomActorFromUser(ctx, user);
  assertHomeroomActorReady(actor);
  return { user, actor };
}

export async function homeroomCatalogWriterOrThrow(ctx: DbCtx) {
  const user = await currentUserOrThrow(ctx);
  const actor = await homeroomActorFromUser(ctx, user);
  assertCanWriteHomeroomCatalog(actor);
  return { user, actor };
}

export async function loadAssignments(ctx: DbCtx, schoolYearId?: string): Promise<HomeroomAssignment[]> {
  const rows = await ctx.db.query("homeroomAssignments").collect();
  return rows
    .filter((row) => !schoolYearId || row.schoolYearId === schoolYearId)
    .map((row) => ({
      classId: row.classId,
      schoolYearId: row.schoolYearId,
      userId: row.userId,
      assignmentType: row.assignmentType,
      scopeKind: row.scopeKind,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      active: row.active,
    }));
}

export async function assertClassReadable(
  ctx: DbCtx,
  actor: HomeroomActor,
  classId: string,
  date = vietnamDateFromUtcMs(Date.now()),
) {
  const klass = await ctx.db.get(classId as never);
  if (!klass || (klass as { status?: string }).status === undefined) {
    const rows = await ctx.db.query("homeroomClasses").collect();
    const found = rows.find((row) => String(row._id) === String(classId));
    if (!found) throw new Error("CLASS_NOT_FOUND");
    const assignments = await loadAssignments(ctx, found.schoolYearId);
    assertCanReadClass(actor, assignments, String(found._id), date);
    return found;
  }
  const found = klass as {
    _id: string;
    schoolYearId: string;
    code: string;
    name: string;
    gradeLevel: number;
    status: string;
  };
  const assignments = await loadAssignments(ctx, found.schoolYearId);
  assertCanReadClass(actor, assignments, String(found._id), date);
  return found;
}

export async function assertClassRosterWritable(
  ctx: DbCtx,
  actor: HomeroomActor,
  classId: string,
  date = vietnamDateFromUtcMs(Date.now()),
) {
  const found = await assertClassReadable(ctx, actor, classId, date);
  assertClassNotArchived(found);
  assertCanBulkImportRoster(actor);
  return found;
}

export async function assertClassSupervisor(
  ctx: DbCtx,
  actor: HomeroomActor,
  classId: string,
  date: string,
) {
  const rows = await ctx.db.query("homeroomClasses").collect();
  const found = rows.find((row) => String(row._id) === String(classId));
  if (!found) throw new Error("CLASS_NOT_FOUND");
  assertClassNotArchived(found);
  const assignments = await loadAssignments(ctx, found.schoolYearId);
  assertCanSupervisorImport(actor, assignments, String(found._id), date);
  return found;
}

export async function writeAudit(
  ctx: MutationCtx,
  args: { actorUserId: string; action: string; details?: string; targetUserId?: string },
) {
  await ctx.db.insert("auditLogs", {
    actorUserId: args.actorUserId,
    action: args.action,
    targetUserId: args.targetUserId,
    details: args.details,
    at: Date.now(),
  });
}
