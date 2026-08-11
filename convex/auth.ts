import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Scrypt } from "lucia";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

/**
 * Password sign-in only, with SYS-008 lockout:
 * - reject locked / inactive accounts before credential check
 * - count failures and lock after configured threshold
 * - public sign-up / reset / email-verify remain disabled
 */
const PasswordSignInOnly = ConvexCredentials({
  id: "password",
  authorize: async (params, ctx) => {
    const flow = String(params.flow ?? "");
    if (flow === "signUp") throw new Error("PUBLIC_SIGNUP_DISABLED");
    if (flow === "reset" || flow === "reset-verification") throw new Error("PASSWORD_RESET_DISABLED");
    if (flow === "email-verification") throw new Error("EMAIL_VERIFICATION_DISABLED");
    if (flow !== "signIn") throw new Error("INVALID_AUTH_FLOW");

    const email = normalizeEmail(params.email);
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      throw new Error("INVALID_EMAIL");
    }
    const secret = params.password;
    if (typeof secret !== "string" || !secret) {
      throw new Error("Invalid credentials");
    }
    if (secret.length < 8) throw new Error("PASSWORD_TOO_SHORT");

    const lockStatus = await ctx.runQuery(internal.loginSecurity.lockStatusByEmail, { email });
    if (lockStatus.loginLocked) throw new Error("ACCOUNT_LOCKED");
    if (lockStatus.locked) throw new Error("USER_NOT_ACTIVE");

    try {
      const retrieved = await retrieveAccount(ctx, {
        provider: "password",
        account: { id: email, secret },
      });
      if (retrieved === null) {
        const result = await ctx.runMutation(internal.loginSecurity.recordFailure, { email });
        if (result.locked || result.newlyLocked) throw new ConvexError("ACCOUNT_LOCKED");
        throw new ConvexError("INVALID_CREDENTIALS");
      }
      await ctx.runMutation(internal.loginSecurity.clearFailures, { email });
      return { userId: retrieved.user._id };
    } catch (error) {
      const raw = errorMessage(error);
      if (
        raw.includes("InvalidSecret") ||
        raw.includes("InvalidAccountId") ||
        raw.includes("TooManyFailedAttempts")
      ) {
        const result = await ctx.runMutation(internal.loginSecurity.recordFailure, { email });
        if (result.locked || result.newlyLocked) throw new ConvexError("ACCOUNT_LOCKED");
        throw new ConvexError("INVALID_CREDENTIALS");
      }
      throw error;
    }
  },
  crypto: {
    async hashSecret(password: string) {
      return await new Scrypt().hash(password);
    },
    async verifySecret(password: string, hash: string) {
      return await new Scrypt().verify(hash, password);
    },
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordSignInOnly],
  // Keep library rate-limit high so SYS-008 window/threshold is the controlling policy.
  signIn: { maxFailedAttempsPerHour: 1000 },
  callbacks: {
    async beforeSessionCreation(ctx: MutationCtx, { userId }: { userId: Id<"users"> }) {
      const user = await ctx.db.get(userId);
      if (!user || user.status !== "active") throw new Error("USER_NOT_ACTIVE");
      if (user.loginLockedAt) throw new Error("ACCOUNT_LOCKED");
    },
  },
});
