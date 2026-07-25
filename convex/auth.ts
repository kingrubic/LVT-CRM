import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

// Sign-in only Password provider. Public sign-up, email verification, and
// email/OTP password recovery are rejected at the provider authorize boundary.
// Profile is only used to extract/normalize email for retrieveAccount on sign-in
// (account creation is admin-only via createAccount with full CRM profile).
const PasswordSignInOnly = Password({
  profile(params) {
    const flow = String(params.flow ?? "");
    if (flow === "signUp") throw new Error("PUBLIC_SIGNUP_DISABLED");
    if (flow === "reset" || flow === "reset-verification") throw new Error("PASSWORD_RESET_DISABLED");
    if (flow === "email-verification") throw new Error("EMAIL_VERIFICATION_DISABLED");
    if (flow !== "signIn") throw new Error("INVALID_AUTH_FLOW");

    const email = normalizeEmail(params.email);
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      throw new Error("INVALID_EMAIL");
    }
    return { email };
  },
  validatePasswordRequirements(password: string) {
    if (!password || password.length < 12) throw new Error("PASSWORD_TOO_SHORT");
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordSignInOnly],
  callbacks: {
    async beforeSessionCreation(ctx: MutationCtx, { userId }: { userId: Id<"users"> }) {
      const user = await ctx.db.get(userId);
      if (!user || user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    },
  },
});
