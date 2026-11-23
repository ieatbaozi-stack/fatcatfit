"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMe } from "@/components/auth/auth-gate";
import { Button, TextButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { ButtonLink } from "@/components/ui/status-screen";
import { CATEGORIES, EQUIPMENT, EXERCISE_LIMITS, LOAD_MODES, TRACK_TYPES, type Category, type LoadMode, type TrackType } from "@/lib/data/shared/exercise-meta";
import type { WireExercise } from "@/lib/data/shared/sync";
import { useOnline } from "@/pwa/use-online";
import { pushOne } from "./api";
import {
  EMPTY_FORM,
  buildExerciseRow,
  hasDuplicateName,
  isDirty,
  isFormValid,
  showsLoadMode,
  showsUnilateral,
  toPushData,
  valuesOf,
  withTrack,
  type FormValues,
} from "./exercise-logic";
import { queueFlash } from "./flash";
import { BottomBar, CatState, Skeleton } from "./shared";
import { loadBootstrap, removeMyExercise, upsertMyExercise, useCatalogStore } from "./store";

type SaveError = "save" | "limit" | "delete" | null;

/** กลับจอค้น (คำค้น/ชิปเดิมอยู่ใน URL ของจอนั้น) · เปิดฟอร์มตรงๆ โดยไม่มีหน้าก่อน = ไปจอค้นเอง */
function useGoBack() {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.back();
    else router.replace("/me/exercises");
  };
}

/** สร้างท่าของฉัน (จอ 73–74) — ชื่อ/หมวดเติมจากจอค้น */
export function NewExerciseForm({ initialName, initialCategory }: { initialName: string; initialCategory: Category | null }) {
  const online = useOnline();
  const { bootstrap } = useCatalogStore({ catalog: false, bootstrap: true }, online);
  return <FormBody key="new" base={null} initial={{ ...EMPTY_FORM, name: initialName, category: initialCategory }} mine={bootstrap.data?.my_exercises ?? []} notice={null} onStale={() => {}} />;
}

/** แก้ท่าของฉัน (จอ 75–76) */
export function EditExerciseForm({ id }: { id: string }) {
  const t = useTranslations();
  const online = useOnline();
  const goBack = useGoBack();
  const { bootstrap, retry } = useCatalogStore({ catalog: false, bootstrap: true }, online);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<"stale" | null>(null);
  const row = bootstrap.data?.my_exercises.find((e) => e.id === id) ?? null;

  if (!row) {
    if (bootstrap.status === "ready") {
      return (
        <CatState pose="confused" title={t("exerciseForm.notFound")}>
          <ButtonLink href="/me/exercises">{t("exerciseForm.backToList")}</ButtonLink>
        </CatState>
      );
    }
    if (bootstrap.status === "error") {
      return online ? (
        <CatState pose="confused" title={t("exercises.loadFailed")} body={t("exercises.loadFailedBody")}>
          <Button onClick={retry}>{t("error.retry")}</Button>
        </CatState>
      ) : (
        <CatState pose="offline" title={t("exercises.offlineTitle")} body={t("exercises.offlineBody")}>
          <Button onClick={goBack}>{t("exerciseForm.backToList")}</Button>
        </CatState>
      );
    }
    if (!online) {
      return (
        <CatState pose="offline" title={t("exercises.offlineTitle")} body={t("exercises.offlineBody")}>
          <Button onClick={goBack}>{t("exerciseForm.backToList")}</Button>
        </CatState>
      );
    }
    return <Skeleton rows={5} />;
  }

  return (
    <FormBody
      key={`${row.id}:${version}`}
      base={row}
      initial={valuesOf(row)}
      mine={bootstrap.data?.my_exercises ?? []}
      notice={notice}
      onStale={() => {
        // แก้จากเครื่องอื่นไปแล้ว: โหลดค่าล่าสุดแล้วเติมใหม่ในฟอร์ม
        void loadBootstrap().then(() => {
          setNotice("stale");
          setVersion((v) => v + 1);
        });
      }}
    />
  );
}

type BodyProps = { base: WireExercise | null; initial: FormValues; mine: readonly WireExercise[]; notice: "stale" | null; onStale: () => void };

