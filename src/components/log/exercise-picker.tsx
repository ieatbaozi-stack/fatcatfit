"use client";
// เลือกท่า (UX 2 E2/E3 · wireframe กลุ่ม 3 · contract D7): ค้นหา · ล่าสุด 5 ท่า · ชิปหมวด · ไม่เจอ → สร้างเป็นท่าของฉัน
// แตะแถว = เพิ่มท่าเข้าเซสชันแล้วกลับหน้าจดทันที (ไม่มีปุ่มยืนยัน) · ใช้ข้อมูลในเครื่อง ค้นได้ตอนออฟไลน์
// เรียง (D7): ผลค้นหา = ความตรงของคำ → ใช้บ่อย (เซสชันใน 90 วัน) → ท่าของฉัน → ชื่อ · ชิปหมวด = ใช้บ่อย → ชื่อ · ล่าสุด = 5 ท่าที่จดเซ็ตล่าสุด

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CategoryChips, SearchField } from "@/components/catalog/exercises-screen";
import { clampName, compareByDisplay, isMine, PAGE_SIZE, type ExerciseRow, type Locale } from "@/components/catalog/exercise-logic";
import { ExerciseName } from "@/components/catalog/exercise-name";
import { markInApp } from "@/components/catalog/in-app-nav";
import { Skeleton } from "@/components/catalog/shared";
import { useCatalogStore } from "@/components/catalog/store";
import { useLocalView } from "@/components/sync/use-offline";
import { TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useAfter } from "@/components/ui/use-keyboard-inset";
import type { Category } from "@/lib/data/shared/exercise-meta";
import { normalizeQuery, rankExercise, searchExercises } from "@/lib/data/shared/exercise-search";
import { useOnline } from "@/pwa/use-online";
import { recentExercises, type PickedExercise } from "./session-logic";
import { unitsFromProfile } from "./set-logic";

type Props = {
  /** ท่าที่อยู่ในเซสชันแล้ว (แตะ = ไปที่ท่านั้น ไม่เพิ่มซ้ำ) */
  inSession: ReadonlySet<string>;
  onPick: (ex: PickedExercise, alreadyIn: boolean) => void;
  onClose: () => void;
};

const ROW = "flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-ink-3/40 py-2 text-left no-underline";

