"use client";
// หน้าจด `/log` (UX 2 E3 · 4 · wireframe กลุ่ม 4): จอเต็ม ไม่มีแถบล่าง · ‹ = ย่อ (เซสชันเดินต่อ) · จด ✓ แตะเดียว · พัก · สถิติ · จบ → สรุป
// ข้อมูลทั้งหมดมาจากร่างในเครื่อง (ใช้ได้ตอนออฟไลน์) · ทุกการเขียนผ่าน mutateSession → คิว (หน้าจอไม่ fetch เอง)

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useFlash } from "@/components/catalog/flash";
import { useCatalogStore } from "@/components/catalog/store";
import { Cat } from "@/components/doodle";
import { useHideTabs } from "@/components/nav/tabs-visibility";
import { sortActive } from "@/components/places/place-logic";
import { BottomBar } from "@/components/catalog/shared";
import { useLocalView } from "@/components/sync/use-offline";
import { Button, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { useOnline } from "@/pwa/use-online";
import { getLocalView } from "@/lib/offline/client";
import { DEFAULT_REST_S, formatClock, requestWakeLock } from "@/lib/offline/timer";
import { discardSession, type DraftExercise, type DraftSet, type SetValues } from "@/lib/offline/session";
import { ExerciseBlock } from "./exercise-block";
import { ExercisePicker } from "./exercise-picker";
import {
  deleteSet,
  dropExercise,
  playStopwatch,
  restoreSet,
  retickSet,
  setKind,
  stopStopwatchAndTick,
  tickSet,
  untickSet,
  updateValues,
  type ActionCtx,
} from "./log-actions";
import { evaluateLive } from "./pr";
import { RestBar } from "./rest-bar";
import { unlockAudio } from "./rest-alert";
import { ResumeGate } from "./resume-gate";
import { addExerciseChange, buildSummary, categoryLookup, changePlace, elapsedMs, finishChange, mutateSession, totalCompleted, type PickedExercise, type SummaryData } from "./session-logic";
import { useSessionTitle } from "./session-title";
import { unitsFromProfile } from "./set-logic";
import { StartButton } from "./start-button";
import { SummaryView } from "./summary-view";
import { useNow } from "./use-now";

type Menu =
  | { kind: "session" }
  | { kind: "place" }
  | { kind: "discard" }
  | { kind: "set"; ex: DraftExercise; set: DraftSet; label: string }
  | { kind: "exercise"; ex: DraftExercise }
  | null;

const PR_MS = 3000;

export function LogScreen() {
  useHideTabs();
  const t = useTranslations("log");
  const locale = useLocale();
  const router = useRouter();
  const online = useOnline();
  const view = useLocalView();
  const { catalog } = useCatalogStore({ catalog: true, bootstrap: true }, online);
  const [flashNode, show] = useFlash();
  const d = view.activeSession;
  const units = unitsFromProfile(view.snapshot?.profile);
  const summaries = useMemo(() => new Map((view.snapshot?.exercise_summaries ?? []).map((s) => [s.exercise_id, s])), [view.snapshot]);
  const restS = view.snapshot?.profile?.rest_seconds ?? DEFAULT_REST_S;
  const ctx = useMemo<ActionCtx>(() => ({ units, restS, summaries }), [units, restS, summaries]);
  const unilateral = useMemo(() => {
    const set = new Set<string>();
    for (const e of catalog.data?.exercises ?? []) if (e.is_unilateral) set.add(e.id);
    for (const e of view.myExercises) if (e.is_unilateral) set.add(e.id);
    return set;
  }, [catalog.data, view.myExercises]);

  // expanded: undefined = ท่าสุดท้าย · null = พับหมด
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const [picker, setPicker] = useState<boolean | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [pr, setPr] = useState<{ key: number; name: string } | null>(null);
  const title = useSessionTitle(d);
  const now = useNow(d !== null, 1000);

  // เลือกท่าเปิดเอง ตอนเซสชันยังไม่มีท่า (เริ่ม → เลือกท่า · 3 แตะ) — ปิดแล้วจะไม่เปิดซ้ำ
  const showPicker = picker ?? (d !== null && d.exercises.length === 0);
  const openId = expanded === undefined ? (d?.exercises.at(-1)?.id ?? null) : expanded;

  // กันจอดับระหว่างอยู่หน้าจด (ของแถม · ไม่พึ่ง — ตัวจับเวลาถูกแม้จอดับ)
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    let alive = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      const l = await requestWakeLock();
      if (!alive) void l?.release().catch(() => {});
      else lock = l;
    };
    void acquire();
    const onVis = () => void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, []);

  // สถิติใหม่ toast 3 วิ
  useEffect(() => {
    if (!pr) return;
    const id = window.setTimeout(() => setPr(null), PR_MS);
    return () => window.clearTimeout(id);
  }, [pr]);

  const failed = useCallback(() => show({ key: "actionFailed", text: t("saveFailed") }), [show, t]);

  async function onTick(ex: DraftExercise, set: DraftSet) {
    unlockAudio();
    const r = await tickSet(ex.id, set.id, ctx);
    if (r && !r.ok) return failed();
    const e2 = getLocalView().activeSession?.exercises.find((x) => x.id === ex.id);
    if (e2 && evaluateLive(e2, summaries.get(e2.exercise_id)).get(set.id)?.celebrate) setPr({ key: Date.now(), name: e2.exercise_name });
  }

  async function onUntick(ex: DraftExercise, set: DraftSet) {
    const { result, newSetId } = await untickSet(ex.id, set.id);
    if (result && !result.ok) return failed();
    show({ key: "saved", text: t("unticked"), undo: () => void retickSet(ex.id, newSetId) });
  }

  async function onValues(ex: DraftExercise, set: DraftSet, values: SetValues) {
    const r = await updateValues(ex.id, set.id, values);
    if (r && !r.ok) failed();
  }

  async function onDeleteSet(ex: DraftExercise, set: DraftSet) {
    setMenu(null);
    const { result, removed } = await deleteSet(ex.id, set.id, ctx);
    if (result && !result.ok) return failed();
    if (removed) show({ key: "deleted", text: t("setDeleted"), undo: () => void restoreSet(ex.id, removed) });
  }

  async function onPick(p: PickedExercise, alreadyIn: boolean) {
    setPicker(false);
    const cur = getLocalView().activeSession;
    const existing = cur?.exercises.find((e) => e.exercise_id === p.id);
    if (alreadyIn && existing) return setExpanded(existing.id);
    let rowId: string | null = null;
    const r = await mutateSession((dd, at) => {
      const made = addExerciseChange(dd, p, summaries.get(p.id), units, at);
      rowId = made?.rowId ?? null;
      return made?.change ?? null;
    });
    if (r && !r.ok) return failed();
    if (rowId) setExpanded(rowId);
    else show({ key: "actionFailed", text: t("exerciseLimit") });
  }

  async function onFinish() {
    const cur = getLocalView().activeSession;
    if (!cur) return;
    const at = Date.now();
    const data = totalCompleted(cur) > 0 ? buildSummary(cur, at, summaries, locale, categoryLookup(view)) : null;
    const r = await mutateSession((dd, n) => finishChange(dd, n));
    if (r && !r.ok) return failed();
    if (data) setSummary(data);
    else router.replace("/");
  }

  if (summary) return <SummaryView data={summary} onDone={() => router.replace("/")} />;

  // ยังไม่โหลดข้อมูลในเครื่อง
  if (!view.ready) return <div aria-hidden="true" className="flex-1" />;

  if (!d) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 pt-12 text-center">
        <Cat pose="lying" size={160} motion className="text-ink" />
        <p className="max-w-72 text-body text-ink-2">{t("noSession")}</p>
        <div className="w-full max-w-72">
          <StartButton />
        </div>
        <ResumeGate onLogPage />
        {flashNode}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 pb-44">
      <div className="sticky top-0 z-10 -mx-5 flex flex-col gap-2 bg-paper px-5 pt-2 pb-2">
        <header className="flex items-center gap-1">
          <button type="button" aria-label={t("minimize")} onClick={() => router.push("/")} className="-ml-3 grid size-11 flex-none cursor-pointer place-items-center rounded-hand text-ink">
            <Icon name="back" size={26} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-section">{title}</h1>
            <p className="num truncate text-caption text-ink-3">
              {d.session.place_name} · {formatClock(Math.round(elapsedMs(d, now) / 1000))}
            </p>
          </div>
          <button type="button" aria-haspopup="dialog" aria-label={t("sessionMenu")} onClick={() => setMenu({ kind: "session" })} className="grid size-11 flex-none cursor-pointer place-items-center rounded-hand text-ink">
            <Icon name="more" size={24} strokeWidth={3.2} />
          </button>
        </header>
        {d.rest ? <RestBar key={d.rest.started_at} rest={d.rest} /> : null}
      </div>

      {d.exercises.length === 0 ? (
        <p className="py-6 text-center text-body text-ink-2">{t("noExercises")}</p>
      ) : (
        d.exercises.map((ex) => {
          return (
            <ExerciseBlock
              key={ex.id}
              ex={ex}
              open={openId === ex.id}
              unilateral={unilateral.has(ex.exercise_id)}
              summary={summaries.get(ex.exercise_id)}
              units={units}
              locale={locale}
              stopwatch={d.stopwatch}
              onToggle={() => setExpanded(openId === ex.id ? null : ex.id)}
              onExerciseMenu={() => setMenu({ kind: "exercise", ex })}
              onTick={(e, s) => void onTick(e, s)}
              onUntick={(e, s) => void onUntick(e, s)}
              onValues={(e, s, v) => void onValues(e, s, v)}
              onSetMenu={(e, s, label) => setMenu({ kind: "set", ex: e, set: s, label })}
              onPlay={(e, s) => void playStopwatch(e.id, s.id)}
              onStop={() => void stopStopwatchAndTick(ctx)}
            />
          );
        })
      )}

      <BottomBar tabs={false}>
        <div className="flex gap-3">
          <Button className="flex-1" onClick={() => setPicker(true)}>
            + {t("addExercise")}
          </Button>
          <Button className="flex-1" onClick={() => void onFinish()}>
            {t("finish")}
          </Button>
        </div>
      </BottomBar>

      {pr ? (
        <div key={pr.key} role="status" className="pointer-events-none fixed inset-x-0 top-3 z-30 mx-auto flex w-full max-w-120 justify-center px-3">
          <div className="flex items-center gap-3 rounded-hand border-draw border-ink bg-paper py-1 pr-5 pl-3">
            <Cat pose="new-record" size={56} motion className="text-ink" />
            <div className="flex flex-col leading-tight">
              <span className="text-body font-medium text-ink">{t("newRecord")}</span>
              <span className="max-w-48 truncate text-caption text-ink-3">{pr.name}</span>
            </div>
          </div>
        </div>
      ) : null}

      {showPicker ? (
        <ExercisePicker
          inSession={new Set(d.exercises.map((e) => e.exercise_id))}
          onPick={(p, already) => void onPick(p, already)}
          onClose={() => setPicker(false)}
        />
      ) : null}

      {menu ? <Menus menu={menu} onClose={() => setMenu(null)} onDeleteSet={(e, s) => void onDeleteSet(e, s)} onKind={(e, s, k) => void setKind(e.id, s.id, k).then(() => setMenu(null))} /> : null}
      <ResumeGate onLogPage />
      {flashNode}
    </div>
  );
}

