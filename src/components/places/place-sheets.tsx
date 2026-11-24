"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { FlashKey } from "@/components/catalog/flash";
import { Button, TextButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { EXERCISE_LIMITS } from "@/lib/data/shared/exercise-meta";
import { normalizeMapUrl } from "@/lib/data/shared/map-link";
import type { WirePlace } from "@/lib/data/shared/sync";
import { MapUrlField, mapUrlOk } from "./map-url-field";
import { addPlace, deletePlace, writePlace, type PlaceFailure } from "./place-actions";
import { atPlaceLimit, canArchive, isDuplicatePlace, placeNameValid } from "./place-logic";

type Failure = PlaceFailure | null;
type Where = "save" | "archive" | "delete";

/** ลิงก์ที่กรอก → ค่าที่ส่ง: ว่าง = null (ล้าง) · ไม่ว่าง = ลิงก์ที่ตัดช่องว่างแล้ว */
const mapValueOf = (input: string): string | null => (input.trim() === "" ? null : normalizeMapUrl(input));

/** แผ่นแก้สถานที่ (จอ 78): ชื่อ · ลิงก์แผนที่ · บันทึก · เก็บเข้ากรุ/เอาออกจากกรุ · ลบ (CR3) — เปิดได้ตอนออฟไลน์แต่ปุ่มปิด */
export function PlaceEditSheet({ place, places, online, onClose, onDone }: { place: WirePlace; places: readonly WirePlace[]; online: boolean; onClose: () => void; onDone: (key: FlashKey) => void }) {
  const t = useTranslations("places");
  const titleId = useId();
  const [name, setName] = useState(place.name);
  const [mapUrl, setMapUrl] = useState(place.map_url ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [where, setWhere] = useState<Where>("save");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = Boolean(place.archived_at);
  const nameChanged = name.trim() !== place.name.trim();
  const mapChanged = mapUrl.trim() !== (place.map_url ?? "");
  const canSave = placeNameValid(name) && mapUrlOk(mapUrl) && (nameChanged || mapChanged) && online && !busy;
  // เก็บเข้ากรุ/ลบที่ใช้งานแห่งสุดท้ายไม่ได้ (กติกาเดียวกัน) · ที่อยู่ในกรุลบได้เสมอ (ไม่กระทบจำนวนที่ใช้งาน)
  const lastOne = !archived && !canArchive(places, place.id);
  const duplicate = isDuplicatePlace(name, places, place.id);

  async function run(patch: { name?: string; archivedAt?: string | null; mapUrl?: string | null }, done: FlashKey, at: Where) {
    setBusy(true);
    setFailure(null);
    setWhere(at);
    const r = await writePlace(place.id, place, patch);
    setBusy(false);
    if (r.ok) {
      onDone(done);
      onClose();
    } else setFailure(r.reason);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    // ชื่อส่งเสมอ · ลิงก์ส่งเฉพาะเมื่อเปลี่ยน (ไม่ส่ง = คงเดิม · null = ล้าง)
    void run({ name, ...(mapChanged ? { mapUrl: mapValueOf(mapUrl) } : {}) }, "saved", "save");
  }

  async function onDelete() {
    setBusy(true);
    setFailure(null);
    setWhere("delete");
    const r = await deletePlace(place);
    setBusy(false);
    if (r.ok) {
      onDone("deleted");
      onClose();
    } else setFailure(r.reason);
  }

  if (confirmDelete) {
    return (
      <Sheet key="confirm" titleId={titleId} onClose={() => setConfirmDelete(false)} busy={busy}>
        <h2 id={titleId} className="text-section break-words">
          {t("deleteTitle", { name: place.name })}
        </h2>
        <p className="text-body text-ink-2">{t("deleteBody")}</p>
        {failure ? (
          <p role="alert" className="text-caption text-warn">
            {failure === "invalid" ? t("lastOne") : t("deleteFailed")}
          </p>
        ) : null}
        <Button loading={busy} disabled={!online} onClick={() => void onDelete()} className="border-warn! text-warn!">
          {busy ? t("deleting") : failure === "failed" ? t("retry") : t("deleteConfirm")}
        </Button>
        <TextButton data-autofocus disabled={busy} onClick={() => setConfirmDelete(false)}>
          {t("cancel")}
        </TextButton>
      </Sheet>
    );
  }

  return (
    <Sheet key="edit" titleId={titleId} onClose={onClose} busy={busy}>
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
        <MapUrlField
          value={mapUrl}
          onChange={(v) => {
            setMapUrl(v);
            setFailure(null);
          }}
        />
        {failure === "invalid" && where === "save" ? (
          <p role="alert" className="text-caption text-warn">
            {t("mapUrlInvalid")}
          </p>
        ) : null}
        {failure && failure !== "limit" && failure !== "invalid" && where === "save" ? (
          <p role="alert" className="text-caption text-warn">
            {t("saveFailed")}
          </p>
        ) : null}
        {!online ? (
          <p role="status" className="text-caption text-ink-3">
            {t("needNet")}
          </p>
        ) : null}
        <Button type="submit" loading={busy} disabled={!canSave}>
          {busy && where === "save" ? t("saving") : failure === "failed" && where === "save" ? t("retry") : t("save")}
        </Button>
      </form>
      <div className="flex flex-col gap-1 border-t border-ink-3/40 pt-3">
        {failure === "limit" ? (
          <p role="alert" className="text-caption text-warn">
            {t("limit")}
          </p>
        ) : null}
        {failure && where === "archive" && failure !== "limit" ? (
          <p role="alert" className="text-caption text-warn">
            {failure === "invalid" ? t("lastOne") : t("saveFailed")}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy || !online || lastOne}
          onClick={() => void run({ archivedAt: archived ? null : new Date().toISOString() }, archived ? "unarchived" : "archived", "archive")}
          className="inline-flex min-h-11 w-fit cursor-pointer items-center text-body text-ink underline-hand disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
        >
          {archived ? t("unarchive") : t("archive")}
        </button>
        {lastOne || !archived ? <p className="text-caption text-ink-3">{lastOne ? t("lastOne") : t("archiveHint")}</p> : null}
        <button
          type="button"
          disabled={busy || !online || lastOne}
          onClick={() => {
            setFailure(null);
            setConfirmDelete(true);
          }}
          className="mt-2 inline-flex min-h-11 w-fit cursor-pointer items-center text-body text-warn underline-hand disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
        >
          {t("delete")}
        </button>
      </div>
    </Sheet>
  );
}

/** แผ่นเพิ่มสถานที่ (จอ 79) — จากหน้า สถานที่ ไม่เปลี่ยนชิปหน้าหลัก */
export function PlaceAddSheet({ places, online, onClose, onDone }: { places: readonly WirePlace[]; online: boolean; onClose: () => void; onDone: (key: FlashKey) => void }) {
  const t = useTranslations("places");
  const titleId = useId();
  const [name, setName] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [newId] = useState(() => crypto.randomUUID());
  const full = atPlaceLimit(places) || failure === "limit";
  const canAdd = placeNameValid(name) && mapUrlOk(mapUrl) && online && !busy && !full;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    setFailure(null);
    const r = await addPlace(newId, name, { select: false, mapUrl: mapValueOf(mapUrl) });
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
        <MapUrlField
          value={mapUrl}
          onChange={(v) => {
            setMapUrl(v);
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
