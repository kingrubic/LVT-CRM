import { AuthConfig } from "convex/server";

// Configure CLERK_JWT_ISSUER_DOMAIN in the Convex deployment environment.
// It is the Clerk Frontend API URL, not the publishable or secret key.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
