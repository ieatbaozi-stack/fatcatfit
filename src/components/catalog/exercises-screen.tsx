"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, TextButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { useAfter } from "@/components/ui/use-keyboard-inset";
import { CATEGORIES, isCategory, type Category } from "@/lib/data/shared/exercise-meta";
import { normalizeQuery, searchExercises } from "@/lib/data/shared/exercise-search";
import { useOnline } from "@/pwa/use-online";
import { ButtonLink } from "@/components/ui/status-screen";
import { clampName, compareByDisplay, isMine, PAGE_SIZE, sortForBrowse, type ExerciseRow, type Locale } from "./exercise-logic";
import { ExerciseName } from "./exercise-name";
import { useFlash } from "./flash";
import { markInApp } from "./in-app-nav";
import { BottomBar, CatState, PrimaryLink, Skeleton, SubPageHeader } from "./shared";
import { useCatalogStore } from "./store";

const SLOW_MS = 400;
const VERY_SLOW_MS = 2000;

const ROW = "flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-ink-3/40 py-2 text-left no-underline";

/** อ่านคำค้น/หมวดจาก URL ของจอนี้ (เก็บไว้ใน URL ให้กลับจากฟอร์มแล้วอยู่ที่เดิม) */
function readUrl(): { q: string; category: Category | null } {
  const p = new URLSearchParams(window.location.search);
  const c = p.get("category");
  return { q: p.get("q") ?? "", category: c && isCategory(c) ? c : null };
}

