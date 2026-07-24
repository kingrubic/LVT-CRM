import { readFileSync, existsSync } from "node:fs";
const required = ["convex/schema.ts", "convex/auth.config.ts", "convex/users.ts", "README.md", ".env.example"];
for (const file of required) if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);
const source = readFileSync("convex/users.ts", "utf8");
for (const marker of ["adminOrThrow", "clerkRequest", "password_reset", "user.disable"]) if (!source.includes(marker)) throw new Error(`Security/lifecycle marker missing: ${marker}`);
if (/sk_(live|test)_[A-Za-z0-9]/.test(source) || /whsec_[A-Za-z0-9]/.test(source)) throw new Error("Possible secret in source");
console.log("source checks passed");
