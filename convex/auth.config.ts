// Convex Auth issues JWTs from this deployment's site URL (CONVEX_SITE_URL).
// JWT_PRIVATE_KEY and JWKS must be configured on the deployment environment.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
