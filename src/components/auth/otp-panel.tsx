"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, TextButton } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { sendOtp, verifyOtp } from "./api";
import { formatMmSs, useCountdown } from "./countdown";
import { useNet } from "./use-net";

const RESEND_AFTER_MS = 60_000;

type OtpError =
  | { kind: "wrong" | "failed" | "send_failed" | "unavailable" | "network" }
  | { kind: "rate_limited" };

/** ขั้นกรอก OTP: ครบ 6 หลักส่งเอง · ขอใหม่ได้หลัง 60 วิ · 429 แสดง "รอ mm:ss" */
export function OtpPanel({ email, onChangeEmail, hasGoogle }: { email: string; onChangeEmail: () => void; hasGoogle: boolean }) {
  const t = useTranslations("otp");
  const w = useTranslations("welcome");
  const net = useNet();
  const [code, setCode] = useState("");
  const [error, setError] = useState<OtpError | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendAt, setResendAt] = useState<number>(() => Date.now() + RESEND_AFTER_MS);
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);
  const wait = useCountdown(resendAt);
  const offline = net === "offline";

  // โฟกัสช่องรหัสหลังตรวจไม่ผ่าน: ต้องรอให้ช่องหลุด disabled (render ใหม่) ก่อน ไม่งั้น focus() ไม่ติด
  useEffect(() => {
    if (!verifying && refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [verifying]);

  async function submit(value: string) {
    if (submitting.current) return;
    submitting.current = true;
    setVerifying(true);
    setError(null);
    const r = await verifyOtp(email, value);
    submitting.current = false;
    setVerifying(false);
    refocus.current = true;
    if (r.ok) {
      // โหลดเต็มหน้า: ให้ service worker เก็บหน้าในสถานะล็อกอิน (ADR 0006 ข้อ 1)
      window.location.replace("/");
      return;
    }
    setCode("");
    if (r.reason === "invalid_otp") setError({ kind: "wrong" });
    else if (r.reason === "rate_limited") {
      setResendAt(Date.now() + r.retryAfterS * 1000);
      setError({ kind: "rate_limited" });
    } else if (r.reason === "invite_required") setError({ kind: "wrong" }); // ห้ามบอกว่าอีเมลนี้ไม่มีบัญชี
    else setError({ kind: r.reason === "network" ? "network" : "failed" });
  }

  function onType(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submit(digits);
  }

  async function resend() {
    setResending(true);
    setError(null);
    const r = await sendOtp(email);
    setResending(false);
    if (r.ok) {
      setCode("");
      setResendAt(Date.now() + RESEND_AFTER_MS);
      inputRef.current?.focus();
    } else if (r.reason === "rate_limited") {
      setResendAt(Date.now() + r.retryAfterS * 1000);
      setError({ kind: "rate_limited" });
    } else if (r.reason === "email_unavailable") setError({ kind: "unavailable" });
    else setError({ kind: r.reason === "network" ? "network" : "send_failed" });
  }

  const message = error
    ? error.kind === "wrong"
      ? t("wrong")
      : error.kind === "rate_limited"
        ? w("email.tooFast", { time: formatMmSs(wait) })
        : error.kind === "unavailable"
          ? w(hasGoogle ? "email.unavailable" : "email.unavailableNoGoogle")
          : error.kind === "network"
              ? t("network")
              : error.kind === "send_failed"
                ? w("email.failed")
                : t("failed")
    : null;

  const canResend = wait === 0 && !resending && !verifying && !offline;

  return (
    <div className="flex flex-1 flex-col">
      <TextButton className="self-start" disabled={verifying} onClick={onChangeEmail}>
        {t("back")}
      </TextButton>
      <h1 className="mt-4 text-page">{t("title")}</h1>
      <p className="mt-1 text-body text-ink-2">{t("sentTo", { email })}</p>

      <div className="mt-8">
        <label htmlFor="otp-input" className="block text-caption font-medium text-ink-2">
          {t("label")}
        </label>
        <input
          id="otp-input"
          ref={inputRef}
          value={code}
          onChange={(e) => onType(e.target.value)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          enterKeyHint="done"
          maxLength={6}
          autoFocus
          disabled={verifying || offline}
          aria-invalid={error && error.kind !== "rate_limited" ? true : undefined}
          aria-describedby={message ? "otp-message" : undefined}
          placeholder="••••••"
          className="num mt-2 min-h-16 w-full rounded-hand border border-line-strong bg-paper-2 px-4 text-center text-numeral-lg tracking-[0.4em] placeholder:font-normal placeholder:text-ink-3 transition-colors duration-150 focus:border-ink focus:bg-paper disabled:opacity-50"
        />
        <p id="otp-message" role="alert" className="mt-2 min-h-6 text-caption text-warn">
          {message}
        </p>
        {verifying ? (
          <p role="status" className="inline-flex items-center gap-2 text-caption text-ink-2">
            <span>{t("verifying")}</span>
            <LoadingDots size="sm" />
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col items-stretch gap-2 pt-8">
        <Button disabled={!canResend} loading={resending} onClick={() => void resend()}>
          {resending ? w("email.sending") : wait > 0 ? t("resendIn", { time: formatMmSs(wait) }) : t("resend")}
        </Button>
        {offline ? (
          <p role="status" className="text-center text-caption text-ink-3">
            {t("offline")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
