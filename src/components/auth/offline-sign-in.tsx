"use client";

import { useTranslations } from "next-intl";
import { Cat } from "@/components/doodle";
import { Button } from "@/components/ui/button";
import { HandWord } from "@/components/ui/hand-word";

/** จอยินดีต้อนรับตอนออฟไลน์ (เกณฑ์ 13): แมว #24 + ปุ่มปิด "ต้องต่อเน็ตเพื่อเข้าสู่ระบบ" · ใช้ทั้งบน /welcome และแทนเนื้อหาในที่เดิม */
export function OfflineSignIn() {
  const t = useTranslations("offline");
  const app = useTranslations("app");
  const welcome = useTranslations("welcome");
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <HandWord as="p" className="text-hand">
        {app("name")}
      </HandWord>
      <h1 className="mt-1 text-page">{welcome("title")}</h1>
      <Cat pose="offline" size={176} className="mt-6 text-ink" />
      <p role="status" className="mt-4 text-section text-ink">
        {t("title")}
      </p>
      <p className="mt-1 max-w-72 text-body text-ink-2">{t("body")}</p>
      <div className="mt-auto w-full pt-8">
        <Button disabled>{t("signInClosed")}</Button>
      </div>
    </div>
  );
}

/** แถบบางบนสุด "เน็ตหลุด" (ไม่มีแมว) — ช่วง B ใช้เป็นแถบเดียวทั้งแอป */
export function OfflineBar() {
  const t = useTranslations("offline");
  return (
    <div role="status" className="mb-4 rounded-box border-draw-thin border-ink px-3 py-1.5 text-caption text-ink">
      {t("bar")}
    </div>
  );
}
