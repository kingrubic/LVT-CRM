/** Pure menu-access levels for permission groups. */

export const SYSTEM_MENU_DEFS = [
  { id: "reports", label: "Báo cáo" },
  { id: "notifications", label: "Thông báo" },
  { id: "duties", label: "Công tác" },
  { id: "work", label: "Công việc" },
  { id: "homeroom", label: "Lớp chủ nhiệm" },
  { id: "people-review", label: "Đánh giá nhân sự" },
] as const;

export type MenuId = (typeof SYSTEM_MENU_DEFS)[number]["id"];
export type MenuAccess = "hidden" | "view" | "view_all";
/** Stored rows may still have `edit`; normalizeMenuAccess maps it to `view`. */
export type LegacyMenuAccess = MenuAccess | "edit";

export function defaultAccessForMenu(menuId: string): MenuAccess {
  return menuId === "notifications" ? "view" : "hidden";
}

export function defaultMenuAccess(): { menu: string; access: MenuAccess }[] {
  return SYSTEM_MENU_DEFS.map((item) => ({
    menu: item.id,
    access: defaultAccessForMenu(item.id),
  }));
}

function coerceMenuAccess(access: string | undefined, fallback: MenuAccess): MenuAccess {
  if (access === "edit") return "view";
  if (access === "hidden" || access === "view" || access === "view_all") return access;
  return fallback;
}

/** View, view-all, and legacy edit all allow module business operations; hidden does not. */
export function canOperateMenu(access: string | undefined): boolean {
  return access === "view" || access === "view_all" || access === "edit";
}

export function normalizeMenuAccess(
  entries: { menu: string; access: LegacyMenuAccess | string }[] | undefined,
): { menu: string; access: MenuAccess }[] {
  const map = new Map((entries || []).map((e) => [e.menu, e.access]));
  return SYSTEM_MENU_DEFS.map((item) => {
    const fallback = defaultAccessForMenu(item.id);
    return {
      menu: item.id,
      access: coerceMenuAccess(map.get(item.id), fallback),
    };
  });
}
