import {
  createAccount,
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  adminPermissionOrThrow,
  authUserIdOrThrow,
  currentUserOrThrow,
  isOperationalManagerRole,
  isSystemRole,
  normalizeEmail,
  resolveUserMenuAccess,
  SYSTEM_ROLES,
} from "./lib";

const userArgs = {
  email: v.string(),
  name: v.string(),
  role: v.string(),
  departmentId: v.optional(v.string()),
  permissionGroupId: v.optional(v.string()),
  positionId: v.optional(v.string()),
};

function cleanUserInput(args: {
  email: string;
  name: string;
  role: string;
  departmentId?: string;
  permissionGroupId?: string;
  positionId?: string;
}) {
  const name = args.name.trim();
  const email = normalizeEmail(args.email);
  const role = args.role.trim();
  const departmentId = args.departmentId?.trim() || undefined;
  const positionId = args.positionId?.trim() || undefined;
  if (!name || name.length > 120) throw new Error("INVALID_NAME");
  if (!isSystemRole(role)) throw new Error("INVALID_ROLE");
  const permissionGroupId =
    role === "user" ? args.permissionGroupId?.trim() || undefined : undefined;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("INVALID_EMAIL");
  return { name, email, role, departmentId, permissionGroupId, positionId };
}

const MIN_PASSWORD_LENGTH = 8;
const FORGOT_PASSWORD_COOLDOWN_MS = 5 * 60 * 1000;

function assertPasswordLength(password: string, code = "PASSWORD_TOO_SHORT") {
  if (!password || password.length < MIN_PASSWORD_LENGTH) throw new Error(code);
}

function randomTemporaryPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  return out;
}

async function auditBestEffort(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  entry: {
    actorUserId: string;
    action: string;
    targetUserId?: string;
    targetEmail?: string;
    details?: string;
  },
) {
  try {
    await ctx.runMutation(internal.users.audit, entry);
  } catch {
    /* An audit outage must not conceal the primary operation result. */
  }
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

/** Session payload for navigation: user + resolved menu access + related labels. */
export const sessionContext = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const menuAccess = await resolveUserMenuAccess(ctx, user);
    const [departments, groups, positions] = await Promise.all([
      ctx.db.query("departments").collect(),
      ctx.db.query("permissionGroups").collect(),
      ctx.db.query("positions").collect(),
    ]);

    const department = user.departmentId
      ? departments.find((d) => d._id === user.departmentId)
      : undefined;
    const permissionGroup = user.permissionGroupId
      ? groups.find((g) => g._id === user.permissionGroupId)
      : undefined;
    const position = user.positionId
      ? positions.find((p) => p._id === user.positionId)
      : undefined;

    return {
      user,
      isAdmin: user.role === "admin",
      isModerator: user.role === "moderator",
      isOperationalManager: isOperationalManagerRole(user.role),
      menuAccess,
      department: department
        ? { _id: department._id, name: department.name, code: department.code }
        : null,
      permissionGroup: permissionGroup
        ? { _id: permissionGroup._id, name: permissionGroup.name }
        : null,
      position: position
        ? { _id: position._id, name: position.name, level: position.level, code: position.code }
        : null,
    };
  },
});

export const bootstrap = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await adminPermissionOrThrow(ctx, "users:read");
    const [users, departments, permissionGroups, positions] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("permissionGroups").collect(),
      ctx.db.query("positions").collect(),
    ]);
    return {
      currentUser: user,
      users,
      departments,
      permissionGroups,
      positions,
      systemRoles: SYSTEM_ROLES,
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "users:read");
    return await ctx.db.query("users").collect();
  },
});

export const requireAdmin = internalQuery({
  args: { permission: v.string() },
  handler: async (ctx, args) => (await adminPermissionOrThrow(ctx, args.permission)).user._id,
});

export const byId = internalQuery({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await adminPermissionOrThrow(ctx, "users:read");
    return await ctx.db.get(args.id);
  },
});

export const byEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    return await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique();
  },
});

export const currentForPasswordChange = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => await ctx.db.get(args.userId),
});

export const hasActiveAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.some((user) => user.role === "admin" && user.status === "active");
  },
});

