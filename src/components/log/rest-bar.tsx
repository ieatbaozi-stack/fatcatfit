"use client";
// ตัวจับเวลาพัก (UX 4 · contract D1): เริ่มเองหลัง ✓ · −15/+15 ปรับเฉพาะรอบนี้ · ครบ: "ไปต่อ" + สั่น (Android) + เสียงสั้นถ้าแอปเปิดอยู่
// เวลาที่เหลือคำนวณจาก timestamp ทุกครั้งที่วาด (จอดับแล้วกลับมายังถูก) · ไม่ใช้ส้ม (ส้มของหน้าจดเป็นของ ✓ · UX 6)

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { TextButton } from "@/components/ui/button";
import { formatClock, REST_STEP_S, restDone, restRemainingS, type RestTimer } from "@/lib/offline/timer";
import { adjustRestTimer, skipRest } from "./log-actions";
import { alertRestDone } from "./rest-alert";
import { useNow } from "./use-now";

/** เตือนเฉพาะตอนครบจริงๆ (ไม่เตือนย้อนหลังตอนกลับมาเปิดแอปหลังพักครบไปนานแล้ว) */
const ALERT_WINDOW_MS = 3000;

export function RestBar({ rest }: { rest: RestTimer }) {
  const t = useTranslations("log.rest");
  const now = useNow(true, 250);
  const done = restDone(rest, now);
  const alerted = useRef<number | null>(null);
  const endsAt = rest.started_at + rest.duration_s * 1000;
  const pct = rest.duration_s > 0 ? Math.min(100, Math.max(0, ((now - rest.started_at) / (rest.duration_s * 1000)) * 100)) : 100;

  useEffect(() => {
    if (!done || alerted.current === rest.started_at) return;
    alerted.current = rest.started_at;
    if (Date.now() - endsAt < ALERT_WINDOW_MS) alertRestDone();
  }, [done, rest.started_at, endsAt]);

  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper-2 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <p className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-caption text-ink-3">{t("label")}</span>
          <span className="num text-numeral" aria-live="off">
            {done ? t("go") : formatClock(restRemainingS(rest, now))}
          </span>
        </p>
        <TextButton className="bg-surface-2 px-2.5" aria-label={t("minus", { s: REST_STEP_S })} disabled={done} onClick={() => void adjustRestTimer(-REST_STEP_S)}>
          −{REST_STEP_S}
        </TextButton>
        <TextButton className="bg-surface-2 px-2.5" aria-label={t("plus", { s: REST_STEP_S })} onClick={() => void adjustRestTimer(REST_STEP_S)}>
          +{REST_STEP_S}
        </TextButton>
        <TextButton className="bg-surface-2 px-3" onClick={() => void skipRest()}>
          {done ? t("dismiss") : t("skip")}
        </TextButton>
      </div>
      <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-ink-3" style={{ width: `${pct}%` }} />
      </div>
      {/* ประกาศครั้งเดียวตอนครบ */}
      <p role="status" className="sr-only">
        {done ? t("done") : ""}
      </p>
    </div>
  );
}
