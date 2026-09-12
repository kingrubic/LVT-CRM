/** Pure notification-milestone helpers. Keep this file free of Convex auth/server imports. */

export const NOTIFICATION_MILESTONES_DEFAULT = [48, 24, 12, 0] as const;
export const HOUR_MS = 60 * 60 * 1000;
export const OVERDUE_VISIBILITY_MS = 24 * HOUR_MS;

export type MilestoneSource = {
  kind: string;
  sourceType: string;
  sourceId: string;
  title: string;
  description?: string;
  dueAt: number;
  priority?: "high" | "normal";
};

export function cleanNotificationMilestones(values: number[]): number[] {
  const cleaned = [...new Set(values.map(Number))]
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 720)
    .sort((a, b) => b - a);
  if (!cleaned.length || cleaned.length > 20 || cleaned.length !== values.length) {
    throw new Error("INVALID_NOTIFICATION_MILESTONES");
  }
  return cleaned;
}

/** Personal reminders may be enabled with no hours yet; empty is valid. */
export function cleanPersonalReminderMilestones(values: number[]): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  return cleanNotificationMilestones(values);
}

export function mergeMilestoneItems<T extends {
  key: string;
  availableAt: number;
  title: string;
  sourceType: string;
  sourceId: string;
}>(
  groups: T[][],
): T[] {
  const byKey = new Map<string, T>();
  for (const group of groups) {
    for (const item of group) {
      if (!byKey.has(item.key)) byKey.set(item.key, item);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.availableAt - a.availableAt || a.title.localeCompare(b.title, "vi"),
  );
}

export function resolveSourceMilestones(
  specific: number[] | null | undefined,
  shared: number[] | null | undefined,
  fallback: readonly number[] = NOTIFICATION_MILESTONES_DEFAULT,
): number[] {
  if (specific && specific.length) return [...specific];
  if (shared && shared.length) return [...shared];
  return [...fallback];
}

export function unionMilestoneHours(...lists: number[][]): number[] {
  return [...new Set(lists.flat())]
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => b - a);
}

export function createMilestones(
  sources: MilestoneSource[],
  milestonesHours: number[],
  now: number,
) {
  const prioritySources = sources.filter((source) => source.priority === "high");
  const regularSources = sources.filter((source) => source.priority !== "high");
  const priorityItems = prioritySources.map((source) => ({
    key: `${source.kind}:${source.sourceType}:${source.sourceId}:reject`,
    ...source,
    milestoneHours: -1,
    milestoneLabel: "Bị từ chối",
    availableAt: source.dueAt,
  }));
  const regularItems = regularSources
    .flatMap((source) =>
      milestonesHours
        .filter((hours) => now >= source.dueAt - hours * HOUR_MS)
        .map((hours) => ({
          key: `${source.kind}:${source.sourceType}:${source.sourceId}:${hours}`,
          ...source,
          milestoneHours: hours,
          milestoneLabel: hours === 0 ? "Đến hạn" : `Còn ${hours} giờ`,
          availableAt: source.dueAt - hours * HOUR_MS,
        })),
    )
    .filter((item) => item.dueAt >= now - OVERDUE_VISIBILITY_MS)
    .sort((a, b) => b.availableAt - a.availableAt || a.title.localeCompare(b.title, "vi"));
  return [...priorityItems, ...regularItems];
}