function writeUrl(q: string, category: Category | null): void {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (category) p.set("category", category);
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

/**
 * ฉัน › ท่าออกกำลังกาย (R2 · UX 12.4): ค้นคลัง + ท่าของฉัน · ชิปหมวด · สร้าง/แก้
 * คลังอยู่ในหน่วยความจำของแท็บ ค้นในเครื่องด้วย exercise-search.ts · R2 ออนไลน์อย่างเดียวสำหรับสร้าง/แก้
 */
export function ExercisesScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const online = useOnline();
  const { catalog, bootstrap, retry } = useCatalogStore({ catalog: true, bootstrap: true }, online);
  const [flashNode] = useFlash(true);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showArchived, setShowArchived] = useState(false);
  const [detail, setDetail] = useState<ExerciseRow | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // เปิดหน้า: คืนคำค้น/ชิปจาก URL · คอมพิวเตอร์ (เมาส์) focus ช่องค้นเลย · มือถือไม่เปิดแป้นพิมพ์เอง
  useEffect(() => {
    markInApp();
    const u = readUrl();
    // อ่านจาก URL ภายนอก (history) ครั้งเดียวตอนเปิดหน้า
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ(u.q);
    setCategory(u.category);
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) searchRef.current?.focus();
  }, []);

  function update(nextQ: string, nextCategory: Category | null) {
    setQ(nextQ);
    setCategory(nextCategory);
    setLimit(PAGE_SIZE);
    writeUrl(nextQ, nextCategory);
  }

  const catalogReady = catalog.status === "ready" && catalog.data !== null;
  const bootReady = bootstrap.status === "ready" && bootstrap.data !== null;
  const ready = catalogReady && bootReady;
  const failed = !ready && (catalog.status === "error" || bootstrap.status === "error");
  const pending = !ready && !failed;

  const mine = useMemo<ExerciseRow[]>(() => bootstrap.data?.my_exercises ?? [], [bootstrap.data]);
  const library = useMemo<ExerciseRow[]>(() => (catalog.data?.exercises ?? []).map((e) => ({ ...e, owner_user_id: null })), [catalog.data]);
  const all = useMemo(() => [...mine, ...library], [mine, library]);

  const hasQuery = normalizeQuery(q) !== "";
  const browsing = !hasQuery && category === null;

  const results = useMemo(() => {
    if (!ready || browsing) return [];
    if (hasQuery) return searchExercises(all, q, { category });
    return sortForBrowse(
      all.filter((e) => !e.archived_at && e.category === category),
      locale,
    );
  }, [ready, browsing, hasQuery, all, q, category, locale]);

  const myActive = useMemo(() => mine.filter((e) => !e.archived_at).sort((a, b) => compareByDisplay(a, b, locale)), [mine, locale]);
  const myArchived = useMemo(() => mine.filter((e) => e.archived_at).sort((a, b) => compareByDisplay(a, b, locale)), [mine, locale]);

  const slow = useAfter(pending, SLOW_MS);
  const verySlow = useAfter(pending, VERY_SLOW_MS);

  const canCreate = ready && online;
  const createHref = `/me/exercises/new${(() => {
    const p = new URLSearchParams();
    const name = clampName(q);
    if (name) p.set("name", name);
    if (category) p.set("category", category);
    const s = p.toString();
    return s ? `#${s}` : "";
  })()}`;
  const catLabel = (c: Category) => t(`exercise.category.${c}`);

  // ---- สถานะทั้งจอ ----
  if (!ready && !online) {
    return (
      <>
        <SubPageHeader title={t("exercises.title")} />
        <CatState pose="offline" title={t("exercises.offlineTitle")} body={t("exercises.offlineBody")}>
          <ButtonLink href="/me">{t("me.back")}</ButtonLink>
        </CatState>
      </>
    );
  }
  if (failed) {
    return (
      <>
        <SubPageHeader title={t("exercises.title")} />
        <CatState pose="confused" title={t("exercises.loadFailed")} body={t("exercises.loadFailedBody")}>
          <Button onClick={retry}>{t("error.retry")}</Button>
        </CatState>
      </>
    );
  }

  const shown = results.slice(0, limit);
  const noResults = ready && !browsing && results.length === 0;

  return (
    <div className="flex flex-col gap-4 pb-32">
      <SubPageHeader title={t("exercises.title")} />

      <SearchField inputRef={searchRef} value={q} onChange={(v) => update(v, category)} />

      {/* ชิปหมวด: มีคำค้นแต่ยังไม่เลือกชิป = ซ่อน (ผลเต็มจอ) · เลือกแล้วแสดงต่อ */}
      {!(hasQuery && category === null) ? (
        <CategoryChips selected={category} onSelect={(c) => update(q, c)} label={t("exercises.categories")} labelOf={catLabel} />
      ) : null}

      {pending ? (
        <div>
          {slow ? <Skeleton rows={5} /> : null}
          {verySlow ? <CatState pose="poop" title={t("ui.slow")} /> : null}
        </div>
      ) : null}

      {ready && browsing ? (
        <>
          <section aria-labelledby="mine-heading" className="flex flex-col">
            <h2 id="mine-heading" className="text-section">
              {t("exercises.mine", { count: myActive.length })}
            </h2>
            {myActive.length === 0 ? (
              <p className="py-3 text-body text-ink-2">{t("exercises.mineEmpty")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {myActive.map((e) => (
                  <li key={e.id}>
                    <Link href={`/me/exercises/${e.id}`} className={ROW}>
                      <ExerciseName exercise={e} className="flex-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {myArchived.length > 0 ? (
            <section className="flex flex-col">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex min-h-14 w-full cursor-pointer items-center justify-between border-b border-ink-3/40 py-2 text-left text-body text-ink-3"
              >
                {t("exercises.archived", { count: myArchived.length })}
                <Icon name="down" size={20} className={showArchived ? "rotate-180" : ""} />
              </button>
              {showArchived ? (
                <ul className="m-0 flex list-none flex-col p-0">
                  {myArchived.map((e) => (
                    <li key={e.id}>
                      <Link href={`/me/exercises/${e.id}`} className={ROW}>
                        <ExerciseName exercise={e} muted className="flex-1" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {ready && !browsing && results.length > 0 ? (
        <section className="flex flex-col" aria-label={hasQuery ? t("exercises.title") : undefined}>
          {category && !hasQuery ? <h2 className="text-section">{t("exercises.categoryCount", { category: catLabel(category), count: results.length })}</h2> : null}
          <ul className="m-0 flex list-none flex-col p-0">
            {shown.map((e) => (
              <li key={e.id}>
                {isMine(e) ? (
                  <Link href={`/me/exercises/${e.id}`} className={ROW}>
                    <ExerciseName exercise={e} className="flex-1" />
                  </Link>
                ) : (
                  <button type="button" className={ROW} onClick={() => setDetail(e)}>
                    <ExerciseName exercise={e} className="flex-1" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {results.length > limit ? (
            <TextButton className="mt-2 self-center" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              {t("exercises.more")}
            </TextButton>
          ) : null}
          {hasQuery ? (
            <div className="mt-3 flex flex-col items-start gap-1">
              <p className="text-caption text-ink-3">{t("exercises.notWhat")}</p>
              {canCreate ? (
                <Link href={createHref} className="inline-flex min-h-11 max-w-full items-center text-body text-ink underline-hand">
                  <span className="truncate py-1.5">+ {t("exercises.createFrom", { q: clampName(q) })}</span>
                </Link>
              ) : (
                <span aria-disabled="true" className="inline-flex min-h-11 max-w-full items-center text-body text-ink-3">
                  <span className="truncate py-1.5">+ {t("exercises.createFrom", { q: clampName(q) })}</span>
                </span>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {noResults ? (
        <section className="flex flex-col items-center gap-2 pt-6 text-center">
          <p role="status" className="max-w-full break-words text-section text-ink">
            {category && hasQuery ? t("exercises.noMatchIn", { q: clampName(q), category: catLabel(category) }) : hasQuery ? t("exercises.noMatch", { q: clampName(q) }) : t("exercises.noMatch", { q: "" })}
          </p>
          {hasQuery ? <p className="text-body text-ink-2">{t("exercises.noMatchHint")}</p> : null}
          {category ? (
            <TextButton onClick={() => update(q, null)}>{t("exercises.searchAll")}</TextButton>
          ) : null}
        </section>
      ) : null}

      {/* ปุ่มสร้างลอยเหนือแถบล่าง/แป้นพิมพ์ — ค้นไม่เจอ = ปุ่มหลัก · อย่างอื่น = ปุ่มรอง */}
      {ready || pending ? (
        <BottomBar>
          {ready && !online ? (
            <p role="status" className="text-center text-caption text-ink-3">
              {t("exercises.needNet")}
            </p>
          ) : null}
          {noResults && hasQuery ? (
            <PrimaryLink href={createHref} disabled={!canCreate}>
              <span className="truncate py-1.5">+ {t("exercises.createFrom", { q: clampName(q) })}</span>
            </PrimaryLink>
          ) : canCreate ? (
            <Link href={createHref} className="inline-flex min-h-13 items-center justify-center text-body text-ink underline-hand">
              + {t("exercises.create")}
            </Link>
          ) : (
            <span aria-disabled="true" className="inline-flex min-h-13 items-center justify-center text-body text-ink-3">
              + {t("exercises.create")}
            </span>
          )}
        </BottomBar>
      ) : null}

      {detail ? <DetailSheet exercise={detail} onClose={() => setDetail(null)} /> : null}
      {flashNode}
    </div>
  );
}

function SearchField({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const t = useTranslations("exercises");
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {t("search")}
      </label>
      <input
        id={id}
        ref={inputRef}
        role="searchbox"
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        placeholder={t("search")}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 w-full rounded-underline border-0 border-b-2 border-ink bg-transparent pr-12 pl-0 text-body text-ink placeholder:font-light placeholder:text-ink-3"
      />
      {value ? (
        <button
          type="button"
          aria-label={t("clear")}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-0 grid size-11 -translate-y-1/2 cursor-pointer place-items-center text-ink"
        >
          <Icon name="close" size={22} />
        </button>
      ) : null}
    </div>
  );
}

function CategoryChips({ selected, onSelect, label, labelOf }: { selected: Category | null; onSelect: (c: Category | null) => void; label: string; labelOf: (c: Category) => string }) {
  const box = useRef<HTMLDivElement>(null);
  // ชิปที่เลือกต้องเลื่อนให้เห็นเสมอ
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [selected]);
  return (
    <div ref={box} role="group" aria-label={label} className="-mx-5 flex gap-2 overflow-x-auto px-5 py-1">
      {CATEGORIES.map((c) => (
        <Chip key={c} pressed={selected === c} onClick={() => onSelect(selected === c ? null : c)}>
          {labelOf(c)}
        </Chip>
      ))}
    </div>
  );
}

/** แผ่นรายละเอียดท่าคลัง — อ่านอย่างเดียว ไม่มีรูป/วิธีทำท่า (D1) · ใช้ได้ตอนออฟไลน์ */
function DetailSheet({ exercise, onClose }: { exercise: ExerciseRow; onClose: () => void }) {
  const t = useTranslations();
  const titleId = useId();
  const parts = [t(`exercise.track.${exercise.track_type}`)];
  if (exercise.load_mode !== "external") parts.push(t(`exercise.load.${exercise.load_mode as "bodyweight_plus" | "assisted"}`));
  if (exercise.is_unilateral) parts.push(t("exercise.unilateral"));
  return (
    <Sheet titleId={titleId} onClose={onClose}>
      <h2 id={titleId} className="text-section">
        <ExerciseName exercise={exercise} />
      </h2>
      <dl className="m-0 flex flex-col">
        <Fact label={t("exercises.detail.category")} value={t(`exercise.category.${exercise.category as Category}`)} />
        <Fact label={t("exercises.detail.equipment")} value={exercise.equipment ? t(`exercise.equipment.${exercise.equipment as "barbell"}`) : t("exercise.equipment.none")} />
        <Fact label={t("exercises.detail.track")} value={parts.join(" · ")} />
      </dl>
      <p className="text-caption text-ink-3">{t("exercises.detail.source")}</p>
      <Button data-autofocus onClick={onClose}>
        {t("exercises.detail.close")}
      </Button>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={cx("flex min-h-11 items-baseline justify-between gap-4 border-b border-ink-3/40 py-2")}>
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="m-0 text-right text-body text-ink">{value}</dd>
    </div>
  );
}
