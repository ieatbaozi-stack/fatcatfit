// โหมดสว่าง/มืด: "system" = ตามระบบ (ไม่ตั้ง data-theme ให้ CSS media query ทำงาน)
export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "fcf-theme";
export const THEME_PREFS: readonly ThemePref[] = ["system", "light", "dark"];

export function isThemePref(value: unknown): value is ThemePref {
  return typeof value === "string" && (THEME_PREFS as readonly string[]).includes(value);
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** อ่านค่าที่จำไว้ — storage ใช้ไม่ได้ (โหมดส่วนตัว/ถูกบล็อก) = ตามระบบ */
export function readThemePref(storage: StorageLike | null | undefined): ThemePref {
  try {
    const value = storage?.getItem(THEME_KEY);
    return isThemePref(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** ตั้งโหมดบน <html> และจำค่า (ไม่ throw ถ้า storage ใช้ไม่ได้) */
export function applyThemePref(pref: ThemePref, root: HTMLElement, storage: StorageLike | null | undefined): void {
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, pref);
  } catch {
    // จำค่าไม่ได้ก็ยังสลับได้ในหน้านี้
  }
}

/**
 * สคริปต์ที่รันใน <head> ก่อน paint (กันกะพริบ) — ต้องตรงกับ readThemePref/applyThemePref
 * (มีเทสต์เทียบพฤติกรรมไว้)
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