export const assertRoleAndAssignments = internalQuery({
  args: {
    role: v.string(),
    departmentId: v.optional(v.string()),
    permissionGroupId: v.optional(v.string()),
    positionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isSystemRole(args.role)) throw new Error("INVALID_ROLE");
    if (args.departmentId) {
      const department = (await ctx.db.query("departments").collect()).find(
        (item) => item._id === args.departmentId,
      );
      if (!department?.active) throw new Error("INVALID_DEPARTMENT");
    }
    if (args.permissionGroupId) {
      const group = (await ctx.db.query("permissionGroups").collect()).find(
        (item) => item._id === args.permissionGroupId,
      );
      if (!group?.active) throw new Error("INVALID_PERMISSION_GROUP");
    }
    if (args.positionId) {
      const position = (await ctx.db.query("positions").collect()).find(
        (item) => item._id === args.positionId,
      );
      if (!position?.active) throw new Error("INVALID_POSITION");
    }
    return true;
  },
});

/** @deprecated Prefer assertRoleAndAssignments; kept for internal callers during migration. */
export const assertRoleAndDepartment = internalQuery({
  args: { role: v.string(), departmentId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!isSystemRole(args.role)) throw new Error("INVALID_ROLE");
    if (args.departmentId) {
      const department = (await ctx.db.query("departments").collect()).find(
        (item) => item._id === args.departmentId,
      );
      if (!department?.active) throw new Error("INVALID_DEPARTMENT");
    }
    return true;
  },
});

export const patchById = internalMutation({
  args: {
    id: v.id("users"),
    actorUserId: v.string(),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
    departmentId: v.optional(v.union(v.string(), v.null())),
    permissionGroupId: v.optional(v.union(v.string(), v.null())),
    positionId: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.string()),
    status: v.optional(v.string()),
    mustChangePassword: v.optional(v.boolean()),
    lastPasswordResetAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, actorUserId, ...raw } = args;
    const patch: Record<string, unknown> = {};

    if (raw.email !== undefined) {
      const email = normalizeEmail(raw.email);
      const duplicate = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique();
      if (duplicate && duplicate._id !== id) throw new Error("EMAIL_TAKEN");
      patch.email = email;
    }
    if (raw.role !== undefined) {
      if (!isSystemRole(raw.role)) throw new Error("INVALID_ROLE");
      patch.role = raw.role;
    }
    if (raw.name !== undefined) patch.name = raw.name;
    if (raw.status !== undefined) patch.status = raw.status;
    if (raw.mustChangePassword !== undefined) patch.mustChangePassword = raw.mustChangePassword;
    if (raw.lastPasswordResetAt !== undefined) patch.lastPasswordResetAt = raw.lastPasswordResetAt;

    if (raw.departmentId !== undefined) {
      if (raw.departmentId === null || raw.departmentId === "") {
        patch.departmentId = undefined;
      } else {
        const department = (await ctx.db.query("departments").collect()).find(
          (item) => item._id === raw.departmentId,
        );
        if (!department?.active) throw new Error("INVALID_DEPARTMENT");
        patch.departmentId = raw.departmentId;
      }
    }
    if (raw.permissionGroupId !== undefined) {
      if (raw.permissionGroupId === null || raw.permissionGroupId === "") {
        patch.permissionGroupId = undefined;
      } else {
        const group = (await ctx.db.query("permissionGroups").collect()).find(
          (item) => item._id === raw.permissionGroupId,
        );
        if (!group?.active) throw new Error("INVALID_PERMISSION_GROUP");
        patch.permissionGroupId = raw.permissionGroupId;
      }
    }
    if (raw.positionId !== undefined) {
      if (raw.positionId === null || raw.positionId === "") {
        patch.positionId = undefined;
      } else {
        const position = (await ctx.db.query("positions").collect()).find(
          (item) => item._id === raw.positionId,
        );
        if (!position?.active) throw new Error("INVALID_POSITION");
        patch.positionId = raw.positionId;
      }
    }

    await ctx.db.patch(id, { ...patch, updatedBy: actorUserId, updatedAt: Date.now() });
  },
});

