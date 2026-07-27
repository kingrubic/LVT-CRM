import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  adminPermissionOrThrow,
  DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
  DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
  getBooleanSystemSetting,
  getNumberArraySystemSetting,
  NOTIFICATION_DUTIES_ENABLED_SETTING_KEY,
  NOTIFICATION_MILESTONES_DEFAULT,
  NOTIFICATION_MILESTONES_SETTING_KEY,
  NOTIFICATION_SOURCE_DEFAULT,
  NOTIFICATION_WORK_ENABLED_SETTING_KEY,
} from "./lib";

function cleanMilestones(values: number[]) {
  const cleaned = [...new Set(values.map(Number))]
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 720)
    .sort((a, b) => b - a);
  if (!cleaned.length || cleaned.length > 20 || cleaned.length !== values.length) {
    throw new Error("INVALID_NOTIFICATION_MILESTONES");
  }
  return cleaned;
}

async function upsertBooleanSetting(ctx: any, key: string, value: boolean, userId: string, now: number) {
  const current = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  if (current) {
    await ctx.db.patch(current._id, { value, updatedBy: userId, updatedAt: now });
  } else {
    await ctx.db.insert("systemSettings", {
      key,
      value,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function upsertNumberArraySetting(ctx: any, key: string, numberValues: number[], userId: string, now: number) {
  const current = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  if (current) {
    await ctx.db.patch(current._id, { numberValues, updatedBy: userId, updatedAt: now });
  } else {
    await ctx.db.insert("systemSettings", {
      key,
      numberValues,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export const displaySettings = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "settings:read");
    const [
      dutyAttendanceConfirmationEnabled,
      notificationDutiesEnabled,
      notificationWorkEnabled,
      notificationMilestonesHours,
    ] = await Promise.all([
      getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
      getBooleanSystemSetting(
        ctx,
        NOTIFICATION_DUTIES_ENABLED_SETTING_KEY,
        NOTIFICATION_SOURCE_DEFAULT,
      ),
      getBooleanSystemSetting(
        ctx,
        NOTIFICATION_WORK_ENABLED_SETTING_KEY,
        NOTIFICATION_SOURCE_DEFAULT,
      ),
      getNumberArraySystemSetting(
        ctx,
        NOTIFICATION_MILESTONES_SETTING_KEY,
        NOTIFICATION_MILESTONES_DEFAULT,
      ),
    ]);
    return {
      dutyAttendanceConfirmationEnabled,
      notificationDutiesEnabled,
      notificationWorkEnabled,
      notificationMilestonesHours,
    };
  },
});

export const updateNotificationSettings = mutation({
  args: {
    dutiesEnabled: v.boolean(),
    workEnabled: v.boolean(),
    milestonesHours: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "settings:write");
    const milestonesHours = cleanMilestones(args.milestonesHours);
    const now = Date.now();
    await Promise.all([
      upsertBooleanSetting(
        ctx,
        NOTIFICATION_DUTIES_ENABLED_SETTING_KEY,
        args.dutiesEnabled,
        actor.user._id,
        now,
      ),
      upsertBooleanSetting(
        ctx,
        NOTIFICATION_WORK_ENABLED_SETTING_KEY,
        args.workEnabled,
        actor.user._id,
        now,
      ),
      upsertNumberArraySetting(
        ctx,
        NOTIFICATION_MILESTONES_SETTING_KEY,
        milestonesHours,
        actor.user._id,
        now,
      ),
    ]);
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "settings.notifications.update",
      details: JSON.stringify({
        dutiesEnabled: args.dutiesEnabled,
        workEnabled: args.workEnabled,
        milestonesHours,
      }),
      at: now,
    });
    return { milestonesHours };
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
