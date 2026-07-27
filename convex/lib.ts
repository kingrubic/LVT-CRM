import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type DbCtx = QueryCtx | MutationCtx;

/** Primary feature menus controlled by permission groups for regular users. */
export const SYSTEM_MENU_DEFS = [
  { id: "reports", label: "Báo cáo" },
  { id: "duties", label: "Công tác" },
  { id: "work", label: "Công việc" },
  { id: "homeroom", label: "Lớp chủ nhiệm" },
  { id: "people-review", label: "Đánh giá nhân sự" },
] as const;

export type MenuId = (typeof SYSTEM_MENU_DEFS)[number]["id"];
export type MenuAccess = "hidden" | "view" | "view_all" | "edit";
export type SystemRole = "admin" | "moderator" | "user";

export const SYSTEM_ROLES: { key: SystemRole; name: string }[] = [
  { key: "admin", name: "Administrator" },
  { key: "moderator", name: "Moderator" },
  { key: "user", name: "User" },
];

export function isSystemRole(role: string): role is SystemRole {
  return role === "admin" || role === "moderator" || role === "user";
}

export function isOperationalManagerRole(role: string): role is "admin" | "moderator" {
  return role === "admin" || role === "moderator";
}

export function defaultMenuAccess(): { menu: string; access: MenuAccess }[] {
  return SYSTEM_MENU_DEFS.map((item) => ({ menu: item.id, access: "hidden" as MenuAccess }));
}

export function normalizeMenuAccess(
  entries: { menu: string; access: MenuAccess }[] | undefined,
): { menu: string; access: MenuAccess }[] {
  const map = new Map((entries || []).map((e) => [e.menu, e.access]));
  return SYSTEM_MENU_DEFS.map((item) => ({
    menu: item.id,
    access: (map.get(item.id) as MenuAccess | undefined) || "hidden",
  }));
}

/**
 * Approval hierarchy: higher star level may approve lower levels.
 * Level 5 can approve 4,3,2,1. Level 4 can approve 3,2,1 but not 5.
 * Level 1 cannot approve anyone. Same level cannot approve each other.
 */
export function canApproveLevel(approverLevel: number, targetLevel: number): boolean {
  if (!Number.isInteger(approverLevel) || !Number.isInteger(targetLevel)) return false;
  if (approverLevel < 1 || approverLevel > 5 || targetLevel < 1 || targetLevel > 5) return false;
  return approverLevel > targetLevel;
}

export function activePositionLevel(
  user: { positionId?: string },
  positions: { _id: string; level: number; active: boolean }[],
): number {
  if (!user.positionId) return 0;
  const position = positions.find((item) => String(item._id) === String(user.positionId));
  return position?.active ? Number(position.level) || 0 : 0;
}

export function isSameDepartmentSubordinate(
  actor: { _id: string; departmentId?: string; positionId?: string },
  target: { _id: string; departmentId?: string; positionId?: string },
  positions: { _id: string; level: number; active: boolean }[],
): boolean {
  if (String(actor._id) === String(target._id)) return false;
  if (!actor.departmentId || !target.departmentId) return false;
  if (String(actor.departmentId) !== String(target.departmentId)) return false;
  return canApproveLevel(
    activePositionLevel(actor, positions),
    activePositionLevel(target, positions),
  );
}

/** Higher rank may approve on behalf of any lower required rank on a multi-step task. */
export function canApproveOnBehalf(approverLevel: number, requiredLevel: number): boolean {
  return canApproveLevel(approverLevel, requiredLevel) || approverLevel === requiredLevel;
}

export function assertPositionLevel(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error("INVALID_POSITION_LEVEL");
}

export async function authUserIdOrThrow(ctx: { auth: QueryCtx["auth"] }): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("UNAUTHENTICATED");
  return userId;
}

export async function currentUserOrThrow(ctx: DbCtx) {
  const userId = await authUserIdOrThrow(ctx);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** Administrator-only gate for supreme settings and user lifecycle operations. */
export async function adminOrThrow(ctx: DbCtx) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active" || user.role !== "admin") throw new Error("FORBIDDEN: admin role required");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return user;
}

/**
 * Admin-only gate. Permission strings are retained for audit/call-site clarity;
 * admin role grants every permission (highest privilege).
 */
export async function adminPermissionOrThrow(ctx: DbCtx, permission: string) {
  const user = await adminOrThrow(ctx);
  return { user, role: { key: "admin" as const, permissions: [permission, "*"] } };
}

/** Administrator/Moderator gate for operational management modules. */
export async function operationalManagerOrThrow(ctx: DbCtx) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active" || !isOperationalManagerRole(user.role)) {
    throw new Error("FORBIDDEN: operational manager role required");
  }
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return user;
}

export async function operationalManagerPermissionOrThrow(ctx: DbCtx, permission: string) {
  const user = await operationalManagerOrThrow(ctx);
  return { user, role: { key: user.role, permissions: [permission, "*"] } };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalize display names for duplicate checks (trim + Vietnamese-aware lower case). */
export function normalizeDisplayName(name: string): string {
  return name.trim().toLocaleLowerCase("vi");
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeDisplayName(a) === normalizeDisplayName(b);
}

/**
 * True if another active row already uses this name.
 * Soft-deleted (active=false) names may be reused.
 */
export function hasActiveNameConflict(
  rows: { _id: string; name: string; active?: boolean }[],
  name: string,
  excludeId?: string,
): boolean {
  const target = normalizeDisplayName(name);
  return rows.some(
    (row) =>
      row.active !== false &&
      row._id !== excludeId &&
      normalizeDisplayName(row.name) === target,
  );
}

export async function resolveUserMenuAccess(
  ctx: DbCtx,
  user: { role: string; permissionGroupId?: string },
): Promise<Record<string, MenuAccess>> {
  const full = Object.fromEntries(SYSTEM_MENU_DEFS.map((m) => [m.id, "edit" as MenuAccess]));
  if (isOperationalManagerRole(user.role)) return full;

  const empty = Object.fromEntries(SYSTEM_MENU_DEFS.map((m) => [m.id, "hidden" as MenuAccess]));
  if (!user.permissionGroupId) return empty;

  const group = await ctx.db
    .query("permissionGroups")
    .collect()
    .then((rows) => rows.find((row) => row._id === user.permissionGroupId));
  if (!group?.active) return empty;

  const result = { ...empty };
  for (const entry of normalizeMenuAccess(group.menuAccess)) {
    result[entry.menu] = entry.access;
  }
  return result;
}
