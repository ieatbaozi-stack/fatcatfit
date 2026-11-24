"use client";
// กลับมาหลังปิดแอป (UX 2 · D5): ≤ 3 ชม. เปิดแอปเข้าหน้าจดเลย · 3–24 ชม. ถาม "เล่นต่อ / จบที่เวลาเซ็ตสุดท้าย" · > 24 ชม. จบให้เอง + toast
// ครอบทั้งเซสชันของเครื่องนี้ (ร่างในเครื่อง) และเซสชันค้างจากอีกเครื่อง (bootstrap.active_sessions)

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { useLocalView } from "@/components/sync/use-offline";
import { checkActiveSession, deleteEntity, resumeServerSession, writeEntity } from "@/lib/offline/client";
import { discardSession, draftFromWire, finishSession, resumeDecision, type ActiveSessionDraft } from "@/lib/offline/session";
import type { WireSession } from "@/lib/data/shared/workout";
import { mutateSession, sessionCategories, categoryLookup } from "./session-logic";
import { titleOfCategories } from "./session-title";

type Ask = { kind: "local"; endAt: number | null } | { kind: "server"; ws: WireSession; endAt: number | null };
type AutoEnded = { count: number; detail: string | null };

const AUTO_OPEN_FLAG = "fcf:auto-open";
const TOAST_MS = 6000;

function once(flag: string): boolean {
  try {
    if (sessionStorage.getItem(flag)) return false;
    sessionStorage.setItem(flag, "1");
  } catch {
    // ไม่มี storage = ถือว่าเปิดครั้งแรกทุกครั้ง
  }
  return true;
}

/** จบเซสชันจากเซิร์ฟเวอร์ที่เวลาเซ็ตสุดท้าย (ไม่มีเซ็ต = ลบทิ้ง) */
async function finishServerSession(ws: WireSession, endAt: number | null): Promise<void> {
  if (endAt === null) {
    await deleteEntity("workout_session", ws.id, { display: { place_name: ws.place_name } });
    return;
  }
  const start = Date.parse(ws.started_at);
  await writeEntity(
    "workout_session",
    ws.id,
    { place_id: ws.place_id, started_at: ws.started_at, ended_at: new Date(Math.min(Math.max(endAt, start), start + 24 * 3600 * 1000)).toISOString(), local_date: ws.local_date, time_zone: ws.time_zone },
    { display: { place_name: ws.place_name } },
  );
}

