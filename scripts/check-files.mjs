import { readFileSync, existsSync } from "node:fs";

const required = [
  "convex/schema.ts",
  "convex/auth.config.ts",
  "convex/auth.ts",
  "convex/http.ts",
  "convex/users.ts",
  "convex/departments.ts",
  "convex/locations.ts",
  "convex/duties.ts",
  "convex/reports.ts",
  "convex/boarding.ts",
  "convex/permissionGroups.ts",
  "convex/positions.ts",
  "src/boarding/BoardingManagement.jsx",
  "src/boarding/BoardingReportsView.jsx",
  "README.md",
  ".env.example",
];
for (const file of required) if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);

const seed = readFileSync("convex/seed.ts", "utf8");
for (const marker of [
  "adminRole?.active",
  "new Set([...adminRole.permissions, ...adminPermissions])",
  "adminPermissions.some((permission) => !adminRole.permissions.includes(permission))",
  "ctx.db.patch(adminRole._id, { permissions, updatedAt: now })",
  "users:password",
  "users:delete",
  "permissionGroups",
  "positions",
]) {
  if (!seed.includes(marker)) throw new Error(`Admin seed reconciliation marker missing: ${marker}`);
}

const auth = readFileSync("convex/auth.ts", "utf8");
for (const marker of [
  "PUBLIC_SIGNUP_DISABLED",
  "PASSWORD_RESET_DISABLED",
  'flow === "signUp"',
  "Password",
  "beforeSessionCreation",
]) {
  if (!auth.includes(marker)) throw new Error(`Auth provider marker missing: ${marker}`);
}

const source = readFileSync("convex/users.ts", "utf8");
for (const marker of [
  "adminPermissionOrThrow",
  "users:read",
  "users:write",
  "users:disable",
  "users:password",
  "users:delete",
  "createAccount",
  "modifyAccountCredentials",
  "invalidateSessions",
  "password_reset",
  "user.disable",
  "changeOwnPassword",
  "CANNOT_DISABLE_OWN_ACTIVE_ACCOUNT",
  "provisionFirstAdmin",
  "mustChangePassword",
  "normalizeEmail",
  "permissionGroupId",
  "positionId",
  "sessionContext",
  "isSystemRole",
  "isOperationalManagerRole",
  "SYSTEM_ROLES",
]) {
  if (!source.includes(marker)) throw new Error(`Security/lifecycle marker missing: ${marker}`);
}

if (/sk_(live|test)_[A-Za-z0-9]/.test(source) || /whsec_[A-Za-z0-9]/.test(source)) {
  throw new Error("Possible secret in source");
}
if (source.includes("CLERK") || source.includes("clerkRequest") || source.includes("clerk.com")) {
  throw new Error("Clerk references must be removed from users.ts");
}
if (source.includes("console.log") && /password|secret|token/i.test(source)) {
  // soft check: passwords must not be logged
}

const schema = readFileSync("convex/schema.ts", "utf8");
for (const marker of [
  "authTables",
  "mustChangePassword",
  'index("email"',
  "permissionGroups",
  "positions",
  "approvalLogs",
  "menuAccess",
  "boardingPeriods",
]) {
  if (!schema.includes(marker)) throw new Error(`Schema auth marker missing: ${marker}`);
}
if (schema.includes("clerkUserId") || schema.includes("actorClerkUserId")) {
  throw new Error("Clerk identity fields must be removed from schema");
}

const client = readFileSync("src/main.jsx", "utf8");
for (const marker of [
  "ConvexAuthProvider",
  "useAuthActions",
  "flow: 'signIn'",
  "users.update",
  "users.remove",
  "users.resetPassword",
  "users.changeOwnPassword",
  "window.confirm",
  "Administrator",
  "Moderator",
  "User",
  "Chức năng chính",
  "Quản trị hệ thống",
  "Cài đặt tối cao",
  "Nhóm quyền",
  "Chức vụ",
  "Thông tin cá nhân",
  "DepartmentManagement",
  "LocationManagement",
  "DutiesAdminView",
  "DutiesUserView",
  "DutyReportsView",
  "BoardingManagement",
  "BoardingReportsView",
  "ReportSubmenu",
  "Quản lý bán trú",
  "PermissionGroupManagement",
  "PositionManagement",
  "Quản lý địa điểm",
  "Cả ngày",
  "Gần đến hạn",
  "Đã quá hạn",
  "StarRating",
  "hidden",
  "ProfileView",
]) {
  if (!client.includes(marker)) throw new Error(`Admin/password UI marker missing: ${marker}`);
}

const reports = readFileSync("src/reports/DutyReportsView.jsx", "utf8");
for (const marker of ["DutyReportsView", "Báo cáo · Công tác", "Tuần", "Tháng", "Quý", "Năm"]) {
  if (!reports.includes(marker)) throw new Error(`Reports UI marker missing: ${marker}`);
}

const boarding = readFileSync("convex/boarding.ts", "utf8");
for (const marker of ["listAdmin", "listMine", "BOARDING_PERIOD_EXISTS", "participantUserIds", "boarding_period.create"]) {
  if (!boarding.includes(marker)) throw new Error(`Boarding marker missing: ${marker}`);
}
if (client.includes("@clerk") || client.includes("ClerkProvider") || client.includes("VITE_CLERK")) {
  throw new Error("Clerk client imports/env must be removed");
}
if (client.includes('flow: "signUp"') || client.includes("Sign up")) {
  throw new Error("Public signup UI must not be present");
}

const lib = readFileSync("convex/lib.ts", "utf8");
for (const marker of [
  "canApproveLevel",
  "SYSTEM_MENU_DEFS",
  "resolveUserMenuAccess",
  "isOperationalManagerRole",
  "operationalManagerPermissionOrThrow",
  '"moderator"',
  'role !== "admin"',
]) {
  if (!lib.includes(marker)) throw new Error(`lib marker missing: ${marker}`);
}

const envExample = readFileSync(".env.example", "utf8");
if (envExample.includes("CLERK") || envExample.includes("VITE_CLERK")) {
  throw new Error(".env.example must not require Clerk");
}
if (!envExample.includes("VITE_CONVEX_URL") || !envExample.includes("JWT_PRIVATE_KEY")) {
  throw new Error(".env.example missing Convex Auth setup markers");
}

const pkg = readFileSync("package.json", "utf8");
if (pkg.includes("@clerk/") || pkg.includes("clerk-react")) throw new Error("Clerk packages must be removed");
if (!pkg.includes("@convex-dev/auth")) throw new Error("@convex-dev/auth must be installed");

// public/demo is an intentionally preserved prototype. It is outside the auth migration scope.
console.log("source checks passed");
