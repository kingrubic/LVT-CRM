import { internalMutation } from "./_generated/server";

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const [code, name] of [["BGH", "Ban giám hiệu"], ["TOAN", "Tổ Toán"], ["VAN", "Tổ Ngữ văn"], ["HC", "Hành chính"]] as const) {
      if (!(await ctx.db.query("departments").withIndex("by_code", (q) => q.eq("code", code)).unique())) await ctx.db.insert("departments", { code, name, active: true, createdAt: now, updatedAt: now });
    }
    for (const [key, name, permissions] of [["admin", "Quản trị viên", ["users:read", "users:write", "users:disable", "audit:read"]], ["manager", "Quản lý", ["reports:read", "work:write"]], ["user", "Người dùng", ["workspace:read"]]] as const) {
      if (!(await ctx.db.query("roles").withIndex("by_key", (q) => q.eq("key", key)).unique())) await ctx.db.insert("roles", { key, name, permissions: [...permissions], active: true, createdAt: now, updatedAt: now });
    }
  },
});
