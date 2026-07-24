import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { adminOrThrow, identityOrThrow } from "./lib";

const userArgs = { username: v.string(), email: v.optional(v.string()), name: v.string(), role: v.string(), departmentId: v.optional(v.string()) };

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await identityOrThrow(ctx);
    return await ctx.db.query("users").withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject)).unique();
  },
});

export const bootstrap = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await adminOrThrow(ctx);
    const [users, departments, roles] = await Promise.all([ctx.db.query("users").collect(), ctx.db.query("departments").collect(), ctx.db.query("roles").collect()]);
    return { currentUser: user, users, departments, roles };
  },
});

export const storeCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await identityOrThrow(ctx);
    const now = Date.now();
    const email = identity.email;
    const username = identity.preferredUsername ?? identity.nickname ?? email ?? identity.subject;
    const name = identity.name ?? email ?? "Người dùng";
    const byClerk = await ctx.db.query("users").withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject)).unique();
    if (byClerk) { await ctx.db.patch("users", byClerk._id, { username, name, email, updatedAt: now }); return byClerk._id; }
    const pending = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", username)).unique();
    if (pending?.status === "pending") { await ctx.db.patch("users", pending._id, { clerkUserId: identity.subject, name, email, status: "active", updatedAt: now }); return pending._id; }
    throw new Error("USER_NOT_PROVISIONED");
  },
});

export const list = query({ args: {}, handler: async (ctx) => { await adminOrThrow(ctx); return await ctx.db.query("users").collect(); } });
export const requireAdmin = internalQuery({ args: {}, handler: async (ctx) => (await adminOrThrow(ctx)).user._id });
export const byId = internalQuery({ args: { id: v.id("users") }, handler: async (ctx, args) => { await adminOrThrow(ctx); return await ctx.db.get("users", args.id); } });

export const createPending = internalMutation({
  args: { ...userArgs, actorClerkUserId: v.string() },
  handler: async (ctx, args) => { const now = Date.now(); return await ctx.db.insert("users", { username: args.username, email: args.email, name: args.name, role: args.role, departmentId: args.departmentId, status: "pending", mustChangePassword: true, createdBy: args.actorClerkUserId, updatedBy: args.actorClerkUserId, createdAt: now, updatedAt: now }); },
});

export const patchById = internalMutation({
  args: { id: v.id("users"), actorClerkUserId: v.string(), clerkUserId: v.optional(v.string()), username: v.optional(v.string()), email: v.optional(v.string()), role: v.optional(v.string()), departmentId: v.optional(v.string()), name: v.optional(v.string()), status: v.optional(v.string()), mustChangePassword: v.optional(v.boolean()), lastPasswordResetAt: v.optional(v.number()) },
  handler: async (ctx, args) => { const { id, actorClerkUserId, ...patch } = args; await ctx.db.patch("users", id, { ...patch, updatedBy: actorClerkUserId, updatedAt: Date.now() }); },
});

export const deleteById = internalMutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => { await ctx.db.delete(args.id); },
});

export const audit = internalMutation({
  args: { actorClerkUserId: v.string(), action: v.string(), targetClerkUserId: v.optional(v.string()), targetEmail: v.optional(v.string()), details: v.optional(v.string()) },
  handler: async (ctx, args) => ctx.db.insert("auditLogs", { ...args, at: Date.now() }),
});

// Clerk's supported Backend API is deliberately called through an action so its secret never reaches the browser.
async function clerkRequest(path: string, init: RequestInit = {}) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is not configured in Convex");
  const response = await fetch(`https://api.clerk.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`CLERK_API_${response.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

export const create = action({
  args: { ...userArgs, temporaryPassword: v.string() },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx); await ctx.runQuery(internal.users.requireAdmin, {});
    if (args.temporaryPassword.length < 12) throw new Error("TEMP_PASSWORD_TOO_SHORT");
    const clerk = await clerkRequest("/users", { method: "POST", body: JSON.stringify({ username: args.username, password: args.temporaryPassword, first_name: args.name, email_address: args.email ? [args.email] : undefined, public_metadata: { role: args.role, departmentId: args.departmentId, mustChangePassword: true } }) });
    const id = await ctx.runMutation(internal.users.createPending, { username: args.username, email: args.email, name: args.name, role: args.role, departmentId: args.departmentId, actorClerkUserId: identity.subject });
    await ctx.runMutation(internal.users.patchById, { id, actorClerkUserId: identity.subject, clerkUserId: clerk.id, status: "active" });
    await ctx.runMutation(internal.users.audit, { actorClerkUserId: identity.subject, action: "user.create", targetClerkUserId: clerk.id, targetEmail: args.email, details: JSON.stringify({ username: args.username, role: args.role, departmentId: args.departmentId }) }); return id;
  },
});

