"use client";
// แถบสถานะการส่ง (UX 13.1) — ที่เดียวของแอป: ออฟไลน์ · ค้างส่ง · กำลังส่ง · ส่งครบ · ส่งไม่ผ่าน · ต้องเข้าสู่ระบบ
// อยู่บนสุดของทุกหน้าใน (app) · แถบที่มีการกระทำแตะได้ทั้งแถบ สูง ≥ 44px · ไม่มีส้ม ไม่สื่อด้วยสีอย่างเดียว

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui/cx";
import { Icon, type IconName } from "@/components/ui/icon";
import { syncNow } from "@/lib/offline/client";
import { RejectedSheet } from "./rejected-sheet";
import { barNeedsClock, barOf, type BarKind } from "./sync-logic";
import { useSyncStatus } from "./use-offline";

const ICON: Record<BarKind, IconName> = {
  authNeeded: "warn",
  storage: "warn",
  rejected: "warn",
  stale: "warn",
  offlinePending: "cloudOff",
  offline: "cloudOff",
  pending: "sync",
  sending: "sync",
  done: "check",
};

const BOX = "mb-4 flex items-center gap-2 rounded-box border-draw-thin border-ink px-3 py-1.5 text-caption text-ink";

export function SyncBar({ offline }: { offline: boolean }) {
  const t = useTranslations("sync.bar");
  const to = useTranslations("offline");
  const status = useSyncStatus();
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);
  const clock = barNeedsClock(status, now);

  useEffect(() => {
    if (!clock) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [clock]);

  const bar = barOf(status, offline, now);
  const text = bar
    ? bar.kind === "offline"
      ? to("bar")
      : bar.kind === "storage"
        ? t("storage")
        : t(bar.kind, { count: bar.count })
    : null;

  let body: React.ReactNode = null;
  if (bar && text) {
    const icon = <Icon name={ICON[bar.kind]} size={18} className={cx(bar.kind === "authNeeded" || bar.kind === "rejected" || bar.kind === "stale" || bar.kind === "storage" ? "text-warn" : "text-ink")} />;
    const label = <span className="min-w-0 flex-1 break-words">{text}</span>;
    if (bar.kind === "authNeeded") {
      body = (
        <Link href="/welcome" className={cx(BOX, "min-h-11 no-underline")}>
          {icon}
          {label}
          <span className="flex-none underline-hand">{t("signIn")}</span>
        </Link>
      );
    } else if (bar.kind === "rejected") {
      body = (
        <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={cx(BOX, "min-h-11 w-full cursor-pointer text-left")}>
          {icon}
          {label}
          <span className="flex-none underline-hand">{t("view")}</span>
        </button>
      );
    } else if (bar.kind === "pending") {
      body = (
        <button type="button" onClick={() => void syncNow()} className={cx(BOX, "min-h-11 w-full cursor-pointer text-left")}>
          {icon}
          {label}
          <span className="flex-none underline-hand">{t("syncNow")}</span>
        </button>
      );
    } else {
      body = (
        <div className={BOX}>
          {icon}
          {label}
        </div>
      );
    }
  }

  return (
    <>
      {/* live region ตัวเดียวคงอยู่ — ข้อความเปลี่ยนแล้วโปรแกรมอ่านจออ่านเอง */}
      <div role="status" aria-live="polite">
        {body}
      </div>
      {open && status.rejected > 0 ? <RejectedSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
