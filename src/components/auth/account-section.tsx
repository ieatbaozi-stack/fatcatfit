"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cat } from "@/components/doodle";
import { Button, TextButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cx } from "@/components/ui/cx";
import { HandWord } from "@/components/ui/hand-word";
import { resetDeviceAfterSignOut } from "@/pwa/reset-device";
import { deleteAccountRequest, signOutRequest } from "./api";
import { useMe } from "./auth-gate";
import { useNet } from "./use-net";

const ROW = "flex min-h-13 w-full items-center justify-between gap-3 text-left text-body font-normal";

function Chevron() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true" className="flex-none">
      <path d="M9 5 L16 12 L9.2 19" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Row({ children, disabled, note }: { children: ReactNode; disabled?: boolean; note?: string }) {
  return (
    <li className={cx("border-b border-ink-3/40", disabled && "text-ink-3")}>
      <div className={ROW}>{children}</div>
      {note ? <p className="-mt-2 pb-2 text-caption text-ink-3">{note}</p> : null}
    </li>
  );
}

/** ส่วน "บัญชี" ของหน้า "ฉัน" (R1): อีเมล · ประกาศ · ส่งออก (ปิด) · ออกจากระบบ · ลบบัญชี */
export function AccountSection() {
  const t = useTranslations("account");
  const { me } = useMe();
  const net = useNet();
  const offline = net === "offline";
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const signOutRow = useRef<HTMLButtonElement>(null);

  const wasOpen = useRef(false);
  function closeSignOut() {
    setSignOutOpen(false);
  }
  // คืน focus ให้แถวหลังแผ่นปิด (หลังแถวกลับมากดได้แล้ว)
  useEffect(() => {
    if (wasOpen.current && !signOutOpen) {
      // แถวอาจปิดอยู่ (ออฟไลน์ระหว่างเปิดแผ่น) → โฟกัสหัวข้อส่วนบัญชีแทน
      const row = signOutRow.current;
      if (row && !row.disabled) row.focus();
      else document.getElementById("account-heading")?.focus();
    }
    wasOpen.current = signOutOpen;
  }, [signOutOpen, signingOut]);

  async function onSignOut() {
    if (signingOut || offline) return;
    setSigningOut(true);
    setSignOutFailed(false);
    const r = await signOutRequest();
    if (!r.ok) {
      setSigningOut(false);
      setSignOutFailed(true); // ล้มแล้วหยุด ไม่ล้างอะไร (ADR 0006 ข้อ 5)
      setSignOutOpen(false);
      return;
    }
    // ADR 0006 ข้อ 5 ขั้น 2: ล้างแคชหน้าผู้ใช้ + hint ก่อนโหลดเต็มหน้า
    await resetDeviceAfterSignOut({ accountDeleted: false });
    window.location.replace("/welcome");
  }

  return (
    <section aria-labelledby="account-heading" className="flex flex-col gap-1">
      <h2 id="account-heading" tabIndex={-1} className="text-section outline-none">
        {t("title")}
      </h2>
      {me ? (
        <p className="break-all text-body text-ink-3">{me.user.email}</p>
      ) : (
        <div aria-hidden="true" className="h-6 w-48 rounded-box bg-paper-2" />
      )}

      <ul className="m-0 mt-2 flex list-none flex-col p-0">
        {/* แถวของแอดมิน (D2): โผล่เมื่อ /api/me ตอบ isAdmin เท่านั้น · HTML จากเซิร์ฟเวอร์เหมือนกันทุกคน · ปิดตอนออฟไลน์ */}
        {me?.isAdmin === true ? (
          <Row>
            {offline ? (
              <span aria-disabled="true" className="flex min-h-13 w-full items-center justify-between text-ink-3">
                {t("adminInvites")}
                <Chevron />
              </span>
            ) : (
              <Link href="/admin/invites" className="flex min-h-13 w-full items-center justify-between text-ink no-underline">
                {t("adminInvites")}
                <Chevron />
              </Link>
            )}
          </Row>
        ) : null}
        <Row>
          <Link href="/privacy" className="flex min-h-13 w-full items-center justify-between text-ink no-underline">
            {t("privacy")}
            <Chevron />
          </Link>
        </Row>
        <Row disabled>
          <span aria-disabled="true">{t("export")}</span>
          <span className="text-caption">{t("exportSoon")}</span>
        </Row>
        <Row>
          <button
            ref={signOutRow}
            type="button"
            disabled={offline || signingOut}
            aria-disabled={offline || signingOut}
            aria-haspopup="dialog"
            onClick={() => setSignOutOpen(true)}
            className="flex min-h-13 w-full cursor-pointer items-center text-left text-body text-ink disabled:cursor-not-allowed disabled:text-ink-3"
          >
            {signingOut ? t("signingOut") : t("signOut")}
          </button>
        </Row>
        <Row>
          <button
            type="button"
            disabled={offline}
            aria-disabled={offline}
            onClick={() => setDeleteOpen(true)}
            className="flex min-h-13 w-full cursor-pointer items-center justify-between text-left text-body text-warn disabled:cursor-not-allowed disabled:text-ink-3"
          >
            {t("delete")}
            <Chevron />
          </button>
        </Row>
      </ul>
      {offline ? (
        <p role="status" className="text-caption text-ink-3">
          {t("needNet")}
        </p>
      ) : null}
      {signOutFailed ? (
        <p role="alert" className="text-caption text-warn">
          {t("signOutFailed")}
        </p>
      ) : null}

      {signOutOpen ? <SignOutSheet busy={signingOut} offline={offline} onConfirm={() => void onSignOut()} onClose={closeSignOut} /> : null}
      {deleteOpen ? <DeleteAccountScreen onCancel={() => setDeleteOpen(false)} /> : null}
    </section>
  );
}

