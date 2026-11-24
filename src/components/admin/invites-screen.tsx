"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cat } from "@/components/doodle";
import { Divider } from "@/components/ui/divider";
import { ButtonLink } from "@/components/ui/status-screen";
import { useToast } from "@/components/ui/toast";
import { useOnline } from "@/pwa/use-online";
import { InviteForm } from "./invite-form";
import { listInvites, reloadPage, type CreatedInvite, type InviteRow } from "./invite-api";
import { InviteList, RevokeSheet, type ListView } from "./invite-list";
import { ResultCard } from "./result-card";

const HIGHLIGHT_MS = 2000;

/**
 * หน้าออกโค้ดเชิญของแอดมิน (R1.5 · UX ข้อ 11) — รายการและโค้ดโหลดจาก API ฝั่งไคลเอนต์เท่านั้น (HTML จากเซิร์ฟเวอร์ไม่มีข้อมูล)
 * โค้ดที่เพิ่งออกอยู่ใน state ของหน้านี้อย่างเดียว · API ตอบ 404 ที่ใดก็ตาม = reload ให้เซิร์ฟเวอร์ตัดสิน
 */
export function InvitesScreen() {
  const t = useTranslations("admin.invites");
  const online = useOnline();
  const [view, setView] = useState<ListView>({ status: "loading", rows: [] });
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteRow | null>(null);
  const [toastNode, showToast] = useToast();
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const r = await listInvites();
    if (!alive.current) return;
    if (r.ok) setView({ status: "ok", rows: r.invites });
    else if (r.reason === "not_found") reloadPage();
    else setView((prev) => (prev.status === "ok" ? prev : { status: "error", rows: prev.rows }));
  }, []);

  // เปิดหน้า + กลับมาออนไลน์ → โหลดรายการใหม่ 1 ครั้ง
  useEffect(() => {
    // ดึงข้อมูลจากภายนอก — setState เกิดหลังคำตอบ ไม่ใช่ตอน render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (online) void load();
  }, [online, load]);

  // back/forward cache (Safari เก็บหน้าแม้มี no-store): โค้ดที่เพิ่งออกต้องไม่กลับมาให้เห็นตอนกด Back
  // pagehide = ล้างก่อนหน้าถูกแช่แข็ง (ภาพที่เก็บไว้ไม่มีโค้ด) · pageshow = กันซ้ำถ้าเบราว์เซอร์ข้ามขั้นแรก
  // กลับเป็นฟอร์มเปล่า + โหลดรายการใหม่เงียบๆ (ไม่ reload ทั้งหน้า: ถ้า session หมด API ตอบ 404 แล้ว load() จะ reload เอง)
  useEffect(() => {
    function clearCode() {
      flushSync(() => {
        setCreated(null);
        setHighlightId(null);
      });
    }
    function onPageHide(e: PageTransitionEvent) {
      if (e.persisted) clearCode();
    }
    function onPageShow(e: PageTransitionEvent) {
      if (!e.persisted) return;
      clearCode();
      void load();
    }
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [load]);

  useEffect(() => {
    if (!highlightId) return;
    const id = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [highlightId]);

  function retryList() {
    setView((prev) => ({ ...prev, status: "loading" }));
    void load();
  }

  function onCreated(invite: CreatedInvite) {
    setCreated(invite);
    setHighlightId(invite.id);
    const row: InviteRow = {
      id: invite.id,
      label: invite.label,
      status: "active",
      usesCount: 0,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt,
      createdAt: new Date().toISOString(),
    };
    // แถวใหม่ขึ้นบนสุดทันที (ไม่รอโหลดรายการ) · แล้วโหลดจริงอีกครั้งให้ตรงกับเซิร์ฟเวอร์
    setView((prev) => (prev.status === "ok" ? { status: "ok", rows: [row, ...prev.rows.filter((r) => r.id !== row.id)] } : prev));
    void load();
  }

  function onRevoked(result: "revoked" | "unchanged") {
    const target = revokeTarget;
    setRevokeTarget(null);
    if (!target) return;
    if (result === "revoked") {
      setView((prev) => ({
        ...prev,
        rows: prev.rows.map((r) => (r.id === target.id ? { ...r, status: "revoked" } : r)),
      }));
      showToast(t("toast.revoked"));
      window.setTimeout(() => document.getElementById(`invite-row-${target.id}`)?.focus(), 0);
    } else {
      showToast(t("toast.alreadyInactive"));
      void load();
    }
  }

  const nothingToShow = !online && view.status !== "ok" && created === null;

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-3">
        <Link
          href="/me"
          aria-label={t("back")}
          className="grid size-11 flex-none place-items-center rounded-full border border-line bg-paper-2 text-ink no-underline transition-opacity active:opacity-75"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5 L8 12 L15 19"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="text-page">{t("title")}</h1>
      </header>

      {nothingToShow ? (
        <div className="flex flex-col items-center gap-3 pt-8 text-center">
          <Cat pose="offline" size={176} className="text-ink" />
          <p role="status" className="text-section text-ink">
            {t("offline.title")}
          </p>
          <p className="max-w-72 text-body text-ink-2">{t("offline.body")}</p>
          <div className="w-full max-w-72 pt-4">
            <ButtonLink href="/me">{t("offline.back")}</ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-body text-ink-2">{t("intro")}</p>
          <div className="mt-6">
            {created ? (
              <ResultCard invite={created} online={online} toast={showToast} onAnother={() => setCreated(null)} />
            ) : (
              <InviteForm online={online} onCreated={onCreated} />
            )}
          </div>
          {!online ? (
            <p role="status" className="mt-3 text-caption text-ink-3">
              {t("needNet")}
            </p>
          ) : null}
          <Divider className="my-8" />
          <InviteList view={view} highlightId={highlightId} online={online} onRetry={retryList} onRevoke={setRevokeTarget} />
        </>
      )}

      {revokeTarget ? (
        <RevokeSheet row={revokeTarget} online={online} onClose={() => setRevokeTarget(null)} onDone={onRevoked} />
      ) : null}
      {toastNode}
    </div>
  );
}
