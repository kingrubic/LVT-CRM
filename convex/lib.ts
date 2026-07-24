import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";

export type AuthCtx = QueryCtx | MutationCtx | ActionCtx;

export async function identityOrThrow(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) throw new Error("UNAUTHENTICATED");
  return identity;
}

export async function adminOrThrow(ctx: QueryCtx | MutationCtx) {
  const identity = await identityOrThrow(ctx);
  const user = await ctx.db.query("users").withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject)).unique();
  if (!user || user.status !== "active" || user.role !== "admin") throw new Error("FORBIDDEN: admin role required");
  return { identity, user };
}