export const audit = internalMutation({
  args: {
    actorUserId: v.string(),
    action: v.string(),
    targetUserId: v.optional(v.string()),
    targetEmail: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => ctx.db.insert("auditLogs", { ...args, at: Date.now() }),
});

export const create = action({
  args: { ...userArgs, temporaryPassword: v.string() },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });
    const input = cleanUserInput(args);
    assertPasswordLength(args.temporaryPassword, "TEMP_PASSWORD_TOO_SHORT");

    if (await ctx.runQuery(internal.users.byEmail, { email: input.email })) {
      throw new Error("EMAIL_TAKEN");
    }
    await ctx.runQuery(internal.users.assertRoleAndAssignments, {
      role: input.role,
      departmentId: input.departmentId,
      permissionGroupId: input.permissionGroupId,
      positionId: input.positionId,
    });

    const now = Date.now();
    let userId: Id<"users">;
    try {
      const created = await createAccount(ctx, {
        provider: "password",
        account: { id: input.email, secret: args.temporaryPassword },
        profile: {
          email: input.email,
          name: input.name,
          role: input.role,
          departmentId: input.departmentId,
          permissionGroupId: input.permissionGroupId,
          positionId: input.positionId,
          status: "active",
          mustChangePassword: true,
          createdBy: actorId,
          updatedBy: actorId,
          createdAt: now,
          updatedAt: now,
        },
      });
      userId = created.user._id;
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      if (message.includes("already exists") || message.includes("Account already")) {
        await auditBestEffort(ctx, {
          actorUserId: actorId,
          action: "user.create_failed",
          targetEmail: input.email,
          details: JSON.stringify({ reason: "account_exists" }),
        });
        throw new Error("EMAIL_TAKEN");
      }
      await auditBestEffort(ctx, {
        actorUserId: actorId,
        action: "user.create_failed",
        targetEmail: input.email,
      });
      throw new Error("USER_CREATE_FAILED");
    }

    await auditBestEffort(ctx, {
      actorUserId: actorId,
      action: "user.create",
      targetUserId: userId,
      targetEmail: input.email,
      details: JSON.stringify({
        role: input.role,
        departmentId: input.departmentId,
        permissionGroupId: input.permissionGroupId,
        positionId: input.positionId,
      }),
    });
    return userId;
  },
});

export const update = action({
  args: { id: v.id("users"), ...userArgs },
  handler: async (ctx, args) => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });
    const target = await ctx.runQuery(internal.users.byId, { id: args.id });
    if (!target) throw new Error("USER_NOT_FOUND");
    const input = cleanUserInput(args);

    const duplicateEmail = await ctx.runQuery(internal.users.byEmail, { email: input.email });
    if (duplicateEmail && duplicateEmail._id !== target._id) throw new Error("EMAIL_TAKEN");

    // Password account id is the original email. Renaming email identity is not supported
    // without a dedicated account-migration path; reject rather than leave credentials orphaned.
    if (target.email && normalizeEmail(target.email) !== input.email) {
      throw new Error("EMAIL_CHANGE_UNSUPPORTED");
    }

    await ctx.runQuery(internal.users.assertRoleAndAssignments, {
      role: input.role,
      departmentId: input.departmentId,
      permissionGroupId: input.permissionGroupId,
      positionId: input.positionId,
    });

    try {
      await ctx.runMutation(internal.users.patchById, {
        id: args.id,
        actorUserId: actorId,
        name: input.name,
        email: input.email,
        role: input.role,
        departmentId: input.departmentId ?? null,
        permissionGroupId: input.permissionGroupId ?? null,
        positionId: input.positionId ?? null,
      });
    } catch {
      await auditBestEffort(ctx, {
        actorUserId: actorId,
        action: "user.update_sync_pending",
        targetUserId: target._id,
        targetEmail: input.email,
      });
      throw new Error("USER_UPDATE_FAILED");
    }
    await auditBestEffort(ctx, {
      actorUserId: actorId,
      action: "user.update",
      targetUserId: target._id,
      targetEmail: input.email,
    });
  },
});

export const setDisabled = action({
  args: { id: v.id("users"), disabled: v.boolean() },
  handler: async (ctx, args) => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:disable" });
    const target = await ctx.runQuery(internal.users.byId, { id: args.id });
    if (!target) throw new Error("USER_NOT_FOUND");
    if (args.disabled && target._id === actorId && target.status === "active") {
      throw new Error("CANNOT_DISABLE_OWN_ACTIVE_ACCOUNT");
    }

    if (args.disabled) {
      await ctx.runMutation(internal.users.patchById, {
        id: args.id,
        actorUserId: actorId,
        status: "disabled",
      });
      try {
        await invalidateSessions(ctx, { userId: args.id });
      } catch {
        await auditBestEffort(ctx, {
          actorUserId: actorId,
          action: "user.disable_session_revoke_failed",
          targetUserId: target._id,
          targetEmail: target.email,
        });
        throw new Error("USER_DISABLED_SESSION_REVOKE_PENDING");
      }
    } else {
      await ctx.runMutation(internal.users.patchById, {
        id: args.id,
        actorUserId: actorId,
        status: "active",
      });
    }

    await auditBestEffort(ctx, {
      actorUserId: actorId,
      action: args.disabled ? "user.disable" : "user.enable",
      targetUserId: target._id,
      targetEmail: target.email,
    });
  },
});

