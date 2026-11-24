"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BottomBar, CatState, Skeleton, SubPageHeader } from "@/components/catalog/shared";
import { useFlash } from "@/components/catalog/flash";
import { useCatalogStore } from "@/components/catalog/store";
import { Button, TextButton } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/status-screen";
import { useAfter } from "@/components/ui/use-keyboard-inset";
import type { WirePlace } from "@/lib/data/shared/sync";
import { useOnline } from "@/pwa/use-online";
import { MapLinkButton } from "./map-link-button";
import { useLocalView } from "@/components/sync/use-offline";
import { isActivePlace, placeHasSessions, writePlace } from "./place-actions";
import { PlaceAddSheet, PlaceEditSheet } from "./place-sheets";
import { archivedPlaces, atPlaceLimit, currentPlace, sortActive } from "./place-logic";

const ROW = "flex min-h-14 min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 py-2 text-left";

/** ฉัน › สถานที่ (R2 · UX 12.7 · D7): เพิ่ม · แก้ชื่อ · เก็บเข้ากรุ / เอาออกจากกรุ · ลบ (CR3 · ที่ยังไม่มีเซสชัน) — R3a เขียนผ่านคิว ออฟไลน์ก็ทำได้ */
export function PlacesScreen() {
  const t = useTranslations("places");
  const tc = useTranslations();
  const online = useOnline();
  const { bootstrap, retry } = useCatalogStore({ catalog: false, bootstrap: true }, online);
  const view = useLocalView();
  const [flashNode, show] = useFlash();
  const [editing, setEditing] = useState<WirePlace | null>(null);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const places = bootstrap.data?.places ?? null;
  const pending = places === null && bootstrap.status !== "error";
  const slow = useAfter(pending, 400);
  const verySlow = useAfter(pending, 2000);

  if (places === null && bootstrap.status === "error") {
    return (
      <>
        <SubPageHeader title={t("title")} />
        {online ? (
          <CatState pose="confused" title={t("loadFailed")} body={tc("exercises.loadFailedBody")}>
            <Button onClick={retry}>{tc("error.retry")}</Button>
          </CatState>
        ) : (
          <CatState pose="offline" title={t("offlineTitle")} body={tc("exercises.offlineBody")}>
            <ButtonLink href="/me">{tc("me.back")}</ButtonLink>
          </CatState>
        )}
      </>
    );
  }
  if (places === null && !online) {
    return (
      <>
        <SubPageHeader title={t("title")} />
        <CatState pose="offline" title={t("offlineTitle")} body={tc("exercises.offlineBody")}>
          <ButtonLink href="/me">{tc("me.back")}</ButtonLink>
        </CatState>
      </>
    );
  }

  const active = places ? sortActive(places) : [];
  const archived = places ? archivedPlaces(places) : [];
  const current = places ? currentPlace(places) : null;
  const full = places ? atPlaceLimit(places) : false;

  async function unarchive(p: WirePlace) {
    if (atPlaceLimit(places ?? [])) return show({ key: "actionFailed", text: t("limit") });
    const r = await writePlace(p.id, p, { archivedAt: null }, "unarchive");
    show(r.ok ? { key: "unarchived" } : { key: "actionFailed" });
  }

  return (
    <div className="flex flex-col gap-4 pb-36">
      <SubPageHeader title={t("title")} />

      {places === null ? (
        <div>
          {slow ? <Skeleton rows={3} /> : null}
          {verySlow ? <CatState pose="poop" title={tc("ui.slow")} /> : null}
        </div>
      ) : (
        <>
          {active.length === 0 ? (
            <p className="py-3 text-body text-ink-2">{t("empty")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {active.map((p) => (
                <li key={p.id} className="flex items-center border-b border-ink-3/40">
                  <button type="button" className={ROW} onClick={() => setEditing(p)}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-medium text-ink">{p.name}</span>
                      {current && current.id === p.id ? <span className="text-caption text-ink-3">{t("lastUsed")}</span> : null}
                    </span>
                  </button>
                  <MapLinkButton url={p.map_url} name={p.name} />
                </li>
              ))}
            </ul>
          )}

          {archived.length > 0 ? (
            <section className="flex flex-col" aria-labelledby="archived-places">
              <h2 id="archived-places" className="text-section">
                <button
                  type="button"
                  aria-expanded={showArchived}
                  onClick={() => setShowArchived((v) => !v)}
                  className="min-h-11 cursor-pointer text-left text-section font-medium text-ink"
                >
                  {t("archivedSection", { count: archived.length })}
                </button>
              </h2>
              {showArchived ? (
                <ul className="m-0 flex list-none flex-col p-0">
                  {archived.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 border-b border-ink-3/40">
                      <button type="button" className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center py-2 text-left" onClick={() => setEditing(p)}>
                        <span className="truncate text-body text-ink-3">{p.name}</span>
                      </button>
                      <TextButton onClick={() => void unarchive(p)}>
                        {t("unarchive")}
                      </TextButton>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {places ? (
        <BottomBar>
          {full ? (
            <p role="status" className="text-center text-caption text-ink-2">
              {t("limit")}
            </p>
          ) : null}
          <button
            type="button"
            disabled={full}
            onClick={() => setAdding(true)}
            className="inline-flex min-h-13 cursor-pointer items-center justify-center text-body text-ink underline-hand disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
          >
            + {t("add")}
          </button>
        </BottomBar>
      ) : null}

      {editing && places ? (
        <PlaceEditSheet
          place={editing}
          places={places}
          hasSessions={placeHasSessions(editing, view)}
          isActive={isActivePlace(editing, view)}
          onClose={() => setEditing(null)}
          onDone={(key) => show({ key })}
        />
      ) : null}
      {adding && places ? <PlaceAddSheet places={places} onClose={() => setAdding(false)} onDone={(key) => show({ key })} /> : null}
      {flashNode}
    </div>
  );
}
