import { internalMutation } from "./_generated/server";
import { defaultMenuAccess, normalizeMenuAccess } from "./lib";

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    for (const [code, name] of [
      ["BGH", "Ban giám hiệu"],
      ["TOAN", "Tổ Toán"],
      ["VAN", "Tổ Ngữ văn"],
      ["HC", "Hành chính"],
    ] as const) {
      if (!(await ctx.db.query("departments").withIndex("by_code", (q) => q.eq("code", code)).unique())) {
        await ctx.db.insert("departments", { code, name, active: true, createdAt: now, updatedAt: now });
      }
    }

    // Legacy admin role document: keep reconciled so older tooling still sees adminPermissions.
    const adminPermissions = [
      "users:read",
      "users:write",
      "users:disable",
      "users:password",
      "users:delete",
      "audit:read",
      "departments:write",
      "permissionGroups:write",
      "positions:write",
    ];
    const adminRole = await ctx.db.query("roles").withIndex("by_key", (q) => q.eq("key", "admin")).unique();
    if (adminRole?.active) {
      const permissions = [...new Set([...adminRole.permissions, ...adminPermissions])];
      if (adminPermissions.some((permission) => !adminRole.permissions.includes(permission))) {
        await ctx.db.patch(adminRole._id, { permissions, updatedAt: now });
      }
    } else if (!adminRole) {
      await ctx.db.insert("roles", {
        key: "admin",
        name: "Quản trị viên",
        permissions: adminPermissions,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Deactivate legacy non-system role keys (manager etc.); system role is users.role only.
    for (const key of ["manager", "user"] as const) {
      const legacy = await ctx.db.query("roles").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (legacy?.active) {
        await ctx.db.patch(legacy._id, { active: false, updatedAt: now });
      }
    }

    // Default permission groups for regular users.
    const groups = await ctx.db.query("permissionGroups").collect();
    if (!groups.some((g) => g.name === "Cơ bản")) {
      await ctx.db.insert("permissionGroups", {
        name: "Cơ bản",
        description: "Chỉ xem các menu nghiệp vụ cơ bản",
        menuAccess: normalizeMenuAccess(
          defaultMenuAccess().map((e) => ({
            ...e,
            access: e.menu === "reports" || e.menu === "work" ? "view" : "hidden",
          })),
        ),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (!groups.some((g) => g.name === "Toàn quyền nghiệp vụ")) {
      await ctx.db.insert("permissionGroups", {
        name: "Toàn quyền nghiệp vụ",
        description: "Xem và thao tác nghiệp vụ mọi menu Quản trị hệ thống (không gồm Cài đặt)",
        menuAccess: normalizeMenuAccess(
          defaultMenuAccess().map((e) => ({ ...e, access: "view_all" as const })),
        ),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const [code, name, level] of [
      ["HT", "Hiệu trưởng", 5],
      ["PHT", "Phó hiệu trưởng", 4],
      ["TT", "Tổ trưởng", 3],
      ["GV", "Giáo viên", 2],
      ["NV", "Nhân viên", 1],
    ] as const) {
      if (!(await ctx.db.query("positions").withIndex("by_code", (q) => q.eq("code", code)).unique())) {
        await ctx.db.insert("positions", {
          code,
          name,
          level,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});