/** แผ่นล่างยืนยันออกจากระบบ: แพทเทิร์นเดียวกับ RevokeSheet · focus เริ่มที่ "ยกเลิก" ถูกขังในแผ่น · Esc/แตะพื้นมืด = ปิด */
function SignOutSheet({ busy, offline, onConfirm, onClose }: { busy: boolean; offline: boolean; onConfirm: () => void; onClose: () => void }) {
  const t = useTranslations("account.signOutSheet");
  const tAccount = useTranslations("account");
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-scrim" onClick={() => (busy ? undefined : onClose())} aria-hidden="true" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signout-title"
        className="pb-safe absolute inset-x-3 bottom-3 mx-auto flex max-w-114 flex-col gap-3 rounded-hand border-draw border-ink bg-paper p-5"
      >
        <h2 id="signout-title" className="text-section">
          {t("title")}
        </h2>
        <p className="text-body text-ink-2">{t("body")}</p>
        <Button loading={busy} disabled={offline} onClick={onConfirm}>
          {busy ? tAccount("signingOut") : t("confirm")}
        </Button>
        <TextButton ref={cancel} disabled={busy} onClick={onClose}>
          {t("cancel")}
        </TextButton>
      </div>
    </div>
  );
}

type DeleteState = "confirm" | "deleting" | "failed" | "done";

/** จอเต็มซ้อนบน /me: ยืนยันลบ → "กำลังลบ…" (กดซ้ำไม่ได้) → ลบเรียบร้อย (#13) */
function DeleteAccountScreen({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations("account.deleteScreen");
  const net = useNet();
  const [understood, setUnderstood] = useState(false);
  const [state, setState] = useState<DeleteState>("confirm");
  const busy = state === "deleting";

  async function onDelete() {
    if (busy || !understood) return;
    setState("deleting");
    const r = await deleteAccountRequest();
    if (r.ok) {
      // ล้างเครื่อง (แคช + hint + เครื่องที่เคยเข้า) เสร็จก่อนแสดงจอสำเร็จ
      await resetDeviceAfterSignOut({ accountDeleted: true });
      setState("done");
    } else setState("failed");
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="delete-title" className="fixed inset-0 z-30 overflow-y-auto bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-120 flex-col px-5 pt-8 pb-8">
        {state === "done" ? (
          <div className="flex flex-1 flex-col items-center text-center">
            <Cat pose="back" size={170} className="mt-12 text-ink" />
            <HandWord as="p" className="mt-4 text-hand">
              {t("doneHand")}
            </HandWord>
            <h1 id="delete-title" className="text-page">
              {t("doneTitle")}
            </h1>
            <p className="mt-1 max-w-72 text-body text-ink-2">{t("doneBody")}</p>
            <div className="mt-auto w-full pt-8">
              <Button onClick={() => window.location.replace("/welcome")}>{t("doneButton")}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            {state === "failed" ? <Cat pose="confused" size={120} className="self-center text-ink" /> : null}
            <h1 id="delete-title" className="mt-2 text-page">
              {t("title")}
            </h1>
            <p className="mt-1 text-body text-ink-2">{t("body")}</p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-body text-ink-2">
              <li>{t("item1")}</li>
              <li>{t("item2")}</li>
              <li>{t("item3")}</li>
              <li>{t("item4")}</li>
            </ul>
            <p className="mt-4 text-caption text-ink-3">{t("exportSoon")}</p>
            <p className="mt-1 text-caption text-ink-3">{t("backup")}</p>

            <div className="mt-auto flex flex-col gap-2 pt-8">
              {state === "failed" ? (
                <p role="alert" className="text-caption text-warn">
                  {t("failed")}
                </p>
              ) : null}
              {net === "offline" ? (
                <p role="status" className="text-caption text-ink-3">
                  {t("needNet")}
                </p>
              ) : null}
              <Checkbox checked={understood} disabled={busy} onChange={(e) => setUnderstood(e.target.checked)}>
                {t("understand")}
              </Checkbox>
              <Button
                loading={busy}
                disabled={!understood || net === "offline"}
                onClick={() => void onDelete()}
                className="border-warn text-warn"
              >
                {busy ? t("deleting") : state === "failed" ? t("retry") : t("confirm")}
              </Button>
              <TextButton disabled={busy} onClick={onCancel}>
                {t("cancel")}
              </TextButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
