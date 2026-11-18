"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Cat } from "@/components/doodle";
import { Button, TextButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { NumberInput } from "@/components/ui/number-input";
import { Squiggle } from "@/components/ui/squiggle";
import { TextField } from "@/components/ui/text-field";
import { ONBOARDING_LIMITS } from "@/lib/data/shared/onboarding";
import { resolveLocale } from "@/lib/i18n/config";
import { postOnboarding } from "./api";
import { useMe } from "./auth-gate";
import {
  EMPTY_DRAFT,
  EXPERIENCES,
  GOALS,
  PLACE_KINDS,
  UNITS,
  ageFromBirthYear,
  buildPayload,
  mapServerFields,
  nextPlaceName,
  stepOfIssue,
  switchUnitSet,
  validateBody,
  validatePlace,
  type Draft,
  type FieldIssue,
  type FieldIssues,
  type PlaceKind,
  type UnitSet,
} from "./onboarding-form";
import { useNet } from "./use-net";

type SubmitFailure = "network" | "server" | "clock" | null;

/** เส้นความคืบหน้าวาดมือ: เส้นประเทา + เส้นส้มตามขั้น (ส้มที่เดียวของจอ) + แมวเดินบนเส้น */
function ProgressLine({ pct }: { pct: number }) {
  return (
    <div className="relative mb-4 h-14" aria-hidden="true">
      <svg viewBox="0 0 320 12" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-3 w-full">
        <path
          d="M2 6 C60 3 120 9 180 6 S280 4 318 6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="2 7"
          vectorEffect="non-scaling-stroke"
          className="text-ink-3"
        />
        <path
          d={`M2 6 C60 3 120 9 ${Math.max(4, pct * 3.18)} 6`}
          fill="none"
          stroke="currentColor"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="text-accent"
        />
      </svg>
      <div className="absolute bottom-1 transition-[left] duration-300" style={{ left: `calc(${pct}% - 34px)` }}>
        <Cat pose="side" size={56} className="text-ink" />
      </div>
    </div>
  );
}

/** แบบสอบถามเริ่มต้น 2 ขั้น (UX E1 ข้อ 3): ค่าอยู่ในหน่วยความจำ ส่งครั้งเดียวตอน "เริ่มใช้" */
export function OnboardingScreen() {
  const t = useTranslations("onboarding");
  const locale = resolveLocale(useLocale());
  const { refresh } = useMe();
  const net = useNet();
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [serverIssues, setServerIssues] = useState<FieldIssues>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FieldIssues, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure>(null);
  // id สร้างครั้งเดียวต่อหน้า — ส่งซ้ำ (ลองใหม่) ด้วย id เดิม เซิร์ฟเวอร์ไม่สร้างแถวซ้ำ
  const ids = useRef<{ placeId: string; bodyEntryId: string } | null>(null);
  const lastDefaultName = useRef<string | null>(null);
  const offline = net === "offline";

  const now = new Date();
  const bodyIssues = validateBody(draft, now);
  const placeIssues = validatePlace(draft);
  const bodyOk = Object.keys(bodyIssues).length === 0;
  const placeOk = Object.keys(placeIssues).length === 0;

  function issueText(key: keyof FieldIssues, local: FieldIssues): string | null {
    // ช่องว่างไม่ขึ้น error เอง (ปุ่มปิดอยู่แล้ว) · ค่านอกช่วงขึ้นหลังออกจากช่อง · เซิร์ฟเวอร์ปฏิเสธช่องไหนขึ้นทันที
    const fromLocal: FieldIssue | undefined = touched[key] && local[key] !== "required" ? local[key] : undefined;
    const issue = serverIssues[key] ?? fromLocal;
    if (!issue) return null;
    return t(issue === "required" ? "errors.required" : issue === "invalid" ? "errors.invalid" : "errors.outOfRange");
  }

  function touch(key: keyof FieldIssues) {
    setTouched((s) => ({ ...s, [key]: true }));
  }

  function update(patch: Partial<Draft>, key?: keyof FieldIssues) {
    setDraft((d) => ({ ...d, ...patch }));
    if (key) setServerIssues((s) => ({ ...s, [key]: undefined }));
    setFailure(null);
  }

  function chooseUnits(set: UnitSet) {
    setDraft((d) => switchUnitSet(d, set));
  }

  function choosePlaceKind(kind: PlaceKind) {
    const label = t(`place.kinds.${kind}`);
    setDraft((d) => {
      const name = nextPlaceName(d.placeName, lastDefaultName.current, label);
      lastDefaultName.current = label;
      return { ...d, placeKind: kind, placeName: name };
    });
    setServerIssues((s) => ({ ...s, placeName: undefined }));
  }

  function toggleGoal(goal: (typeof GOALS)[number]) {
    setDraft((d) => ({
      ...d,
      goals: d.goals.includes(goal) ? d.goals.filter((g) => g !== goal) : [...d.goals, goal].slice(0, ONBOARDING_LIMITS.maxGoals),
    }));
  }

  async function onStart() {
    if (submitting || !bodyOk || !placeOk) return;
    ids.current ??= { placeId: crypto.randomUUID(), bodyEntryId: crypto.randomUUID() };
    setSubmitting(true);
    setFailure(null);
    const r = await postOnboarding(buildPayload(draft, ids.current, locale, new Date()));
    if (r.ok || (!r.ok && r.reason === "already_onboarded")) {
      // โหลดเต็มหน้า: ล้างค่าในหน่วยความจำ + ให้ service worker เก็บหน้าในสถานะล็อกอิน
      window.location.replace("/");
      return;
    }
    setSubmitting(false);
    if (r.reason === "invalid") {
      const mapped = mapServerFields(r.fields);
      setServerIssues(mapped.issues);
      if (Object.keys(mapped.issues).length > 0) setStep(stepOfIssue(mapped.issues));
      if (mapped.general) setFailure("clock");
    } else if (r.reason === "consent_required" || r.reason === "unauthorized") {
      await refresh(); // ตารางตัดสินพาไปจอที่ถูก
    } else setFailure(r.reason === "network" ? "network" : "server");
  }

  const u = UNITS[draft.unitSet];
  const age = draft.birthYear !== null && !bodyIssues.birthYear ? ageFromBirthYear(draft.birthYear, now) : null;
  const failureText = failure === "clock" ? t("errors.clock") : failure ? t("saveFailed") : null;

  const unitChips = (
    <div role="group" aria-label={t("units.label")} className="flex flex-wrap gap-2">
      <Chip pressed={draft.unitSet === "metric"} onClick={() => chooseUnits("metric")}>
        {t("units.metric")}
      </Chip>
      <Chip pressed={draft.unitSet === "imperial"} onClick={() => chooseUnits("imperial")}>
        {t("units.imperial")}
      </Chip>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <ProgressLine pct={step === 1 ? 50 : 92} />

      {step === 1 ? (
        <>
          <div className="flex items-baseline justify-between">
            <h1 className="text-page">{t("step1.title")}</h1>
            <span className="num text-caption text-ink-3">{t("progress", { step: 1, total: 2 })}</span>
          </div>
          <p className="text-caption text-ink-3">{t("step1.note")}</p>
          <div className="mt-4">{unitChips}</div>
          <div className="mt-4 flex flex-col gap-5">
            <NumberInput
              label={t("step1.weight")}
              value={draft.weight}
              onChange={(v) => update({ weight: v }, "weight")}
              step={0.1}
              startAt={draft.unitSet === "metric" ? 60 : 130}
              unit={u.weight}
              error={issueText("weight", bodyIssues)}
              onBlur={() => touch("weight")}
            />
            <NumberInput
              label={t("step1.height")}
              value={draft.height}
              onChange={(v) => update({ height: v }, "height")}
              step={draft.unitSet === "metric" ? 1 : 0.5}
              startAt={draft.unitSet === "metric" ? 165 : 65}
              unit={u.length}
              error={issueText("height", bodyIssues)}
              onBlur={() => touch("height")}
            />
            <NumberInput
              label={t("step1.birthYear")}
              value={draft.birthYear}
              onChange={(v) => update({ birthYear: v }, "birthYear")}
              step={1}
              startAt={1995}
              error={issueText("birthYear", bodyIssues)}
              onBlur={() => touch("birthYear")}
              hint={age !== null ? t("step1.age", { age }) : t("step1.birthYearHint")}
            />
          </div>
          <div className="mt-auto pt-8">
            <Button disabled={!bodyOk} onClick={() => setStep(2)}>
              {t("next")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <h1 className="text-page">{t("step2.title")}</h1>
            <span className="num text-caption text-ink-3">{t("progress", { step: 2, total: 2 })}</span>
          </div>
          <div role="group" aria-label={t("step2.title")} className="mt-4 flex flex-wrap gap-2">
            {PLACE_KINDS.map((kind) => (
              <Chip key={kind} pressed={draft.placeKind === kind} onClick={() => choosePlaceKind(kind)}>
                {t(`place.kinds.${kind}`)}
              </Chip>
            ))}
          </div>
          <div className="mt-4">
            <TextField
              label={t("place.name")}
              value={draft.placeName}
              onChange={(e) => update({ placeName: e.target.value }, "placeName")}
              placeholder={t("place.placeholder")}
              maxLength={ONBOARDING_LIMITS.placeNameMax}
              autoComplete="off"
              enterKeyHint="done"
              error={issueText("placeName", placeIssues)}
            />
          </div>

          <Squiggle variant={2} tone="muted" className="my-6" />
          <p className="text-caption text-ink-3">{t("optional")}</p>
          <p className="mt-2 text-body text-ink">{t("goals.title")}</p>
          <div role="group" aria-label={t("goals.title")} className="mt-2 flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <Chip key={g} pressed={draft.goals.includes(g)} onClick={() => toggleGoal(g)}>
                {t(`goals.${g}`)}
              </Chip>
            ))}
          </div>
          <p className="mt-4 text-body text-ink">{t("experience.title")}</p>
          <div role="group" aria-label={t("experience.title")} className="mt-2 flex flex-wrap gap-2">
            {EXPERIENCES.map((x) => (
              <Chip
                key={x}
                pressed={draft.experience === x}
                onClick={() => update({ experience: draft.experience === x ? null : x })}
              >
                {t(`experience.${x}`)}
              </Chip>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-8">
            {failureText ? (
              <p role="alert" className="text-center text-caption text-warn">
                {failureText}
              </p>
            ) : null}
            <Button disabled={!placeOk || !bodyOk || offline} loading={submitting} onClick={() => void onStart()}>
              {submitting ? t("saving") : failure ? t("retry") : t("start")}
            </Button>
            <TextButton disabled={submitting} onClick={() => setStep(1)}>
              {t("back")}
            </TextButton>
          </div>
        </>
      )}
    </div>
  );
}
