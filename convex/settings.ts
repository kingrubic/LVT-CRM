import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  adminPermissionOrThrow,
  DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
  DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
  getBooleanSystemSetting,
} from "./lib";

export const displaySettings = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "settings:read");
    return {
      dutyAttendanceConfirmationEnabled: await getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
    };
  },
});

export const updateDisplaySettings = mutation({
  args: {
    dutyAttendanceConfirmationEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "settings:write");
    const now = Date.now();
    const current = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY))
      .unique();
    const value = Boolean(args.dutyAttendanceConfirmationEnabled);
    if (current) {
      await ctx.db.patch(current._id, {
        value,
        updatedBy: actor.user._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("systemSettings", {
        key: DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        value,
        updatedBy: actor.user._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "settings.duty_attendance_confirmation.update",
      details: JSON.stringify({ value }),
      at: now,
    });
    return value;
  },
});
