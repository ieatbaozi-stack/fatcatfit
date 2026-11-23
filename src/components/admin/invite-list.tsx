"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, TextButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { reloadPage, revokeInvite, type InviteRow, type InviteStatus } from "./invite-api";
import { formatInviteDate } from "./invite-format";

const SKELETON_DELAY_MS = 400;

function StatusIcon({ status }: { status: InviteStatus }) {
  if (status === "exhausted") return <Icon name="check" size={16} />;
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true" className="block flex-none">
      {status === "active" ? (
        <>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={2.2} />
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
        </>
      ) : status === "expired" ? (
        <path
          d="M12 3 A9 9 0 1 0 12.1 3 M12 7 L12 12.5 L16 14.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      )}
    </svg>
  );
}

function ListSkeleton() {
  const t = useTranslations("admin.invites");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);
  // น้อยกว่า 400 ms ไม่แสดงอะไร (กันกะพริบ)
  if (!shown) return null;
  return (
    <ul role="status" aria-label={t("list.loading")} className="m-0 flex list-none flex-col p-0">
      {[0, 1, 2].map((i) => (
        <li key={i} aria-hidden="true" className="flex min-h-18 flex-col justify-center gap-2 border-b border-ink-3/40 py-3">
          <div className="h-5 w-40 rounded-box bg-paper-2" />
          <div className="h-4 w-56 rounded-box bg-paper-2" />
        </li>
      ))}
    </ul>
  );
}

export type ListView = { status: "loading" | "ok" | "error"; rows: InviteRow[] };

/** รายการโค้ดที่ออกแล้ว (UX 11.5): ป้าย · สถานะ (ไอคอน + คำ) · ใช้ไป x/y · ถึงเมื่อไร · ปุ่มเพิกถอนเฉพาะ "ใช้ได้" */
export function InviteList({
  view,
  highlightId,
  online,
  onRetry,
  onRevoke,
}: {
  view: ListView;
  highlightId: string | null;
  online: boolean;
  onRetry: () => void;
  onRevoke: (row: InviteRow) => void;
}) {
  const t = useTranslations("admin.invites");
  const locale = useLocale();

  return (
    <section aria-labelledby="invite-list-title" className="flex flex-col gap-2">
      <h2 id="invite-list-title" className="text-section">
        {t("list.title")}
      </h2>
      {view.rows.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {view.rows.map((row) => {
            const active = row.status === "active";
            return (
              <li
                key={row.id}
                id={`invite-row-${row.id}`}
                tabIndex={-1}
                className={cx(
                  "flex min-h-18 items-center gap-3 border-b border-ink-3/40 px-1 py-3 transition-colors duration-700",
                  highlightId === row.id && "bg-paper-2 motion-reduce:bg-transparent",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-normal text-ink">{row.label}</p>
                  <p className={cx("flex items-center gap-1.5 text-caption", active ? "text-ink" : "text-ink-3")}>
                    <StatusIcon status={row.status} />
                    <span>{t(`status.${row.status}`)}</span>
                  </p>
                  <p className="text-caption text-ink-3 tabular-nums">
                    {active
                      ? t("list.meta", {
                          used: row.usesCount,
                          max: row.maxUses,
                          date: formatInviteDate(row.expiresAt, locale),
                        })
                      : t("list.metaInactive", { used: row.usesCount, max: row.maxUses })}
                  </p>
                </div>
                {active ? (
                  <button
                    type="button"
                    disabled={!online}
                    aria-label={t("revoke.buttonLabel", { label: row.label })}
                    onClick={() => onRevoke(row)}
                    className="inline-flex min-h-11 min-w-11 flex-none cursor-pointer items-center justify-center rounded-hand border-draw-thin border-ink bg-transparent px-3 text-body font-normal text-ink disabled:cursor-not-allowed disabled:border-dashed disabled:text-ink-3"
                  >
                    {t("revoke.button")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : view.status === "loading" ? (
        <ListSkeleton />
      ) : view.status === "error" ? (
        <div className="flex flex-col items-start gap-1">
          <p role="status" className="text-body text-ink">
            {t("list.loadFailed")}
          </p>
          <p className="text-caption text-ink-3">{t("list.loadFailedHint")}</p>
          <TextButton className="-ml-3" onClick={onRetry}>
            {t("list.retry")}
          </TextButton>
        </div>
      ) : (
        <p className="text-body text-ink-2">{t("list.empty")}</p>
      )}
    </section>
  );
}

type SheetState = "confirm" | "busy" | "failed";

/** แผ่นล่างยืนยันเพิกถอน (UX 11.6): focus เริ่มที่ "ยกเลิก" และถูกขังในแผ่น · Esc/แตะพื้นมืด = ปิด */
export function RevokeSheet({
  row,
  online,
  onClose,
  onDone,
}: {
  row: InviteRow;
  online: boolean;
  onClose: () => void;
  onDone: (result: "revoked" | "unchanged") => void;
}) {
  const t = useTranslations("admin.invites");
  const [state, setState] = useState<SheetState>("confirm");
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = state === "busy";

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    if (busy || !online) return;
    setState("busy");
    const r = await revokeInvite(row.id);
    if (r.ok) return onDone(r.result);
    if (r.reason === "not_found") return reloadPage();
    setState("failed");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-scrim" onClick={() => (busy ? undefined : onClose())} aria-hidden="true" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="revoke-title"
        className="pb-safe absolute inset-x-3 bottom-3 mx-auto flex max-w-114 flex-col gap-3 rounded-hand border-draw border-ink bg-paper p-5"
      >
        <h2 id="revoke-title" className="text-section">
          {t("revoke.title", { label: row.label })}
        </h2>
        <p className="text-body text-ink-2">{t("revoke.body")}</p>
        <p className="text-caption text-ink-3">{t("revoke.note")}</p>
        {state === "failed" ? (
          <p role="alert" className="text-caption text-warn">
            {t("revoke.failed")}
          </p>
        ) : null}
        <Button loading={busy} disabled={!online} onClick={() => void confirm()} className="border-warn text-warn">
          {busy ? t("revoke.revoking") : state === "failed" ? t("revoke.retry") : t("revoke.confirm")}
        </Button>
        <TextButton ref={cancel} disabled={busy} onClick={onClose}>
          {t("revoke.cancel")}
        </TextButton>
      </div>
    </div>
  );
}
