"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { applyThemePref, readThemePref, THEME_KEY, THEME_PREFS, type ThemePref } from "./theme";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ThemePref {
  try {
    return readThemePref(window.localStorage);
  } catch {
    return "system";
  }
}

/** ตัวสลับโหมด: ตามระบบ / สว่าง / มืด · จำใน localStorage (CR4 Studio Minimal: แถบ segmented สะอาด) */
export function ThemeSwitch() {
  const t = useTranslations("me.theme");
  const current = useSyncExternalStore(subscribe, getSnapshot, () => "system" as ThemePref);

  function choose(pref: ThemePref) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    applyThemePref(pref, document.documentElement, storage);
    // storage ใช้ไม่ได้ก็ยังสลับได้ในหน้านี้ — แจ้งผู้ฟังให้อ่านใหม่
    listeners.forEach((l) => l());
  }

  return (
    <div role="group" aria-label={t("label")} className="flex flex-wrap gap-2">
      {THEME_PREFS.map((pref) => (
        <Chip key={pref} pressed={current === pref} surface="card" onClick={() => choose(pref)}>
          {t(pref)}
        </Chip>
      ))}
    </div>
  );
}