function Menus({
  menu,
  onClose,
  onDeleteSet,
  onKind,
}: {
  menu: NonNullable<Menu>;
  onClose: () => void;
  onDeleteSet: (ex: DraftExercise, set: DraftSet) => void;
  onKind: (ex: DraftExercise, set: DraftSet, kind: "normal" | "warmup") => void;
}) {
  const t = useTranslations("log");
  const router = useRouter();
  const view = useLocalView();
  const titleId = useId();
  const [stage, setStage] = useState<"menu" | "confirm">("menu");

  if (menu.kind === "set") {
    const { ex, set, label } = menu;
    const warm = set.set_kind === "warmup";
    return (
      <Sheet titleId={titleId} onClose={onClose}>
        <h2 id={titleId} className="text-section">
          {warm ? t("setTitleWarmup") : t("setTitle", { n: label })}
        </h2>
        <Button data-autofocus aria-pressed={warm} onClick={() => onKind(ex, set, warm ? "normal" : "warmup")}>
          {warm ? `✓ ${t("warmup")}` : t("warmup")}
        </Button>
        <p className="-mt-1 text-caption text-ink-3">{t("warmupHint")}</p>
        <Button className="border-warn! text-warn!" onClick={() => onDeleteSet(ex, set)}>
          {t("deleteSet")}
        </Button>
        <TextButton onClick={onClose}>{t("close")}</TextButton>
      </Sheet>
    );
  }

  if (menu.kind === "exercise") {
    const { ex } = menu;
    const hasSets = ex.sets.some((s) => s.completed_at !== null);
    return (
      <Sheet titleId={titleId} onClose={onClose}>
        <h2 id={titleId} className="text-section break-words">
          {t("exerciseMenuTitle", { name: ex.exercise_name })}
        </h2>
        {stage === "confirm" ? <p className="text-body text-ink-2">{t("removeExerciseBody")}</p> : null}
        <Button
          data-autofocus
          className="border-warn! text-warn!"
          onClick={() => {
            if (hasSets && stage === "menu") return setStage("confirm");
            void dropExercise(ex.id).then(onClose);
          }}
        >
          {stage === "confirm" ? t("removeExerciseConfirm") : t("removeExercise")}
        </Button>
        <TextButton onClick={onClose}>{t("close")}</TextButton>
      </Sheet>
    );
  }

  if (menu.kind === "place") {
    const places = sortActive(view.places);
    const cur = view.activeSession?.session.place_id;
    return (
      <Sheet titleId={titleId} onClose={onClose}>
        <h2 id={titleId} className="text-section">
          {t("changePlace")}
        </h2>
        <ul className="m-0 flex list-none flex-col p-0">
          {places.map((p, i) => (
            <li key={p.id} className="border-b border-ink-3/40">
              <button
                type="button"
                data-autofocus={i === 0 ? true : undefined}
                aria-current={p.id === cur ? "true" : undefined}
                onClick={() => void mutateSession((d, now) => changePlace(d, p, now)).then(onClose)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 py-2 text-left text-body text-ink"
              >
                <Icon name="check" size={20} className={p.id === cur ? "opacity-100" : "opacity-0"} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <TextButton onClick={onClose}>{t("close")}</TextButton>
      </Sheet>
    );
  }

  if (menu.kind === "discard") {
    return (
      <Sheet titleId={titleId} onClose={onClose}>
        <h2 id={titleId} className="text-section">
          {t("discardTitle")}
        </h2>
        <p className="text-body text-ink-2">{t("discardBody")}</p>
        <Button
          className="border-warn! text-warn!"
          onClick={() => void mutateSession((d) => discardSession(d)).then(() => router.replace("/"))}
        >
          {t("discardConfirm")}
        </Button>
        <TextButton data-autofocus onClick={onClose}>
          {t("cancel")}
        </TextButton>
      </Sheet>
    );
  }

  // เมนูเซสชัน ⋯
  return <SessionMenu titleId={titleId} onClose={onClose} />;
}

function SessionMenu({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const t = useTranslations("log");
  const [next, setNext] = useState<"place" | "discard" | null>(null);
  if (next === "place") return <Menus menu={{ kind: "place" }} onClose={onClose} onDeleteSet={() => {}} onKind={() => {}} />;
  if (next === "discard") return <Menus menu={{ kind: "discard" }} onClose={onClose} onDeleteSet={() => {}} onKind={() => {}} />;
  return (
    <Sheet titleId={titleId} onClose={onClose}>
      <h2 id={titleId} className="text-section">
        {t("sessionMenu")}
      </h2>
      <Button data-autofocus onClick={() => setNext("place")}>
        {t("changePlace")}
      </Button>
      <Button className="border-warn! text-warn!" onClick={() => setNext("discard")}>
        {t("discard")}
      </Button>
      <TextButton onClick={onClose}>{t("close")}</TextButton>
    </Sheet>
  );
}