function FormBody({ base, initial, mine, notice, onStale }: BodyProps) {
  const t = useTranslations();
  const online = useOnline();
  const goBack = useGoBack();
  const { me } = useMe();
  const [values, setValues] = useState<FormValues>(initial);
  const [id] = useState(() => base?.id ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SaveError>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const nameId = useId();
  const noteId = useId();

  const isEdit = base !== null;
  const dirty = isDirty(values, initial);
  const valid = isFormValid(values);
  const canSave = valid && (isEdit ? dirty : true) && online && error !== "limit";
  const nameLen = Array.from(values.name).length;
  const duplicate = hasDuplicateName(values.name, mine, base?.id ?? null);
  const archived = Boolean(base?.archived_at);

  function set(patch: Partial<FormValues>) {
    setError(null);
    setValues((v) => ({ ...v, ...patch }));
  }

  function rowOf(v: FormValues, archivedAt: string | null): WireExercise {
    return buildExerciseRow({ id, ownerId: me?.user.id ?? "", values: v, archivedAt, base, now: new Date().toISOString() });
  }

  /** ผลของการเขียน: applied → true · stale → โหลดใหม่ · อื่นๆ → ตั้งข้อความผิดพลาด */
  async function write(data: Record<string, unknown> | undefined, action: "upsert" | "delete", failure: "save" | "delete"): Promise<boolean> {
    setBusy(true);
    setError(null);
    const r = await pushOne({ entity: "exercise", id, action, ...(data ? { data } : {}) });
    if (r.kind === "applied") return true;
    setBusy(false);
    if (r.kind === "stale") onStale();
    else if (r.kind === "rejected" && r.code === "limit_reached") setError("limit");
    else setError(failure);
    return false;
  }

  async function onSave() {
    if (busy || !canSave) return;
    if (await write(toPushData(values), "upsert", "save")) {
      upsertMyExercise(rowOf(values, base?.archived_at ?? null));
      void loadBootstrap();
      queueFlash({ key: "saved" });
      goBack();
    }
  }

  async function onArchive(next: boolean) {
    if (busy || !base || !online) return;
    const baseValues = valuesOf(base);
    const at = next ? new Date().toISOString() : null;
    if (await write({ ...toPushData(baseValues), archived_at: at }, "upsert", "save")) {
      upsertMyExercise(rowOf(baseValues, at));
      void loadBootstrap();
      queueFlash(
        next
          ? { key: "archived", undo: (show) => void undoArchive(base, show) }
          : { key: "unarchived" },
      );
      goBack();
    }
  }

  async function onDelete() {
    if (busy || !base || !online) return;
    if (await write(undefined, "delete", "delete")) {
      removeMyExercise(id);
      void loadBootstrap();
      queueFlash({ key: "deleted" });
      goBack();
    }
  }

  function onClose() {
    if (dirty) setDiscardOpen(true);
    else goBack();
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    // ฟอร์มยาว มีช่องบังคับข้างล่าง: Enter ไม่ส่ง · ไปช่องถัดไปแทน
    if (e.key === "Enter") {
      e.preventDefault();
      categoryRef.current?.querySelector<HTMLElement>("[role='radio'][tabindex='0']")?.focus();
    }
  }

  const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: t(`exercise.category.${c}`) }));
  const trackOptions = TRACK_TYPES.map((v) => ({ value: v, label: t(`exercise.track.${v}`), hint: t(`exercise.trackExample.${v}`) }));
  const loadOptions = LOAD_MODES.map((v) => ({ value: v, label: t(`exercise.load.${v}`) }));
  const saveLabel = busy ? t("exerciseForm.saving") : error === "save" ? t("exerciseForm.retry") : t("exerciseForm.save");

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      aria-busy={busy || undefined}
      className="flex flex-col gap-6 pb-48"
    >
      <header className="flex items-center gap-1">
        <button type="button" aria-label={t("exerciseForm.close")} onClick={onClose} className="-ml-3 grid size-11 flex-none cursor-pointer place-items-center rounded-hand text-ink">
          <Icon name="close" size={26} />
        </button>
        <h1 className="text-page">{t(isEdit ? "exerciseForm.editTitle" : "exerciseForm.newTitle")}</h1>
      </header>

      {notice === "stale" ? (
        <p role="status" className="text-caption text-ink-2">
          {t("exerciseForm.stale")}
        </p>
      ) : null}

      {/* ชื่อ */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-caption text-ink-3">
          {t("exerciseForm.name")}
        </label>
        <input
          id={nameId}
          type="text"
          value={values.name}
          maxLength={EXERCISE_LIMITS.nameMax}
          autoComplete="off"
          enterKeyHint="next"
          aria-describedby={noteId}
          onChange={(e) => set({ name: e.target.value })}
          onKeyDown={onNameKey}
          className="min-h-12 w-full rounded-underline border-0 border-b-2 border-ink bg-transparent px-0 text-section text-ink"
        />
        <p id={noteId} className="flex justify-between gap-3 text-caption text-ink-3">
          <span className={duplicate ? "text-ink-2" : undefined}>{duplicate ? t("exerciseForm.nameDuplicate") : t("exerciseForm.nameHint")}</span>
          {nameLen >= 50 ? <span className="num flex-none text-ink-3">{t("exerciseForm.nameCount", { count: nameLen })}</span> : null}
        </p>
      </div>

      {/* หมวด (บังคับ ไม่มีค่าเริ่ม) */}
      <section className="flex flex-col gap-2">
        <h2 className="text-caption text-ink-3">{t("exerciseForm.category")}</h2>
        <div ref={categoryRef}>
          <ChoiceGroup variant="chips" label={t("exerciseForm.category")} value={values.category} options={categoryOptions} onChange={(c) => set({ category: c })} />
        </div>
      </section>

      {/* ชนิดการจด (บังคับ ไม่มีค่าเริ่ม: ล็อกเมื่อมีประวัติ จึงให้เลือกเอง) */}
      <section className="flex flex-col gap-2">
        <h2 className="text-caption text-ink-3">{t("exerciseForm.track")}</h2>
        <ChoiceGroup
          variant="list"
          label={t("exerciseForm.track")}
          value={values.track}
          options={trackOptions}
          onChange={(v: TrackType) => {
            setError(null);
            setValues((cur) => withTrack(cur, v));
          }}
          after={{
            weight_reps: showsLoadMode(values.track) ? (
              <div className="ml-10 flex flex-col gap-2 border-b border-ink-3/40 py-3">
                <p className="text-caption text-ink-3">{t("exercise.load.label")}</p>
                <ChoiceGroup variant="chips" label={t("exercise.load.label")} value={values.loadMode} options={loadOptions} onChange={(v: LoadMode) => set({ loadMode: v })} />
              </div>
            ) : null,
          }}
        />
        <p className="text-caption text-ink-3">{t("exerciseForm.lockNote")}</p>
      </section>

      {showsUnilateral(values.track) ? (
        <button
          type="button"
          role="switch"
          aria-checked={values.unilateral}
          onClick={() => set({ unilateral: !values.unilateral })}
          className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 border-b border-ink-3/40 py-2 text-left"
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-body font-normal text-ink">{t("exerciseForm.unilateral")}</span>
            <span className="text-caption text-ink-3">{t("exerciseForm.unilateralHint")}</span>
          </span>
          <Switch on={values.unilateral} />
        </button>
      ) : null}

      {/* อุปกรณ์ (ไม่บังคับ · แตะซ้ำ = เลิกเลือก) */}
      <section className="flex flex-col gap-2">
        <h2 className="text-caption text-ink-3">{t("exerciseForm.equipment")}</h2>
        <div role="group" aria-label={t("exerciseForm.equipment")} className="flex flex-wrap gap-2">
          {EQUIPMENT.map((e) => (
            <Chip key={e} pressed={values.equipment === e} onClick={() => set({ equipment: values.equipment === e ? null : e })}>
              {t(`exercise.equipment.${e}`)}
            </Chip>
          ))}
        </div>
      </section>

      {isEdit ? (
        <section className="flex flex-col gap-1 border-t border-ink-3/40 pt-4">
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => void onArchive(!archived)}
            className="inline-flex min-h-11 w-fit cursor-pointer items-center text-body text-ink underline-hand disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
          >
            {archived ? t("exerciseForm.unarchive") : t("exerciseForm.archive")}
          </button>
          {!archived ? <p className="text-caption text-ink-3">{t("exerciseForm.archiveHint")}</p> : null}
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => setDeleteOpen(true)}
            className="mt-2 inline-flex min-h-11 w-fit cursor-pointer items-center text-body text-warn underline-hand disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
          >
            {t("exerciseForm.delete")}
          </button>
        </section>
      ) : null}

      <BottomBar tabs={false}>
        {error === "save" ? (
          <p role="alert" className="text-caption text-warn">
            {t("exerciseForm.saveFailed")}
          </p>
        ) : null}
        {error === "limit" ? (
          <p role="alert" className="text-caption text-warn">
            {t("exerciseForm.limit")}
          </p>
        ) : null}
        {!online ? (
          <p role="status" className="text-caption text-ink-3">
            {t("exerciseForm.needNet")}
          </p>
        ) : null}
        <Button loading={busy} disabled={!canSave} onClick={() => void onSave()}>
          {saveLabel}
        </Button>
      </BottomBar>

      {discardOpen ? <DiscardSheet onKeep={() => setDiscardOpen(false)} onDiscard={goBack} /> : null}
      {deleteOpen && base ? (
        <DeleteSheet
          name={base.name}
          busy={busy}
          failed={error === "delete"}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => void onDelete()}
        />
      ) : null}
    </form>
  );
}

