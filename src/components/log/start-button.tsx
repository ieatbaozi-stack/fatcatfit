"use client";
// ปุ่ม "เริ่ม" (UX 2 E2): 1 แตะ เริ่มเซสชันที่สถานที่บนชิป แล้วเปิดหน้าจด (เลือกท่าเปิดเอง) · ไม่มีจอถามสถานที่

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCatalogStore } from "@/components/catalog/store";
import { currentPlace } from "@/components/places/place-logic";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/pwa/use-online";
import { startSession } from "./session-logic";

export function StartButton({ navigate = true }: { navigate?: boolean }) {
  const t = useTranslations("log");
  const router = useRouter();
  const online = useOnline();
  const { bootstrap } = useCatalogStore({ catalog: false, bootstrap: true }, online);
  const place = bootstrap.data ? currentPlace(bootstrap.data.places) : null;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    if (!place || busy) return;
    setBusy(true);
    setFailed(false);
    const r = await startSession(place);
    setBusy(false);
    if (!r.ok) return setFailed(true);
    if (navigate) router.push("/log");
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {failed ? (
        <p role="alert" className="text-center text-caption text-warn">
          {t("saveFailed")}
        </p>
      ) : null}
      <Button loading={busy} disabled={!place} onClick={() => void start()}>
        {t("start")}
      </Button>
    </div>
  );
}