export function ResumeGate({ onLogPage = false }: { onLogPage?: boolean }) {
  const t = useTranslations("log");
  const tc = useTranslations("exercise.category");
  const locale = useLocale();
  const router = useRouter();
  const view = useLocalView();
  const titleId = useId();
  const ranLocal = useRef(false);
  const ranServer = useRef(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [auto, setAuto] = useState<AutoEnded | null>(null);

  const nameOf = (d: ActiveSessionDraft) => titleOfCategories(sessionCategories(d, categoryLookup(view)), t, tc);
  const fmtTime = (ms: number) => new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-nu-latn" : "en-GB", { timeStyle: "short" }).format(ms);
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short" }).format(Date.parse(iso));

  const hasSnapshot = view.snapshot !== null;
  useEffect(() => {
    if (!view.ready) return;
    const doLocal = !ranLocal.current;
    const doServer = hasSnapshot && !ranServer.current;
    if (!doLocal && !doServer) return;
    ranLocal.current = true;
    if (hasSnapshot) ranServer.current = true;
    void (async () => {
      const draft = view.activeSession;
      if (draft) {
        if (!doLocal) return;
        const dec = await checkActiveSession();
        if (!dec) return;
        if (dec.kind === "resume") {
          if (!onLogPage && once(AUTO_OPEN_FLAG)) router.replace("/log");
        } else if (dec.kind === "ask") setAsk({ kind: "local", endAt: dec.endAt });
        else if (dec.endAt !== null) setAuto({ count: 1, detail: t("autoEnded.detail", { name: nameOf(draft), date: fmtDate(draft.session.started_at), time: fmtTime(dec.endAt) }) });
        return;
      }
      if (!doServer) return;
      // ไม่มีร่างในเครื่อง: ดูเซสชันค้างจากอีกเครื่อง
      const now = Date.now();
      let ended = 0;
      let first: AutoEnded["detail"] = null;
      let pending: Ask | null = null;
      for (const ws of view.snapshot?.active_sessions ?? []) {
        const d = draftFromWire(ws, now);
        const r = resumeDecision(d, now);
        if (r.kind === "auto_end") {
          await finishServerSession(ws, r.endAt);
          if (r.endAt !== null) {
            ended += 1;
            first ??= t("autoEnded.detail", { name: nameOf(d), date: fmtDate(ws.started_at), time: fmtTime(r.endAt) });
          }
        } else pending ??= { kind: "server", ws, endAt: r.kind === "ask" ? r.endAt : lastSetAt(ws) };
      }
      if (ended > 0) setAuto({ count: ended, detail: ended === 1 ? first : null });
      if (pending) setAsk(pending);
    })();
    // รันครั้งเดียวต่อการเปิดหน้า (ขึ้นกับ ready และการมี snapshot เท่านั้น)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.ready, hasSnapshot]);

  // toast จบเซสชันให้เอง ค้าง 6 วิ
  useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(() => setAuto(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [auto]);

  async function resume() {
    const a = ask;
    setAsk(null);
    if (a?.kind === "server") await resumeServerSession(a.ws);
    if (!onLogPage) router.push("/log");
  }

  async function finish() {
    const a = ask;
    setAsk(null);
    if (a?.kind === "server") await finishServerSession(a.ws, a.endAt);
    else if (a) await mutateSession((d) => (a.endAt === null ? discardSession(d) : finishSession(d, a.endAt)));
  }

  const askDraft = ask?.kind === "server" ? draftFromWire(ask.ws, 0) : view.activeSession;

  return (
    <>
      {auto ? (
        <div role="status" className="fixed inset-x-0 top-3 z-30 mx-auto flex w-full max-w-120 px-3">
          <div className="flex w-full items-start gap-2 rounded-hand border-draw border-ink bg-paper py-2 pr-1 pl-4">
            <Icon name="check" size={22} className="mt-0.5 text-ink" />
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink">{auto.count > 1 ? t("autoEnded.many", { count: auto.count }) : t("autoEnded.one")}</p>
              {auto.detail ? <p className="text-caption text-ink-3">{auto.detail}</p> : null}
            </div>
            <button type="button" aria-label={t("autoEnded.close")} onClick={() => setAuto(null)} className="grid size-11 flex-none cursor-pointer place-items-center text-ink">
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
      ) : null}

      {ask && askDraft ? (
        <Sheet titleId={titleId} onClose={() => setAsk(null)}>
          <h2 id={titleId} className="text-section">
            {t("resume.title")}
          </h2>
          <p className="text-body text-ink-2">
            {nameOf(askDraft)} · {t("resume.started", { time: fmtTime(Date.parse(askDraft.session.started_at)) })}
            {ask.endAt !== null ? ` · ${t("resume.last", { time: fmtTime(ask.endAt) })}` : ""}
          </p>
          <Button data-autofocus onClick={() => void resume()}>
            {t("resume.continue")}
          </Button>
          <TextButton onClick={() => void finish()}>{ask.endAt === null ? t("resume.discard") : t("resume.finish")}</TextButton>
        </Sheet>
      ) : null}
    </>
  );
}

function lastSetAt(ws: WireSession): number | null {
  let last: number | null = null;
  for (const e of ws.exercises) for (const s of e.sets) last = Math.max(last ?? 0, Date.parse(s.completed_at));
  return last;
}