/** เลิกทำการเก็บเข้ากรุ: ส่ง archived_at = null ด้วยค่าเดิมของท่า */
async function undoArchive(base: WireExercise, show: (f: { key: "actionFailed" | "unarchived" }) => void): Promise<void> {
  const r = await pushOne({ entity: "exercise", id: base.id, action: "upsert", data: { ...toPushData(valuesOf(base)), archived_at: null } });
  if (r.kind === "applied") {
    upsertMyExercise({ ...base, archived_at: null });
    void loadBootstrap();
  } else show({ key: "actionFailed" });
}

function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={cx("relative inline-flex h-8 w-14 flex-none items-center rounded-blob border-draw border-ink", on ? "bg-accent" : "bg-transparent")}>
      <span className={cx("absolute grid size-5 place-items-center rounded-blob border-draw-thin border-ink bg-paper text-ink", on ? "right-1" : "left-1")}>
        <Icon name="check" size={12} strokeWidth={3.5} className={on ? "opacity-100" : "opacity-0"} />
      </span>
    </span>
  );
}

function DiscardSheet({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const t = useTranslations("exerciseForm");
  const titleId = useId();
  return (
    <Sheet titleId={titleId} onClose={onKeep}>
      <h2 id={titleId} className="text-section">
        {t("discardTitle")}
      </h2>
      <Button onClick={onDiscard}>{t("discard")}</Button>
      <TextButton data-autofocus onClick={onKeep}>
        {t("keepEditing")}
      </TextButton>
    </Sheet>
  );
}

function DeleteSheet({ name, busy, failed, onCancel, onConfirm }: { name: string; busy: boolean; failed: boolean; onCancel: () => void; onConfirm: () => void }) {
  const t = useTranslations("exerciseForm");
  const titleId = useId();
  return (
    <Sheet titleId={titleId} onClose={onCancel} busy={busy}>
      <h2 id={titleId} className="text-section break-words">
        {t("deleteTitle", { name })}
      </h2>
      <p className="text-body text-ink-2">{t("deleteBody")}</p>
      {failed ? (
        <p role="alert" className="text-caption text-warn">
          {t("deleteFailed")}
        </p>
      ) : null}
      <Button loading={busy} onClick={onConfirm} className="border-warn! text-warn!">
        {busy ? t("deleting") : failed ? t("retry") : t("deleteConfirm")}
      </Button>
      <TextButton data-autofocus disabled={busy} onClick={onCancel}>
        {t("cancel")}
      </TextButton>
    </Sheet>
  );
}
