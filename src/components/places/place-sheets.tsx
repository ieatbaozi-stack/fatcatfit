"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { FlashKey } from "@/components/catalog/flash";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { EXERCISE_LIMITS } from "@/lib/data/shared/exercise-meta";
import type { WirePlace } from "@/lib/data/shared/sync";
import { addPlace, writePlace, type PlaceFailure } from "./place-actions";
import { atPlaceLimit, canArchive, isDuplicatePlace, placeNameValid } from "./place-logic";

type Failure = PlaceFailure | null;

/** แผ่นแก้สถานที่ (จอ 78): ชื่อ · บันทึก · เก็บเข้ากรุ/เอาออกจากกรุ — เปิดได้ตอนออฟไลน์แต่ปุ่มปิด */
export function PlaceEditSheet({ place, places, online, onClose, onDone }: { place: WirePlace; places: readonly WirePlace[]; online: boolean; onClose: () => void; onDone: (key: FlashKey) => void }) {
  const t = useTranslations("places");
  const titleId = useId();
  const [name, setName] = useState(place.name);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const archived = Boolean(place.archived_at);
  const changed = name.trim() !== place.name.trim();
  const canSave = placeNameValid(name) && changed && online && !busy;
  const lastOne = !archived && !canArchive(places, place.id);
  const duplicate = isDuplicatePlace(name, places, place.id);

  async function run(patch: { name?: string; archivedAt?: string | null }, done: FlashKey) {
    setBusy(true);
    setFailure(null);
    const r = await writePlace(place.id, place, patch);
    setBusy(false);
    if (r.ok) {
      onDone(done);
      onClose();
    } else setFailure(r.reason);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (canSave) void run({ name }, "saved");
  }

  return (
    <Sheet titleId={titleId} onClose={onClose} busy={busy}>
      <h2 id={titleId} className="text-section">
        {t("editTitle")}
      </h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <TextField
          data-autofocus
          label={t("name")}
          value={name}
          maxLength={EXERCISE_LIMITS.nameMax}
          autoComplete="off"
          enterKeyHint="done"
          hint={duplicate ? t("duplicate") : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setFailure(null);
          }}
        />
        <p className="text-caption text-ink-3">{t("renameNote")}</p>
        {failure && failure !== "limit" ? (
          <p role="alert" className="text-caption text-warn">
            {failure === "invalid" ? t("lastOne") : t("saveFailed")}
          </p>
        ) : null}
        {!online ? (
          <p role="status" className="text-caption text-ink-3">
            {t("needNet")}
          </p>
        ) : null}
        <Button type="submit" loading={busy} disabled={!canSave}>
          {busy ? t("saving") : failure === "failed" ? t("retry") : t("save")}
        </Button>
      </form>
      <div className="flex flex-col gap-1 border-t border-ink-3/40 pt-3">
        {failure === "limit" ? (
          <p role="alert" className="text-caption text-warn">
            {t("limit")}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy || !online || lastOne}
          onClick={() => void run({ archivedAt: archived ? null : new Date().toISOString() }, archived ? "unarchived" : "archived")}
          className="inline-flex min-h-11 w-fit cursor-pointer items-center text-body text-ink underline-hand disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
        >
          {archived ? t("unarchive") : t("archive")}
        </button>
        {lastOne || !archived ? <p className="text-caption text-ink-3">{lastOne ? t("lastOne") : t("archiveHint")}</p> : null}
      </div>
    </Sheet>
  );
}

/** แผ่นเพิ่มสถานที่ (จอ 79) — จากหน้า สถานที่ ไม่เปลี่ยนชิปหน้าหลัก */
export function PlaceAddSheet({ places, online, onClose, onDone }: { places: readonly WirePlace[]; online: boolean; onClose: () => void; onDone: (key: FlashKey) => void }) {
  const t = useTranslations("places");
  const titleId = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [newId] = useState(() => crypto.randomUUID());
  const full = atPlaceLimit(places) || failure === "limit";
  const canAdd = placeNameValid(name) && online && !busy && !full;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    setFailure(null);
    const r = await addPlace(newId, name, { select: false });
    setBusy(false);
    if (r.ok) {
      onDone("added");
      onClose();
    } else setFailure(r.reason);
  }

  return (
    <Sheet titleId={titleId} onClose={onClose} busy={busy}>
      <h2 id={titleId} className="text-section">
        {t("add")}
      </h2>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        <TextField
          data-autofocus
          label={t("name")}
          value={name}
          placeholder={t("namePlaceholder")}
          maxLength={EXERCISE_LIMITS.nameMax}
          autoComplete="off"
          enterKeyHint="done"
          hint={isDuplicatePlace(name, places, null) ? t("duplicate") : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setFailure(null);
          }}
        />
        {failure === "failed" || failure === "invalid" ? (
          <p role="alert" className="text-caption text-warn">
            {t("addFailed")}
          </p>
        ) : null}
        {full ? (
          <p role="status" className="text-caption text-ink-2">
            {t("limit")}
          </p>
        ) : null}
        {!online ? (
          <p role="status" className="text-caption text-ink-3">
            {t("needNet")}
          </p>
        ) : null}
        <Button type="submit" loading={busy} disabled={!canAdd}>
          {busy ? t("adding") : failure === "failed" ? t("retry") : t("addButton")}
        </Button>
      </form>
    </Sheet>
  );
}
