"use client";
// แผ่น "ส่งไม่ผ่าน" (UX 13.2 · เกณฑ์ 11) — เปิดจากแถบสถานะ · จดต่อได้ปกติ ไม่มีอะไรถูกปิด
// ทิ้ง = ไม่ถาม · ซ่อนแถว 5 วิพร้อม "เลิกทำ" แล้วค่อยเรียก discardRejected (API ไม่มี undo) · ปิดแผ่นระหว่างรอ = ทิ้งทันที

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { discardRejected, listRejected } from "@/lib/offline/client";
import type { RejectedGroup } from "@/lib/offline/rejected";
import pkg from "../../../package.json";
import { copyText, describeRejected, type Translate } from "./rejected-format";
import { useSyncStatus } from "./use-offline";

const UNDO_MS = 5000;

type Notice = { kind: "discarded"; opIds: string[] } | { kind: "copied" } | { kind: "copyFailed"; text: string } | null;

export function RejectedSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const titleId = useId();
  const status = useSyncStatus();
  const [groups, setGroups] = useState<RejectedGroup[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  // ทิ้งที่รอหมดเวลา: key = op_id แรกของกลุ่ม
  const timers = useRef(new Map<string, { id: number; opIds: string[] }>());
  const tr: Translate = (key, values) => t(key as never, values as never);

  const refresh = useCallback(async () => {
    setGroups(await listRejected());
  }, []);

  useEffect(() => {
    // อ่านรายการจากที่เก็บในเครื่องเมื่อเปิดแผ่น/จำนวนเปลี่ยน — setState เกิดหลังคำตอบ
    let alive = true;
    void listRejected().then((g) => alive && setGroups(g));
    return () => {
      alive = false;
    };
  }, [status.rejected]);

  // ปิดแผ่นระหว่างรอเลิกทำ = ทิ้งจริงเลย (ไม่ปล่อยค้าง)
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const { id, opIds } of pending.values()) {
        window.clearTimeout(id);
        void discardRejected(opIds);
      }
      pending.clear();
    };
  }, []);

  const visible = groups.filter((g) => !hidden.has(g.item.op_id));

  // ทิ้งครบ = แผ่นปิดเอง (แถบข้อ 2 หายเมื่อ rejected = 0)
  useEffect(() => {
    if (groups.length > 0 && visible.length === 0 && timers.current.size === 0) onClose();
    if (status.rejected === 0 && timers.current.size === 0) onClose();
  }, [groups.length, visible.length, status.rejected, onClose]);

  function discard(g: RejectedGroup) {
    const key = g.item.op_id;
    setHidden((h) => new Set(h).add(key));
    setNotice({ kind: "discarded", opIds: g.opIds });
    const id = window.setTimeout(() => {
      timers.current.delete(key);
      void discardRejected(g.opIds).then(refresh);
      setNotice((n) => (n?.kind === "discarded" && n.opIds === g.opIds ? null : n));
    }, UNDO_MS);
    timers.current.set(key, { id, opIds: g.opIds });
  }

  function undo() {
    if (notice?.kind !== "discarded") return;
    for (const [key, v] of timers.current) {
      if (v.opIds === notice.opIds) {
        window.clearTimeout(v.id);
        timers.current.delete(key);
        setHidden((h) => {
          const n = new Set(h);
          n.delete(key);
          return n;
        });
      }
    }
    setNotice(null);
  }

  async function copy(list: readonly RejectedGroup[]) {
    const text = copyText(list, tr, locale, pkg.version);
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ kind: "copied" });
    } catch {
      setNotice({ kind: "copyFailed", text });
    }
  }

  const stillPending = status.pending;

  return (
    <Sheet titleId={titleId} onClose={onClose}>
      <h2 id={titleId} className="text-section">
        {t("sync.rejected.title", { count: visible.length || status.rejected })}
      </h2>
      <p className="text-body text-ink-2">{t("sync.rejected.body")}</p>
      {stillPending > 0 ? <p className="text-caption text-ink-3">{t("sync.rejected.stillPending", { count: stillPending })}</p> : null}

      <ul className="m-0 flex list-none flex-col p-0">
        {visible.map((g) => {
          const r = describeRejected(g, tr, locale);
          return (
            <li key={g.item.op_id} className="flex items-start gap-2 border-b border-ink-3/40 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="break-words text-body font-medium text-ink">{[r.kind, r.title].filter(Boolean).join(" · ")}</p>
                <p className="num break-words text-caption text-ink-2">{r.detail}</p>
                <p className="break-words text-caption text-ink-3">{r.reason}</p>
                {r.childCount > 0 ? <p className="text-caption text-ink-3">{t("sync.rejected.children", { count: r.childCount })}</p> : null}
              </div>
              <button
                type="button"
                aria-label={t("sync.rejected.copy")}
                onClick={() => void copy([g])}
                className="grid size-11 flex-none cursor-pointer place-items-center rounded-hand text-ink"
              >
                <Icon name="copy" size={22} />
              </button>
              <TextButton className="flex-none" onClick={() => discard(g)}>
                {t("sync.rejected.discard")}
              </TextButton>
            </li>
          );
        })}
      </ul>

      {visible.length > 1 ? (
        <TextButton className="self-start" onClick={() => void copy(visible)}>
          {t("sync.rejected.copyAll")}
        </TextButton>
      ) : null}

      {notice ? (
        <div role="status" className="flex flex-col gap-2 text-caption text-ink">
          {notice.kind === "discarded" ? (
            <p className="flex items-center gap-1">
              {t("sync.rejected.discarded")}
              <TextButton className="min-h-11" onClick={undo}>
                {t("toast.undo")}
              </TextButton>
            </p>
          ) : notice.kind === "copied" ? (
            <p>{t("sync.rejected.copied")}</p>
          ) : (
            <>
              <p>{t("sync.rejected.copyFailed")}</p>
              <textarea readOnly rows={5} value={notice.text} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-box border-draw-thin border-ink bg-transparent p-2 text-body text-ink" />
            </>
          )}
        </div>
      ) : null}

      <Button data-autofocus onClick={onClose}>
        {t("sync.rejected.close")}
      </Button>
    </Sheet>
  );
}