export const update = action({
  args: { id: v.id("users"), ...userArgs },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx); await ctx.runQuery(internal.users.requireAdmin, {}); const target = await ctx.runQuery(internal.users.byId, { id: args.id }); if (!target) throw new Error("USER_NOT_FOUND");
    if (target.clerkUserId) await clerkRequest(`/users/${encodeURIComponent(target.clerkUserId)}`, { method: "PATCH", body: JSON.stringify({ first_name: args.name, username: args.username, public_metadata: { role: args.role, departmentId: args.departmentId, mustChangePassword: target.mustChangePassword } }) });
    await ctx.runMutation(internal.users.patchById, { id: args.id, actorClerkUserId: identity.subject, username: args.username, email: args.email, role: args.role, departmentId: args.departmentId, name: args.name }); await ctx.runMutation(internal.users.audit, { actorClerkUserId: identity.subject, action: "user.update", targetClerkUserId: target.clerkUserId, targetEmail: args.email });
  },
});

export const setDisabled = action({
  args: { id: v.id("users"), disabled: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx); await ctx.runQuery(internal.users.requireAdmin, {}); const target = await ctx.runQuery(internal.users.byId, { id: args.id }); if (!target) throw new Error("USER_NOT_FOUND");
    if (target.clerkUserId) await clerkRequest(`/users/${encodeURIComponent(target.clerkUserId)}/${args.disabled ? "ban" : "unban"}`, { method: "POST" });
    await ctx.runMutation(internal.users.patchById, { id: args.id, actorClerkUserId: identity.subject, status: args.disabled ? "disabled" : "active" }); await ctx.runMutation(internal.users.audit, { actorClerkUserId: identity.subject, action: args.disabled ? "user.disable" : "user.enable", targetClerkUserId: target.clerkUserId, targetEmail: target.email });
  },
});

export const remove = action({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx); await ctx.runQuery(internal.users.requireAdmin, {});
    const target = await ctx.runQuery(internal.users.byId, { id: args.id }); if (!target) throw new Error("USER_NOT_FOUND");
    if (target.clerkUserId) await clerkRequest(`/users/${encodeURIComponent(target.clerkUserId)}`, { method: "DELETE" });
    await ctx.runMutation(internal.users.deleteById, { id: args.id });
    await ctx.runMutation(internal.users.audit, { actorClerkUserId: identity.subject, action: "user.delete", targetClerkUserId: target.clerkUserId, targetEmail: target.email });
  },
});

export const resetPassword = action({
  args: { id: v.id("users"), temporaryPassword: v.string() },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx); await ctx.runQuery(internal.users.requireAdmin, {}); if (args.temporaryPassword.length < 12) throw new Error("TEMP_PASSWORD_TOO_SHORT"); const target = await ctx.runQuery(internal.users.byId, { id: args.id }); if (!target) throw new Error("USER_NOT_FOUND"); if (!target.clerkUserId) throw new Error("USER_NOT_ACTIVATED");
    await clerkRequest(`/users/${encodeURIComponent(target.clerkUserId)}`, { method: "PATCH", body: JSON.stringify({ password: args.temporaryPassword, sign_out_of_other_sessions: true, public_metadata: { mustChangePassword: true, role: target.role, departmentId: target.departmentId } }) });
    await ctx.runMutation(internal.users.patchById, { id: args.id, actorClerkUserId: identity.subject, mustChangePassword: true, lastPasswordResetAt: Date.now() }); await ctx.runMutation(internal.users.audit, { actorClerkUserId: identity.subject, action: "user.password_reset", targetClerkUserId: target.clerkUserId, targetEmail: target.email });
  },
});
