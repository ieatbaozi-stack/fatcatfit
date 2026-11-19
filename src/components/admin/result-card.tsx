"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, TextButton } from "@/components/ui/button";
import type { CreatedInvite } from "./invite-api";
import { buildInviteLink, formatInviteDate } from "./invite-format";

const noSubscribe = () => () => {};
// ตรวจ navigator.share ด้วย feature detection หลัง hydrate (เซิร์ฟเวอร์ = false) — เลือกปุ่มตามที่ตรวจเจอ ไม่ใช่ตามขนาดจอ
const hasShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/**
 * กรอบ "แสดงครั้งเดียว" (D5): โค้ดอยู่ในหน่วยความจำของหน้านี้เท่านั้น (ไม่มี storage ใดๆ)
 * แชร์ = navigator.share({ text }) อย่างเดียว (ข้อความมีลิงก์ในตัว) · ยกเลิก (AbortError) = เงียบ · อื่นๆ/ไม่มี = คัดลอกข้อความ
 */
export function ResultCard({
  invite,
  online,
  onAnother,
  toast,
}: {
  invite: CreatedInvite;
  online: boolean;
  onAnother: () => void;
  toast: (text: string) => void;
}) {
  const t = useTranslations("admin.invites");
  const locale = useLocale();
  const canShare = useSyncExternalStore(noSubscribe, hasShare, () => false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const link = buildInviteLink(window.location.origin, invite.code);
  const date = formatInviteDate(invite.expiresAt, locale);
  // ข้อความแชร์ไม่มีป้ายและไม่มีอีเมล
  const message = t("share.text", { link, code: invite.code, date });

  async function copy(text: string, okText: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okText);
    } catch {
      toast(t("toast.copyFailed"));
    }
  }

  async function onShare() {
    try {
      await navigator.share({ text: message });
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return;
      await copy(message, t("toast.messageCopied"));
    }
  }

  return (
    <section aria-labelledby="invite-result-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-hand border-draw border-ink p-4">
        <h2 id="invite-result-title" ref={heading} tabIndex={-1} className="text-section">
          {t("result.title")}
        </h2>
        <p role="status" className="text-caption text-ink-2">
          {t("result.warning")}
        </p>
        <div>
          <p className="text-caption text-ink-3">{t("result.codeLabel")}</p>
          <p className="num select-all text-section tracking-wider min-[360px]:text-numeral min-[400px]:text-numeral-lg">{invite.code}</p>
        </div>
        <p className="truncate text-caption text-ink-3" dir="ltr">
          {link}
        </p>
        <p className="text-caption text-ink-2">{t("result.summary", { label: invite.label, uses: invite.maxUses, date })}</p>
      </div>

      <div className="flex flex-col gap-3">
        {canShare ? (
          <Button onClick={() => void onShare()}>{t("result.share")}</Button>
        ) : (
          <Button onClick={() => void copy(message, t("toast.messageCopied"))}>{t("result.copyMessage")}</Button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button className="font-normal" onClick={() => void copy(link, t("toast.linkCopied"))}>
            {t("result.copyLink")}
          </Button>
          <Button className="font-normal" onClick={() => void copy(invite.code, t("toast.codeCopied"))}>
            {t("result.copyCode")}
          </Button>
        </div>
        <TextButton className="self-center" disabled={!online} onClick={onAnother}>
          {t("result.another")}
        </TextButton>
      </div>
    </section>
  );
}
