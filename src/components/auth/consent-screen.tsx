"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, TextButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";
import { resolveLocale } from "@/lib/i18n/config";
import { deleteAccountRequest, postConsent } from "./api";
import { OfflineBar } from "./offline-sign-in";
import { useMe } from "./auth-gate";
import { useNet } from "./use-net";

type Failure = "save" | "version" | null;

/**
 * จอยินยอม (US-1.4): ปุ่มยินยอมแยกจากข้อความอื่น · ช่องติ๊กไม่ติ๊กไว้ให้ · บอกชัดว่าถอน = ลบบัญชี
 * ไม่ยินยอม → อธิบายว่าใช้แอปไม่ได้ แล้วออกจากระบบและลบบัญชีที่เพิ่งสร้าง
 */
export function ConsentScreen() {
  const t = useTranslations("consent");
  const locale = resolveLocale(useLocale());
  const { refresh } = useMe();
  const net = useNet();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [declining, setDeclining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const offline = net === "offline";

  async function onAgree() {
    if (saving) return;
    setSaving(true);
    setFailure(null);
    const r = await postConsent(PRIVACY_NOTICE_VERSION, locale);
    if (r.ok) {
      // ถามสถานะใหม่ → ตารางตัดสินพาไป /onboarding เอง (ค้าง "กำลังบันทึก…" จนกว่าจะเปลี่ยนหน้า)
      await refresh();
      setSaving(false);
      return;
    }
    setSaving(false);
    if (r.reason === "unauthorized") await refresh();
    else setFailure(r.reason === "version_mismatch" ? "version" : "save");
  }

  async function onDeleteAfterDecline() {
    if (deleting) return;
    setDeleting(true);
    setDeleteFailed(false);
    const r = await deleteAccountRequest();
    if (r.ok) {
      // ช่วง B: เรียก resetDeviceAfterSignOut({ accountDeleted: true }) ก่อนบรรทัดนี้
      window.location.replace("/welcome");
      return;
    }
    setDeleting(false);
    setDeleteFailed(true);
  }

  if (declining) {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="text-page">{t("declineTitle")}</h1>
        <p className="mt-2 text-body text-ink-2">{t("declineBody")}</p>
        {offline ? <p role="status" className="mt-4 text-caption text-ink-3">{t("offline")}</p> : null}
        {deleteFailed ? (
          <p role="alert" className="mt-4 text-caption text-warn">
            {t("deleteFailed")}
          </p>
        ) : null}
        <div className="mt-auto flex flex-col gap-2 pt-8">
          <Button loading={deleting} disabled={offline} onClick={() => void onDeleteAfterDecline()}>
            {deleting ? t("deleting") : t("declineConfirm")}
          </Button>
          <TextButton disabled={deleting} onClick={() => setDeclining(false)}>
            {t("declineBack")}
          </TextButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {offline ? <OfflineBar /> : null}
      <h1 className="text-page">{t("title")}</h1>
      <ul className="mt-4 flex list-disc flex-col gap-3 pl-5 text-body text-ink-2">
        <li>{t.rich("bullet1", { b: (chunks) => <strong className="font-medium text-ink">{chunks}</strong> })}</li>
        <li>{t("bullet2")}</li>
        <li>{t("bullet3")}</li>
        <li>{t("bullet4")}</li>
      </ul>
      <Link href="/privacy" className="mt-4 inline-flex min-h-11 items-center self-start text-body text-ink underline-hand">
        {t("readFull", { version: PRIVACY_NOTICE_VERSION })}
      </Link>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)}>
          {t("checkbox")}
        </Checkbox>
        <p className="text-caption text-ink-3">{t("withdraw")}</p>
        {failure ? (
          <p role="alert" className="text-caption text-warn">
            {failure === "version" ? t("versionChanged") : t("saveFailed")}
          </p>
        ) : null}
        {failure === "version" ? (
          <Button onClick={() => window.location.reload()}>{t("reload")}</Button>
        ) : (
          <Button disabled={!agreed || offline} loading={saving} onClick={() => void onAgree()}>
            {saving ? t("saving") : failure ? t("retry") : t("agree")}
          </Button>
        )}
        {offline ? <p className="text-center text-caption text-ink-3">{t("offline")}</p> : null}
        <TextButton disabled={saving} onClick={() => setDeclining(true)}>
          {t("decline")}
        </TextButton>
      </div>
    </div>
  );
}
