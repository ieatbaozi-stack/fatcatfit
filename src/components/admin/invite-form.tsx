"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { useCountdown } from "@/components/auth/countdown";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { NumberInput } from "@/components/ui/number-input";
import { TextField } from "@/components/ui/text-field";
import {
  ADMIN_INVITE_DAYS,
  ADMIN_INVITE_LABEL_MAX,
  ADMIN_INVITE_MAX_USES_MAX,
  adminInviteInputSchema,
} from "@/lib/data/shared/admin-invite";
import { createInvite, reloadPage, type CreatedInvite } from "./invite-api";
import { clampUses, labelLength, splitWait } from "./invite-format";

const DEFAULT_DAYS = 3;
const DEFAULT_USES = 1;
const COUNTER_FROM = 30;
const nowMs = () => Date.now();

/** ฟอร์มออกโค้ด (D3): ป้าย · วัน (ชิป) · จำนวนคน (−/+) · กดครั้งเดียวจบ · ที่กรอกไม่หายเมื่อผิดพลาด */
export function InviteForm({ online, onCreated }: { online: boolean; onCreated: (invite: CreatedInvite) => void }) {
  const t = useTranslations("admin.invites");
  const daysLabelId = useId();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const [uses, setUses] = useState<number | null>(DEFAULT_USES);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const wait = useCountdown(waitUntil);
  const rateLimited = waitUntil !== null && wait > 0;

  const count = labelLength(label);
  const usesValue = clampUses(uses);
  const canSubmit = online && !busy && !rateLimited && count >= 1 && usesValue !== null;

  async function submit() {
    if (!canSubmit || usesValue === null) return;
    const parsed = adminInviteInputSchema.safeParse({ label, days, maxUses: usesValue });
    if (!parsed.success) {
      setFailed(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    const r = await createInvite(parsed.data);
    setBusy(false);
    if (r.ok) return onCreated(r.invite);
    if (r.reason === "not_found") return reloadPage();
    if (r.reason === "rate_limited") {
      setWaitUntil(nowMs() + r.retryAfterS * 1000);
      return;
    }
    setFailed(true);
  }

  function onDaysKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const i = ADMIN_INVITE_DAYS.findIndex((d) => d === days);
    const nextIndex = (i + step + ADMIN_INVITE_DAYS.length) % ADMIN_INVITE_DAYS.length;
    setDays(ADMIN_INVITE_DAYS[nextIndex]);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex]?.focus();
  }

  const wp = splitWait(wait);
  const time =
    wp.kind === "hoursMinutes"
      ? t("time.hoursMinutes", { h: wp.h, m: wp.m })
      : wp.kind === "minutes"
        ? t("time.minutes", { m: wp.m })
        : t("time.underMinute");

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <TextField
          label={t("form.label")}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setFailed(false);
          }}
          placeholder={t("form.labelPlaceholder")}
          hint={t("form.labelHint")}
          maxLength={ADMIN_INVITE_LABEL_MAX}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
        />
        {count >= COUNTER_FROM ? (
          <p className="text-right text-caption text-ink-3 tabular-nums">{t("form.labelCount", { count })}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={daysLabelId} className="text-caption text-ink-3">
          {t("form.days")}
        </span>
        <div role="radiogroup" aria-labelledby={daysLabelId} onKeyDown={onDaysKey} className="grid grid-cols-4 gap-2">
          {ADMIN_INVITE_DAYS.map((d) => {
            const on = d === days;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setDays(d)}
                className={cx(
                  "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-hand border-draw-thin border-ink px-2 text-body font-normal",
                  on ? "bg-ink text-paper" : "bg-transparent text-ink",
                )}
              >
                {t("form.daysOption", { days: d })}
              </button>
            );
          })}
        </div>
      </div>

      <NumberInput
        label={t("form.uses")}
        value={uses}
        onChange={setUses}
        min={1}
        max={ADMIN_INVITE_MAX_USES_MAX}
        startAt={DEFAULT_USES}
        onBlur={() => setUses((u) => clampUses(u) ?? DEFAULT_USES)}
        disabled={busy}
      />

      <div className="flex flex-col gap-2">
        {rateLimited ? (
          <p role="alert" className="text-caption text-ink-2">
            {t("form.rateLimited", { time })}
          </p>
        ) : failed ? (
          <p role="alert" className="text-caption text-warn">
            {t("form.failed")}
          </p>
        ) : null}
        <Button type="submit" loading={busy} disabled={!canSubmit}>
          {busy ? t("form.submitting") : failed ? t("form.retry") : t("form.submit")}
        </Button>
      </div>
    </form>
  );
}
