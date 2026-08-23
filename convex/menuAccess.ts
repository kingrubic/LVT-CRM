/** Canonical menu-access helpers. Giám thị (`supervisor`) is homeroom-only. */

export const SYSTEM_MENU_DEFS = [
  { id: "reports", label: "Báo cáo" },
  { id: "notifications", label: "Thông báo" },
  { id: "duties", label: "Công tác" },
  { id: "work", label: "Công việc" },
  { id: "homeroom", label: "Lớp chủ nhiệm" },
  { id: "people-review", label: "Đánh giá nhân sự" },
] as const;

export type MenuId = (typeof SYSTEM_MENU_DEFS)[number]["id"];
/** Stored/legacy values. `edit` remains readable so existing groups keep write semantics. */
export type MenuAccess = "hidden" | "view" | "view_all" | "edit" | "supervisor";
export type CanonicalMenuAccess = "hidden" | "view" | "view_all" | "supervisor";

export const HOMEROOM_MENU_ID: MenuId = "homeroom";
export const INVALID_MENU_ACCESS = "INVALID_MENU_ACCESS";

export function defaultMenuAccess(): { menu: string; access: MenuAccess }[] {
  return SYSTEM_MENU_DEFS.map((item) => ({
    menu: item.id,
    access: (item.id === "notifications" ? "view" : "hidden") as MenuAccess,
  }));
}

export function canonicalizeMenuAccessLevel(access: string | undefined): CanonicalMenuAccess {
  if (access === "edit") return "view";
  if (access === "supervisor") return "supervisor";
  if (access === "hidden" || access === "view" || access === "view_all") return access;
  return "hidden";
}

export function isMenuVisible(access: MenuAccess | CanonicalMenuAccess | undefined): boolean {
  return access != null && access !== "hidden";
}

export function isViewAllAccess(access: MenuAccess | CanonicalMenuAccess | undefined): boolean {
  return access === "view_all";
}

export function isHomeroomSupervisorAccess(
  access: MenuAccess | CanonicalMenuAccess | undefined,
): boolean {
  return access === "supervisor";
}

/**
 * Runtime resolution keeps legacy `edit` so duties/work write checks stay intact.
 * `supervisor` never grants another menu and never satisfies view_all.
 */
export function effectiveMenuAccessLevel(
  menu: string,
  raw: string | undefined,
): MenuAccess {
  if (raw === "supervisor") {
    return menu === HOMEROOM_MENU_ID ? "supervisor" : "hidden";
  }
  if (raw === "edit") return "edit";
  if (raw === "view" || raw === "view_all" || raw === "hidden") return raw;
  if (!raw) return menu === "notifications" ? "view" : "hidden";
  return "hidden";
}

export function assertValidMenuAccessEntries(
  entries: { menu: string; access: string }[] | undefined,
) {
  for (const entry of entries || []) {
    if (entry.access === "supervisor" && entry.menu !== HOMEROOM_MENU_ID) {
      throw new Error(INVALID_MENU_ACCESS);
    }
  }
}

export function normalizeMenuAccess(
  entries: { menu: string; access: MenuAccess | string }[] | undefined,
): { menu: string; access: MenuAccess }[] {
  const map = new Map((entries || []).map((e) => [e.menu, e.access]));
  return SYSTEM_MENU_DEFS.map((item) => {
    const raw = map.get(item.id);
    if (raw === "supervisor" && item.id !== HOMEROOM_MENU_ID) {
      return { menu: item.id, access: "hidden" as MenuAccess };
    }
    return {
      menu: item.id,
      access: canonicalizeMenuAccessLevel(raw) as MenuAccess,
    };
  });
}

/** Shared create/update boundary: reject crafted non-homeroom supervisor payloads. */
export function cleanPermissionGroupMenuAccess(
  entries: { menu: string; access: MenuAccess | string }[] | undefined,
): { menu: string; access: MenuAccess }[] {
  assertValidMenuAccessEntries(entries);
  const known = new Set(SYSTEM_MENU_DEFS.map((m) => m.id));
  for (const entry of entries || []) {
    if (entry.menu && !known.has(entry.menu as MenuId)) {
      throw new Error("INVALID_MENU");
    }
  }
  return normalizeMenuAccess(entries);
}
