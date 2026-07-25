import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type DbCtx = QueryCtx | MutationCtx;

/** System menus under "Quản trị hệ thống" controlled by permission groups. */
export const SYSTEM_MENU_DEFS = [
  { id: "reports", label: "Báo cáo" },
  { id: "duties", label: "Công tác" },
  { id: "work", label: "Công việc" },
  { id: "homeroom", label: "Lớp chủ nhiệm" },
  { id: "people-review", label: "Đánh giá nhân sự" },
] as const;

export type MenuId = (typeof SYSTEM_MENU_DEFS)[number]["id"];
export type MenuAccess = "hidden" | "view" | "edit";
export type SystemRole = "admin" | "user";

export const SYSTEM_ROLES: { key: SystemRole; name: string }[] = [
  { key: "admin", name: "Quản trị viên" },
  { key: "user", name: "Người dùng" },
];

export function isSystemRole(role: string): role is SystemRole {
  return role === "admin" || role === "user";
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

/** Quản trị viên: full access to all admin operations. */
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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function resolveUserMenuAccess(
  ctx: DbCtx,
  user: { role: string; permissionGroupId?: string },
): Promise<Record<string, MenuAccess>> {
  const full = Object.fromEntries(SYSTEM_MENU_DEFS.map((m) => [m.id, "edit" as MenuAccess]));
  if (user.role === "admin") return full;

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