export function ExercisePicker({ inSession, onPick, onClose }: Props) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const online = useOnline();
  const view = useLocalView();
  const { catalog, bootstrap } = useCatalogStore({ catalog: true, bootstrap: true }, online);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);
  const units = unitsFromProfile(view.snapshot?.profile);

  useEffect(() => {
    markInApp();
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ready = catalog.status === "ready" && catalog.data !== null && bootstrap.status === "ready";
  const pending = !ready && catalog.status !== "error" && bootstrap.status !== "error";
  const slow = useAfter(pending, 400);

  const all = useMemo<ExerciseRow[]>(() => {
    const mine = view.myExercises.map((e) => e as ExerciseRow);
    const library = (catalog.data?.exercises ?? []).map((e) => ({ ...e, owner_user_id: null }) as ExerciseRow);
    return [...mine, ...library];
  }, [view.myExercises, catalog.data]);
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);
  const freq = useMemo(() => new Map((view.snapshot?.exercise_summaries ?? []).map((s) => [s.exercise_id, s.sessions_90d])), [view.snapshot]);

  const hasQuery = normalizeQuery(q) !== "";
  const browsing = !hasQuery && category === null;

  const results = useMemo<ExerciseRow[]>(() => {
    if (browsing) return [];
    const f = (e: ExerciseRow) => freq.get(e.id) ?? 0;
    if (hasQuery) {
      const qn = normalizeQuery(q);
      const found = searchExercises(all, q, { category });
      // searchExercises เรียงความตรง → ท่าของฉัน → ...: แทรก "ใช้บ่อย" ระหว่างความตรงกับท่าของฉัน (D7) โดยคงลำดับเดิมของที่เหลือ
      return found
        .map((e, i) => ({ e, i, tier: rankExercise(e, qn) ?? 0 }))
        .sort((a, b) => a.tier - b.tier || f(b.e) - f(a.e) || Number(isMine(b.e)) - Number(isMine(a.e)) || a.i - b.i)
        .map((x) => x.e);
    }
    return all.filter((e) => !e.archived_at && e.category === category).sort((a, b) => f(b) - f(a) || compareByDisplay(a, b, locale));
  }, [browsing, hasQuery, all, q, category, freq, locale]);

  const recent = useMemo(() => {
    if (!ready || !browsing) return [];
    return recentExercises(
      view,
      (id) => {
        const e = byId.get(id);
        return Boolean(e && !e.archived_at);
      },
      locale,
      (id) => {
        const e = byId.get(id);
        return e ? { track: e.track_type as never, load: e.load_mode as never } : undefined;
      },
      units,
    );
  }, [ready, browsing, view, byId, locale, units]);

  const catLabel = (c: Category) => t(`exercise.category.${c}`);
  const createHref = `/me/exercises/new#${(() => {
    const p = new URLSearchParams();
    const name = clampName(q);
    if (name) p.set("name", name);
    if (category) p.set("category", category);
    p.set("session", "1");
    return p.toString();
  })()}`;

  const pick = (e: ExerciseRow) => onPick({ id: e.id, name: e.name, name_th: e.name_th, track_type: e.track_type, load_mode: e.load_mode }, inSession.has(e.id));
  const shown = results.slice(0, limit);

  return (
    <div role="dialog" aria-modal="true" aria-label={t("log.picker.title")} className="fixed inset-0 z-30 overflow-y-auto bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-120 flex-col gap-4 px-5 pt-3 pb-12">
        <header className="flex items-center gap-1">
          <button type="button" aria-label={t("log.picker.close")} onClick={onClose} className="-ml-3 grid size-11 flex-none cursor-pointer place-items-center rounded-hand text-ink">
            <Icon name="close" size={26} />
          </button>
          <h1 className="text-page">{t("log.picker.title")}</h1>
        </header>

        <SearchField
          inputRef={searchRef}
          value={q}
          onChange={(v) => {
            setQ(v);
            setLimit(PAGE_SIZE);
          }}
        />
        {!(hasQuery && category === null) ? (
          <CategoryChips
            selected={category}
            onSelect={(c) => {
              setCategory(c);
              setLimit(PAGE_SIZE);
            }}
            label={t("exercises.categories")}
            labelOf={catLabel}
          />
        ) : null}

        {pending ? <div>{slow ? <Skeleton rows={5} /> : null}</div> : null}
        {!ready && !pending ? <p role="alert" className="text-body text-ink-2">{t("exercises.loadFailed")}</p> : null}

        {ready && browsing ? (
          recent.length > 0 ? (
            <section aria-labelledby="recent-heading" className="flex flex-col">
              <h2 id="recent-heading" className="text-section">
                {t("log.picker.recent")}
              </h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {recent.map((r) => {
                  const e = byId.get(r.exerciseId);
                  if (!e) return null;
                  return (
                    <li key={r.exerciseId}>
                      <button type="button" className={ROW} onClick={() => pick(e)}>
                        <ExerciseName exercise={e} className="flex-1" />
                        {r.last ? <span className="num flex-none text-caption text-ink-3">{r.last}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <p className="text-body text-ink-2">{t("log.picker.pickCategory")}</p>
          )
        ) : null}

        {ready && !browsing && results.length > 0 ? (
          <section className="flex flex-col" aria-label={t("log.picker.title")}>
            {category && !hasQuery ? <h2 className="text-section">{t("exercises.categoryCount", { category: catLabel(category), count: results.length })}</h2> : null}
            <ul className="m-0 flex list-none flex-col p-0">
              {shown.map((e) => (
                <li key={e.id}>
                  <button type="button" className={ROW} onClick={() => pick(e)}>
                    <ExerciseName exercise={e} className="flex-1" />
                    {inSession.has(e.id) ? <span className="flex-none text-caption text-ink-3">{t("log.picker.inSession")}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {results.length > limit ? (
              <TextButton className="mt-2 self-center" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                {t("exercises.more")}
              </TextButton>
            ) : null}
          </section>
        ) : null}

        {ready && !browsing && results.length === 0 ? (
          <section className="flex flex-col items-center gap-2 pt-4 text-center">
            <p role="status" className="max-w-full break-words text-section text-ink">
              {hasQuery ? t("exercises.noMatch", { q: clampName(q) }) : t("exercises.noMatch", { q: "" })}
            </p>
            {category ? <TextButton onClick={() => setCategory(null)}>{t("exercises.searchAll")}</TextButton> : null}
          </section>
        ) : null}

        {ready ? (
          <div className="mt-auto flex flex-col items-start gap-1 pt-4">
            {hasQuery ? <p className="text-caption text-ink-3">{t("exercises.notWhat")}</p> : null}
            <Link href={createHref} onClick={markInApp} className="inline-flex min-h-11 max-w-full items-center text-body text-ink underline-hand">
              <span className="truncate py-1.5">+ {hasQuery ? t("exercises.createFrom", { q: clampName(q) }) : t("exercises.create")}</span>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