export const remove = action({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:delete" });
    const target = await ctx.runQuery(internal.users.byId, { id: args.id });
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target._id === actorId && target.status === "active") {
      throw new Error("CANNOT_DELETE_OWN_ACTIVE_ACCOUNT");
    }

    // Convex Auth has no documented account-delete helper. Keep the user row and
    // auth account intact, but perform a safe soft-delete: disable + revoke all
    // sessions. Direct writes to authTables are intentionally forbidden.
    try {
      await ctx.runMutation(internal.users.patchById, {
        id: args.id,
        actorUserId: actorId,
        status: "disabled",
      });
      await invalidateSessions(ctx, { userId: args.id });
    } catch {
      await auditBestEffort(ctx, {
        actorUserId: actorId,
        action: "user.remove_failed",
        targetUserId: target._id,
        targetEmail: target.email,
      });
      throw new Error("USER_REMOVE_FAILED");
    }
    await auditBestEffort(ctx, {
      actorUserId: actorId,
      action: "user.remove",
      targetUserId: target._id,
      targetEmail: target.email,
      details: JSON.stringify({ mode: "soft_delete" }),
    });
  },
});

export const resetPassword = action({
  args: { id: v.id("users"), temporaryPassword: v.string() },
  handler: async (ctx, args) => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:password" });
    assertPasswordLength(args.temporaryPassword, "TEMP_PASSWORD_TOO_SHORT");
    const target = await ctx.runQuery(internal.users.byId, { id: args.id });
    if (!target) throw new Error("USER_NOT_FOUND");
    if (!target.email) throw new Error("USER_EMAIL_MISSING");

    // Flag locally first: a failed credential update leaves the account blocked rather than falsely cleared.
    await ctx.runMutation(internal.users.patchById, {
      id: args.id,
      actorUserId: actorId,
      mustChangePassword: true,
      lastPasswordResetAt: Date.now(),
    });

    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: normalizeEmail(target.email), secret: args.temporaryPassword },
      });
      await invalidateSessions(ctx, { userId: args.id });
    } catch {
      await auditBestEffort(ctx, {
        actorUserId: actorId,
        action: "user.password_reset_failed",
        targetUserId: target._id,
        targetEmail: target.email,
      });
      throw new Error("PASSWORD_RESET_FAILED");
    }

    await auditBestEffort(ctx, {
      actorUserId: actorId,
      action: "user.password_reset",
      targetUserId: target._id,
      targetEmail: target.email,
    });
  },
});

/**
 * Public forgot-password for web / Android / future iOS.
 * Always returns { ok: true } when the email looks valid (no account enumeration),
 * except when mail delivery fails after credentials were rotated.
 */
export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const email = normalizeEmail(args.email);
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      throw new Error("INVALID_EMAIL");
    }

    const user = await ctx.runQuery(internal.users.byEmail, { email });
    if (!user || user.status !== "active" || !user.email) {
      return { ok: true };
    }

    const lastReset = user.lastPasswordResetAt ?? 0;
    if (Date.now() - lastReset < FORGOT_PASSWORD_COOLDOWN_MS) {
      return { ok: true };
    }

    const temporaryPassword = randomTemporaryPassword(12);
    await ctx.runMutation(internal.users.patchById, {
      id: user._id,
      actorUserId: "system:requestPasswordReset",
      mustChangePassword: true,
      lastPasswordResetAt: Date.now(),
    });

    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: temporaryPassword },
      });
      await invalidateSessions(ctx, { userId: user._id });
    } catch {
      await auditBestEffort(ctx, {
        actorUserId: "system:requestPasswordReset",
        action: "user.password_forgot_reset_failed",
        targetUserId: user._id,
        targetEmail: email,
        details: JSON.stringify({ stage: "credentials" }),
      });
      throw new Error("PASSWORD_RESET_FAILED");
    }

    try {
      await ctx.runAction(internal.mail.sendPasswordResetEmail, {
        to: email,
        temporaryPassword,
        recipientName: user.name,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const code =
        ["MAIL_NOT_CONFIGURED", "MAIL_AUTH_FAILED", "PASSWORD_RESET_EMAIL_FAILED"].find((item) =>
          raw.includes(item),
        ) ?? "PASSWORD_RESET_EMAIL_FAILED";
      await auditBestEffort(ctx, {
        actorUserId: "system:requestPasswordReset",
        action: "user.password_forgot_reset_failed",
        targetUserId: user._id,
        targetEmail: email,
        details: JSON.stringify({ stage: "email", code }),
      });
      throw new Error(code);
    }

    await auditBestEffort(ctx, {
      actorUserId: "system:requestPasswordReset",
      action: "user.password_forgot_reset",
      targetUserId: user._id,
      targetEmail: email,
    });
    return { ok: true };
  },
});

