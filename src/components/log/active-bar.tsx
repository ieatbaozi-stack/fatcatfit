"use client";
// แถบ "กำลังเล่น" (UX 1): ลอยเหนือแถบล่างของทุกแท็บขณะมีเซสชันค้าง · ชื่อ · เวลาที่ผ่านไป · เวลาพักที่เหลือ · แตะ = กลับหน้าจด
// ไม่แสดงในหน้าจดเอง และไม่แสดงในหน้าที่ซ่อนแถบล่าง (ฟอร์ม)

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTabsHidden } from "@/components/nav/tabs-visibility";
import { useLocalView } from "@/components/sync/use-offline";
import { cx } from "@/components/ui/cx";
import { formatClock, restDone, restRemainingS } from "@/lib/offline/timer";
import { elapsedMs } from "./session-logic";
import { useSessionTitle } from "./session-title";
import { useNow } from "./use-now";

/** แถบนี้โผล่อยู่ไหม (ปุ่มหลักลอยของหน้าอื่นหลบขึ้นไปตาม) */
export function useActiveBarVisible(): boolean {
  const view = useLocalView();
  const pathname = usePathname();
  const hidden = useTabsHidden();
  return view.activeSession !== null && pathname !== "/log" && !hidden;
}

export function ActiveSessionBar() {
  const t = useTranslations("log.active");
  const view = useLocalView();
  const visible = useActiveBarVisible();
  const d = view.activeSession;
  const title = useSessionTitle(d);
  const now = useNow(visible, 1000);
  if (!visible || !d) return null;
  const resting = d.rest && !restDone(d.rest, now);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 mx-auto w-full max-w-120 px-3">
      <Link
        href="/log"
        aria-label={t("label", { name: title })}
        className={cx("pointer-events-auto flex min-h-12 items-center gap-3 rounded-hand bg-ink px-4 py-2 text-paper no-underline shadow-elevated")}
      >
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-caption opacity-80">{t("now")}</span>
          <span className="truncate text-body font-medium">{title}</span>
        </span>
        <span className="num flex-none text-body text-paper!">{formatClock(Math.round(elapsedMs(d, now) / 1000))}</span>
        {resting && d.rest ? (
          <span className="num flex-none rounded-box border border-paper/35 px-2 py-0.5 text-caption text-paper!">
            {t("rest", { time: formatClock(restRemainingS(d.rest, now)) })}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
