"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Cat } from "@/components/doodle";
import { Button, TextButton } from "@/components/ui/button";
import { HandWord } from "@/components/ui/hand-word";
import { TextField } from "@/components/ui/text-field";
import { checkInviteCode, sendOtp, startGoogleSignIn } from "./api";
import { detectIosStandalone, HIDE_GOOGLE_ON_IOS_STANDALONE, shouldShowGoogle } from "./auth-config";
import { formatMmSs, useCountdown } from "./countdown";
import { isKnownDevice } from "./gate-hint";
import { classifyCallbackError, formatInviteInput, isInviteShapeValid, readInviteFromHash } from "./invite-input";
import { GoogleMark } from "./google-mark";
import { OfflineSignIn } from "./offline-sign-in";
import { OtpPanel } from "./otp-panel";
import { useNet } from "./use-net";

type Step = "start" | "email" | "otp";
type InviteError = "invalid" | "required" | "rate_limited" | "check_failed" | null;
type EmailError = "invalid" | "tooFast" | "unavailable" | "failed" | "network" | null;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** จอยินดีต้อนรับ: โค้ดเชิญ → Google (ทางหลัก) หรืออีเมล + OTP (ทางรอง) ในหน้าเดียว (ADR 0006: ไม่มี path ย่อย) */
export function WelcomeScreen() {
  const t = useTranslations("welcome");
  const app = useTranslations("app");
  const net = useNet();

  const [step, setStep] = useState<Step>("start");
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState<InviteError>(null);
  const [inviteWaitUntil, setInviteWaitUntil] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<EmailError>(null);
  const [emailWaitUntil, setEmailWaitUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState<"google" | "check" | "send" | null>(null);
  const [googleError, setGoogleError] = useState(false);
  const [showGoogle, setShowGoogle] = useState(true);
  const [knownDevice, setKnownDevice] = useState(false);
  const inviteWait = useCountdown(inviteWaitUntil);
  const emailWait = useCountdown(emailWaitUntil);

  // หลัง hydrate: อ่าน #invite= (แล้วลบออกจาก URL) · ?error= ของ Google (แล้วลบออก) · iOS standalone · เครื่องที่เคยเข้า
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- อ่านค่าจากเบราว์เซอร์ได้เฉพาะหลัง hydrate */
    const fromHash = readInviteFromHash(window.location.hash);
    const callbackError = classifyCallbackError(new URLSearchParams(window.location.search).get("error"));
    if (fromHash) setInvite(fromHash);
    if (callbackError === "invite_required") setInviteError("required");
    else if (callbackError === "generic") setGoogleError(true);
    if (fromHash || window.location.search) {
      // ADR 0006: ไม่ให้โค้ดเชิญค้างใน URL/ประวัติ · query ของ error ไม่ต้องค้าง (รีเฟรชแล้วไม่ขึ้นซ้ำ)
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    const env = detectIosStandalone();
    setShowGoogle(shouldShowGoogle(HIDE_GOOGLE_ON_IOS_STANDALONE, env.isIos, env.standalone));
    setKnownDevice(isKnownDevice());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (net === "offline") return <OfflineSignIn />;

  const inviteVisible = !knownDevice;

  /** ตรวจโค้ดก่อนไปต่อ · ช่องว่าง = ข้าม (บัญชีเดิมไม่ต้องใส่) */
  async function ensureInvite(): Promise<boolean> {
    if (invite.trim() === "") return true;
    if (!isInviteShapeValid(invite)) {
      setInviteError("invalid");
      return false;
    }
    setBusy("check");
    const r = await checkInviteCode(invite);
    setBusy(null);
    if (r.result === "ok") return true;
    if (r.result === "invalid") setInviteError("invalid");
    else if (r.result === "rate_limited") {
      setInviteWaitUntil(Date.now() + r.retryAfterS * 1000);
      setInviteError("rate_limited");
    } else setInviteError("check_failed");
    return false;
  }

  async function onGoogle() {
    setInviteError(null);
    setGoogleError(false);
    if (!(await ensureInvite())) return;
    setBusy("google");
    const r = await startGoogleSignIn();
    if (r.ok) {
      window.location.assign(r.url);
      return; // ค้างสถานะ "กำลังไปหา Google" จนหน้าเปลี่ยน
    }
    setBusy(null);
    setGoogleError(true);
  }

  async function onSendCode() {
    setInviteError(null);
    setEmailError(null);
    const address = email.trim();
    if (!EMAIL_SHAPE.test(address)) {
      setEmailError("invalid");
      return;
    }
    if (!(await ensureInvite())) {
      // ในจอที่ไม่มีช่องโค้ดบนขั้นอีเมล พากลับไปแก้โค้ด
      setStep("start");
      return;
    }
    setBusy("send");
    const r = await sendOtp(address);
    setBusy(null);
    if (r.ok) {
      setEmail(address);
      setStep("otp");
      return;
    }
    if (r.reason === "rate_limited") {
      setEmailWaitUntil(Date.now() + r.retryAfterS * 1000);
      setEmailError("tooFast");
    } else if (r.reason === "email_unavailable") setEmailError("unavailable");
    else if (r.reason === "invalid_email") setEmailError("invalid");
    else setEmailError(r.reason === "network" ? "network" : "failed");
  }

  if (step === "otp") {
    return <OtpPanel email={email} hasGoogle={showGoogle} onChangeEmail={() => setStep("email")} />;
  }

  const inviteMessage =
    inviteError === "invalid"
      ? t("invite.invalid")
      : inviteError === "required"
        ? t("invite.required")
        : inviteError === "rate_limited"
          ? t("invite.rateLimited", { time: formatMmSs(inviteWait) })
          : inviteError === "check_failed"
            ? t("invite.checkFailed")
            : null;

  const emailMessage =
    emailError === "invalid"
      ? t("email.invalid")
      : emailError === "tooFast"
        ? t("email.tooFast", { time: formatMmSs(emailWait) })
        : emailError === "unavailable"
          ? t(showGoogle ? "email.unavailable" : "email.unavailableNoGoogle")
          : emailError === "network"
            ? t("email.network")
            : emailError === "failed"
              ? t("email.failed")
              : null;

  const inviteField = inviteVisible ? (
    <TextField
      label={t("invite.label")}
      value={invite}
      onChange={(e) => {
        setInvite(formatInviteInput(e.target.value));
        setInviteError(null);
      }}
      placeholder={t("invite.placeholder")}
      hint={showGoogle ? t("invite.hint") : t("invite.hintNoGoogle")}
      error={inviteMessage}
      tabular
      autoCapitalize="characters"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="next"
      maxLength={9}
    />
  ) : null;

  const emailField = (
    <TextField
      label={t("email.label")}
      value={email}
      onChange={(e) => {
        setEmail(e.target.value);
        setEmailError(null);
      }}
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="send"
      placeholder={t("email.placeholder")}
      hint={showGoogle ? undefined : t("email.hint")}
      error={emailMessage}
      onKeyDown={(e) => {
        if (e.key === "Enter" && busy === null) void onSendCode();
      }}
    />
  );

  // ขั้นอีเมล (มี Google อยู่ด้วย) — เปิดจาก "ใช้อีเมลแทน"
  if (step === "email" && showGoogle) {
    return (
      <div className="flex flex-1 flex-col">
        <TextButton className="-ml-3 self-start" onClick={() => setStep("start")}>
          {t("email.back")}
        </TextButton>
        <h1 className="mt-2 text-page">{t("email.title")}</h1>
        <p className="mt-1 text-body text-ink-2">{t("email.intro")}</p>
        <div className="mt-6">{emailField}</div>
        <p className="mt-4 text-caption text-ink-3">
          {invite && isInviteShapeValid(invite) ? (
            <>
              <span className="num">{t("email.inviteSummary", { code: invite })}</span> ·{" "}
            </>
          ) : (
            <>{t("email.noInvite")} · </>
          )}
          <button type="button" className="inline-flex min-h-11 cursor-pointer items-center text-ink underline-hand" onClick={() => setStep("start")}>
            {invite ? t("email.edit") : t("email.addInvite")}
          </button>
        </p>
        {inviteMessage ? (
          <p role="alert" className="text-caption text-warn">
            {inviteMessage}
          </p>
        ) : null}
        <div className="mt-auto flex flex-col gap-2 pt-8">
          <Button loading={busy === "send" || busy === "check"} onClick={() => void onSendCode()}>
            {busy === "send" || busy === "check" ? t("email.sending") : t("email.send")}
          </Button>
          <p className="text-center text-caption text-ink-3">{t("email.spamHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center text-center">
        <HandWord as="p" className="text-hand">
          {app("name")}
        </HandWord>
        <h1 className="mt-1 text-page">{t("title")}</h1>
        <p className="mt-1 text-body text-ink-2">{t("tagline")}</p>
        <Cat pose="standing" size={showGoogle ? 150 : 110} motion className="mt-4 text-ink" />
      </div>

      <div className="mt-auto flex flex-col gap-4 pt-8">
        {inviteField}
        {showGoogle ? (
          <>
            <Button loading={busy === "google" || busy === "check"} onClick={() => void onGoogle()}>
              <GoogleMark />
              {busy === "google" ? t("google.loading") : t("google.label")}
            </Button>
            {googleError ? (
              <p role="alert" className="text-center text-caption text-warn">
                {t("google.failed")}
              </p>
            ) : null}
            <TextButton className="self-center" onClick={() => setStep("email")}>
              {t("useEmail")}
            </TextButton>
          </>
        ) : (
          <>
            {emailField}
            <Button loading={busy === "send" || busy === "check"} onClick={() => void onSendCode()}>
              {busy === "send" || busy === "check" ? t("email.sending") : t("email.sendNoGoogle")}
            </Button>
            <p className="text-center text-caption text-ink-3">{t("email.noPassword")}</p>
          </>
        )}
      </div>
    </div>
  );
}
