"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, TextButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";
import { resolveLocale } from "@/lib/i18n/config";
import { resetDeviceAfterSignOut } from "@/pwa/reset-device";
import { deleteAccountRequest, postConsent, signOutRequest } from "./api";
import { useMe } from "./auth-gate";
import { useNet } from "./use-net";

type Failure = "save" | "version" | null;

/**
 * จอยินยอม (US-1.4): ปุ่มยินยอมแยกจากข้อความอื่น · ช่องติ๊กไม่ติ๊กไว้ให้ · บอกชัดว่าถอน = ลบบัญชี
 * ไม่ยินยอม → อธิบายว่าใช้แอปไม่ได้ · ผู้ใช้ใหม่: ลบบัญชีที่เพิ่งสร้าง · ผู้ใช้เดิม (มี profile แล้ว =
 * เคยยินยอมและเคยผ่าน onboarding): ข้อมูลยังอยู่ เลือกออกจากระบบ (ไม่ลบ) หรือลบทั้งหมด (ยืนยันอีกขั้น)
 */
export function ConsentScreen() {
  const t = useTranslations("consent");
  const locale = resolveLocale(useLocale());
  const { me, refresh, networkFailed = false } = useMe();
  // ผู้ใช้ใหม่ = ยืนยันได้เฉพาะเมื่อโหลด me สำเร็จและ profile เป็น null (profile สร้างได้หลังยินยอมเท่านั้น)
  // ที่เหลือ (มี profile หรือยังไม่รู้) ใช้ทางผู้ใช้เดิมที่มีขั้นยืนยัน — กันลบข้อมูลคลิกเดียวตอน me ยังไม่มา
  const meKnown = me !== null;
  const existingUser = !(me !== null && me.profile === null);
  const net = useNet();
  const [agreed, setAgreed] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [declining, setDeclining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // ปุ่มที่เรียกเน็ตปิดทั้งตอนเบราว์เซอร์ออฟไลน์และตอน gate รายงานว่าถาม /api/me ไม่ได้
  const offline = net === "offline" || networkFailed;

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

  async function onRetryMe() {
    if (retrying) return;
    setRetrying(true);
    await refresh();
    setRetrying(false);
  }

  async function onDeleteAfterDecline() {
    if (deleting) return;
    setDeleting(true);
    setDeleteFailed(false);
    const r = await deleteAccountRequest();
    if (r.ok) {
      await resetDeviceAfterSignOut({ accountDeleted: true });
      window.location.replace("/welcome");
      return;
    }
    setDeleting(false);
    setDeleteFailed(true);
  }

  async function onKeepDataSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);
    const r = await signOutRequest();
    if (r.ok) {
      await resetDeviceAfterSignOut({ accountDeleted: false });
      window.location.replace("/welcome");
      return;
    }
    setSigningOut(false);
    setSignOutFailed(true);
  }

  if (declining && existingUser) {
    const busy = deleting || signingOut;
    if (confirmingDelete) {
      return (
        <div className="flex flex-1 flex-col">
          <h1 className="text-page">{t("existing.confirmTitle")}</h1>
          <p className="mt-2 text-body text-ink-2">{t("existing.confirmBody")}</p>
          {offline ? <p role="status" className="mt-4 text-caption text-ink-3">{t("offline")}</p> : null}
          {deleteFailed ? (
            <p role="alert" className="mt-4 text-caption text-warn">
              {t("deleteFailed")}
            </p>
          ) : null}
          <div className="mt-auto flex flex-col gap-2 pt-8">
            <Button
              className="border-warn text-warn"
              loading={deleting}
              disabled={offline}
              onClick={() => void onDeleteAfterDecline()}
            >
              {deleting ? t("deleting") : t("existing.confirmDelete")}
            </Button>
            <TextButton
              disabled={deleting}
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteFailed(false);
                setSignOutFailed(false);
              }}
            >
              {t("existing.confirmBack")}
            </TextButton>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="text-page">{t("existing.title")}</h1>
        <p className="mt-2 text-body text-ink-2">{t("existing.body")}</p>
        {offline ? <p role="status" className="mt-4 text-caption text-ink-3">{t("offline")}</p> : null}
        {signOutFailed ? (
          <p role="alert" className="mt-4 text-caption text-warn">
            {t("existing.signOutFailed")}
          </p>
        ) : null}
        <div className="mt-auto flex flex-col gap-2 pt-8">
          <Button loading={signingOut} disabled={offline || busy} onClick={() => void onKeepDataSignOut()}>
            {signingOut ? t("existing.signingOut") : t("existing.signOut")}
          </Button>
          <p className="text-center text-caption text-ink-3">{t("existing.signOutHint")}</p>
          <Button className="mt-2 border-warn text-warn" disabled={offline || busy} onClick={() => {
              setSignOutFailed(false);
              setDeleteFailed(false);
              setConfirmingDelete(true);
            }}>
            {t("existing.delete")}
          </Button>
          <TextButton
            disabled={busy}
            onClick={() => {
              setSignOutFailed(false);
              setDeleteFailed(false);
              setDeclining(false);
            }}
          >
            {t("declineBack")}
          </TextButton>
        </div>
      </div>
    );
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
          <TextButton
            disabled={deleting}
            onClick={() => {
              setDeleteFailed(false);
              setDeclining(false);
            }}
          >
            {t("declineBack")}
          </TextButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-page">{t("title")}</h1>
      <ul className="mt-4 flex list-disc flex-col gap-3 pl-5 text-body text-ink-2">
        <li>{t.rich("bullet1", { b: (chunks) => <strong className="font-medium text-ink">{chunks}</strong> })}</li>
        <li>{t("bullet2")}</li>
        <li>{t("bullet3")}</li>
        <li>{t("bullet4")}</li>
      </ul>
      <Link
        href="/privacy"
        className="mt-5 inline-flex min-h-11 items-center self-start rounded-hand border border-line bg-paper-2 px-4 text-body font-medium text-ink no-underline transition-opacity active:opacity-80"
      >
        {t("readFull", { version: PRIVACY_NOTICE_VERSION })}
      </Link>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Checkbox tone="ink" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)}>
          {t("ageCheckbox")}
        </Checkbox>
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
          <Button disabled={!agreed || !ageOk || offline} loading={saving} onClick={() => void onAgree()}>
            {saving ? t("saving") : failure ? t("retry") : t("agree")}
          </Button>
        )}
        {offline ? <p className="text-center text-caption text-ink-3">{t("offline")}</p> : null}
        {!meKnown ? (
          networkFailed ? (
            <>
              <p role="alert" className="text-caption text-warn">
                {t("meFailed")}
              </p>
              <Button loading={retrying} onClick={() => void onRetryMe()}>
                {t("retry")}
              </Button>
            </>
          ) : (
            <p role="status" className="text-center text-caption text-ink-3">
              {t("meLoading")}
            </p>
          )
        ) : null}
        <TextButton
          disabled={saving || !meKnown}
          onClick={() => {
            setDeleteFailed(false);
            setSignOutFailed(false);
            setConfirmingDelete(false);
            setDeclining(true);
          }}
        >
          {t("decline")}
        </TextButton>
      </div>
    </div>
  );
}