export const changeOwnPassword = action({
  args: { newPassword: v.string() },
  handler: async (ctx, args) => {
    const userId = await authUserIdOrThrow(ctx);
    assertPasswordLength(args.newPassword, "PASSWORD_TOO_SHORT");
    const user = await ctx.runQuery(internal.users.currentForPasswordChange, { userId });
    if (!user || user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (!user.email) throw new Error("USER_EMAIL_MISSING");

    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: normalizeEmail(user.email), secret: args.newPassword },
      });
      const sessionId = await getAuthSessionId(ctx);
      await invalidateSessions(ctx, {
        userId,
        except: sessionId ? [sessionId] : undefined,
      });
    } catch {
      await auditBestEffort(ctx, {
        actorUserId: userId,
        action: "user.password_change_failed",
        targetUserId: userId,
        targetEmail: user.email,
      });
      throw new Error("PASSWORD_CHANGE_FAILED");
    }

    try {
      await ctx.runMutation(internal.users.patchById, {
        id: user._id,
        actorUserId: userId,
        mustChangePassword: false,
      });
    } catch {
      await auditBestEffort(ctx, {
        actorUserId: userId,
        action: "user.password_change_sync_pending",
        targetUserId: userId,
        targetEmail: user.email,
      });
      throw new Error("PASSWORD_CHANGED_SYNC_PENDING");
    }

    await auditBestEffort(ctx, {
      actorUserId: userId,
      action: "user.password_change",
      targetUserId: userId,
      targetEmail: user.email,
    });
  },
});

/**
 * Operator-only first-admin bootstrap.
 *
 * Callable only as an internal function (Convex dashboard / CLI with deployment admin key).
 * Refuses if any active admin already exists. Does not expose a public HTTP/bootstrap endpoint.
 * Temporary password must be rotated on first sign-in (mustChangePassword=true).
 *
 * Example (self-hosted, after env is loaded):
 *   npx convex run internal.users.provisionFirstAdmin \
 *     '{"email":"admin@example.school","name":"Quản trị","temporaryPassword":"<temp-8+>"}'
 */
export const provisionFirstAdmin = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    temporaryPassword: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    if (await ctx.runQuery(internal.users.hasActiveAdmin, {})) {
      throw new Error("ADMIN_ALREADY_EXISTS");
    }
    const input = cleanUserInput({
      email: args.email,
      name: args.name,
      role: "admin",
    });
    assertPasswordLength(args.temporaryPassword, "TEMP_PASSWORD_TOO_SHORT");

    if (await ctx.runQuery(internal.users.byEmail, { email: input.email })) {
      throw new Error("EMAIL_TAKEN");
    }
    const now = Date.now();
    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: input.email, secret: args.temporaryPassword },
      profile: {
        email: input.email,
        name: input.name,
        role: "admin",
        status: "active",
        mustChangePassword: true,
        createdBy: "operator:provisionFirstAdmin",
        updatedBy: "operator:provisionFirstAdmin",
        createdAt: now,
        updatedAt: now,
      },
    });

    await auditBestEffort(ctx, {
      actorUserId: "operator:provisionFirstAdmin",
      action: "user.provision_first_admin",
      targetUserId: created.user._id,
      targetEmail: input.email,
    });
    return created.user._id;
  },
});

/**
 * Operator-only password reset for an existing account.
 * This is intentionally internal-only; normal admin resets use resetPassword.
 */
export const operatorResetPassword = internalAction({
  args: {
    email: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    assertPasswordLength(args.newPassword, "PASSWORD_TOO_SHORT");
    const email = normalizeEmail(args.email);
    const user = await ctx.runQuery(internal.users.byEmail, { email });
    if (!user || user.status !== "active") throw new Error("USER_NOT_FOUND");

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: args.newPassword },
    });
    await invalidateSessions(ctx, { userId: user._id });
    await ctx.runMutation(internal.users.patchById, {
      id: user._id,
      actorUserId: "operator:operatorResetPassword",
      mustChangePassword: false,
    });
    await auditBestEffort(ctx, {
      actorUserId: "operator:operatorResetPassword",
      action: "user.operator_password_reset",
      targetUserId: user._id,
      targetEmail: email,
    });
    return user._id;
  },
});

// Gate normal CRM operations for authenticated callers that must change password.
export const assertOperational = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await currentUserOrThrow(ctx);
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    return user._id;
  },
});
