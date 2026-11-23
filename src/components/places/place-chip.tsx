"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCatalogStore } from "@/components/catalog/store";
import { Button, TextButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { useAfter } from "@/components/ui/use-keyboard-inset";
import { EXERCISE_LIMITS } from "@/lib/data/shared/exercise-meta";
import type { WirePlace } from "@/lib/data/shared/sync";
import { useOnline } from "@/pwa/use-online";
import { addPlace, selectPlace } from "./place-actions";
import { atPlaceLimit, currentPlace, isDuplicatePlace, placeNameValid, sortActive } from "./place-logic";

/**
 * ชิป "เล่นที่ [📍 ชื่อ ▾]" บนหน้าหลัก (R2 · UX 12.3 · D7): แตะ = แผ่นเลือก · เลือกแล้วจำที่เซิร์ฟเวอร์ (ข้ามเครื่อง)
 * โหลด < 400 ms ไม่แสดง · ล้ม = ข้อความ + ลองใหม่ (ส่วนอื่นของหน้ายังใช้ได้) · ออฟไลน์ = แสดงค่าที่โหลดไว้แต่เปลี่ยนไม่ได้
 */
export function PlaceChip() {
  const t = useTranslations("placePicker");
  const tc = useTranslations();
  const online = useOnline();
  const { bootstrap, retry } = useCatalogStore({ catalog: false, bootstrap: true }, online);
  const [open, setOpen] = useState(false);
  const [toastNode, showToast] = useToast();
  const places = bootstrap.data?.places ?? null;
  const pending = places === null && bootstrap.status !== "error" && online;
  const slow = useAfter(pending, 400);
  const current = places ? currentPlace(places) : null;

  async function pick(p: WirePlace) {
    setOpen(false);
    if (!(await selectPlace(p))) showToast(t("changeFailed"));
  }

  let body: React.ReactNode = null;
  if (places === null && bootstrap.status === "error" && online) {
    body = (
      <div className="flex flex-wrap items-center justify-center gap-1">
        <p className="text-body text-ink-2">{t("loadFailed")}</p>
        <TextButton onClick={retry}>{tc("error.retry")}</TextButton>
      </div>
    );
  } else if (pending) {
    body = slow ? <div aria-hidden="true" className="h-11 w-35 rounded-hand border-draw-thin border-dashed border-ink-3" /> : null;
  } else if (current) {
    body = (
      <>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-disabled={!online || undefined}
          aria-label={t("chipLabel", { place: current.name })}
          onClick={() => online && setOpen(true)}
          className={cx(
            "inline-flex min-h-12 max-w-62 items-center gap-2 rounded-hand border-draw-thin px-4 text-body",
            online ? "cursor-pointer border-ink text-ink" : "cursor-not-allowed border-dashed border-ink-3 text-ink-3",
          )}
        >
          <span aria-hidden="true" className="flex-none text-ink-2">
            {t("at")}
          </span>
          <Icon name="pin" size={20} className="flex-none" />
          <span className="truncate font-medium">{current.name}</span>
          <Icon name="down" size={18} className="flex-none" />
        </button>
        {!online ? (
          <p role="status" className="text-caption text-ink-3">
            {t("needNet")}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="mt-auto flex flex-col items-center gap-2 pt-10">
      {body}
      {open && places ? <PlacePickerSheet places={places} currentId={current?.id ?? null} onPick={(p) => void pick(p)} onClose={() => setOpen(false)} /> : null}
      {toastNode}
    </div>
  );
}

function PlacePickerSheet({ places, currentId, onPick, onClose }: { places: readonly WirePlace[]; currentId: string | null; onPick: (p: WirePlace) => void; onClose: () => void }) {
  const t = useTranslations("placePicker");
  const tp = useTranslations("places");
  const titleId = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<"failed" | "limit" | null>(null);
  const list = sortActive(places);
  const full = atPlaceLimit(places) || failure === "limit";
  const canAdd = placeNameValid(name) && !busy;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    setFailure(null);
    const r = await addPlace(name, { select: true });
    setBusy(false);
    if (r.ok) onClose();
    else setFailure(r.reason === "limit" ? "limit" : "failed");
  }

  return (
    <Sheet titleId={titleId} onClose={onClose} busy={busy}>
      <h2 id={titleId} className="text-section">
        {t("title")}
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((p, i) => {
          const isCurrent = p.id === currentId;
          return (
            <li key={p.id}>
              <button
                type="button"
                data-autofocus={i === 0 ? true : undefined}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => (isCurrent ? onClose() : onPick(p))}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-ink-3/40 py-2 text-left"
              >
                <span aria-hidden="true" className={cx("grid size-7 flex-none place-items-center rounded-box border-draw border-ink text-on-accent", isCurrent && "bg-accent")}>
                  <Icon name="check" size={18} strokeWidth={3} className={isCurrent ? "opacity-100" : "opacity-0"} />
                </span>
                <span className="min-w-0 flex-1 truncate text-body text-ink">{p.name}</span>
                {isCurrent ? <span className="flex-none text-caption text-ink-3">{t("current")}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {full ? (
        <p role="status" className="text-body text-ink-2">
          {tp("limit")}
        </p>
      ) : (
        <form onSubmit={(e) => void onAdd(e)} className="flex flex-col gap-2">
          <TextField
            label={tp("add")}
            value={name}
            placeholder={tp("namePlaceholder")}
            maxLength={EXERCISE_LIMITS.nameMax}
            autoComplete="off"
            enterKeyHint="done"
            hint={isDuplicatePlace(name, places, null) ? tp("duplicate") : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setFailure(null);
            }}
          />
          {failure === "failed" ? (
            <p role="alert" className="text-caption text-warn">
              {tp("addFailed")}
            </p>
          ) : null}
          <Button type="submit" loading={busy} disabled={!canAdd}>
            {busy ? tp("adding") : failure === "failed" ? tp("retry") : tp("addButton")}
          </Button>
        </form>
      )}

      <Link href="/me/places" className="inline-flex min-h-11 items-center justify-center text-body text-ink underline-hand">
        {t("manage")}
      </Link>
    </Sheet>
  );
}
