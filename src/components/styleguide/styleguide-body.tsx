"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Cat } from "@/components/doodle";
import { Button, TextButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cx } from "@/components/ui/cx";
import { HandWord } from "@/components/ui/hand-word";
import { NumberInput } from "@/components/ui/number-input";
import { Squiggle } from "@/components/ui/squiggle";
import { TickButton } from "@/components/ui/tick-button";

// class เขียนตรงๆ ทั้งหมด เพื่อให้ Tailwind สแกนเจอ
const COLORS = [
  { token: "paper", key: "paper", swatch: "bg-paper" },
  { token: "paper-2", key: "paper2", swatch: "bg-paper-2" },
  { token: "ink", key: "ink", swatch: "bg-ink" },
  { token: "ink-2", key: "ink2", swatch: "bg-ink-2" },
  { token: "ink-3", key: "ink3", swatch: "bg-ink-3" },
  { token: "accent", key: "accent", swatch: "bg-accent" },
  { token: "on-accent", key: "onAccent", swatch: "bg-on-accent" },
  { token: "cat", key: "cat", swatch: "bg-cat" },
  { token: "cat-ear", key: "catEar", swatch: "bg-cat-ear" },
  { token: "cat-white", key: "catWhite", swatch: "bg-cat-white" },
  { token: "warn", key: "warn", swatch: "bg-warn" },
] as const;

const SPACES = [
  { px: 4, bar: "w-1" },
  { px: 8, bar: "w-2" },
  { px: 12, bar: "w-3" },
  { px: 16, bar: "w-4" },
  { px: 24, bar: "w-6" },
  { px: 32, bar: "w-8" },
  { px: 48, bar: "w-12" },
  { px: 64, bar: "w-16" },
] as const;

// อ่านค่า token จริงจาก CSS ของโหมดที่เปิดอยู่ (เปลี่ยนเมื่อสลับโหมด/ระบบเปลี่ยน)
function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", callback);
  };
}

function readTokens(): string {
  const style = getComputedStyle(document.documentElement);
  return COLORS.map((c) => style.getPropertyValue(`--${c.token}`).trim()).join("|");
}

function useTokenValues(): string[] {
  const joined = useSyncExternalStore(subscribeTheme, readTokens, () => "");
  return joined ? joined.split("|") : [];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 flex flex-col gap-4">
      <h2 className="text-section">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-ink-3">{label}</p>
      {children}
    </div>
  );
}

export function StyleguideBody() {
  const t = useTranslations("styleguide");
  const values = useTokenValues();
  const [chips, setChips] = useState({ gym: true, home: false, park: false });
  const [ticks, setTicks] = useState([true, false]);
  const [weight, setWeight] = useState<number | null>(62.5);
  const [reps, setReps] = useState<number | null>(8);
  const [empty, setEmpty] = useState<number | null>(null);

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-page">{t("title")}</h1>
        <p className="text-body text-ink-2">{t("intro")}</p>
      </header>

      <Section title={t("colors.title")}>
        <p className="text-caption text-ink-3">{t("colors.note")}</p>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0">
          {COLORS.map((c, i) => (
            <li key={c.token} className="flex items-center gap-4">
              <span className={cx("size-12 flex-none rounded-blob border-draw-thin border-ink", c.swatch)} />
              <span className="flex min-w-0 flex-col">
                <span className="text-body font-medium text-ink">
                  --{c.token} <span className="num text-caption font-normal text-ink-3">{values[i] ?? ""}</span>
                </span>
                <span className="text-caption text-ink-3">{t(`colors.${c.key}`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("type.title")}>
        <p className="text-page font-medium text-ink">{t("type.page")}</p>
        <p className="text-section font-medium text-ink">{t("type.section")}</p>
        <p className="text-body font-light text-ink-2">{t("type.body")}</p>
        <p className="text-caption font-light text-ink-3">{t("type.caption")}</p>
        <p className="num text-numeral">{t("type.numeral")}</p>
        <div className="flex flex-col gap-1">
          <HandWord className="text-hand">{t("type.handSample")}</HandWord>
          <p className="text-caption text-ink-3">{t("type.handNote")}</p>
        </div>
      </Section>

      <Section title={t("space.title")}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {SPACES.map((s) => (
            <li key={s.px} className="flex items-center gap-3">
              <span className="num w-12 flex-none text-caption text-ink-3">{s.px}px</span>
              <span className={cx("h-4 flex-none rounded-box bg-ink", s.bar)} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("buttons.title")}>
        <Button>{t("buttons.primary")}</Button>
        <Labeled label={t("buttons.primaryPressed")}>
          <Button data-pressed="true">{t("buttons.primary")}</Button>
        </Labeled>
        <Labeled label={t("buttons.focus")}>
          <Button data-focus="true">{t("buttons.primary")}</Button>
        </Labeled>
        <Labeled label={t("buttons.primaryDisabled")}>
          <Button disabled>{t("buttons.primary")}</Button>
        </Labeled>
        <Button loading>{t("buttons.primaryLoading")}</Button>
        <div className="flex flex-wrap items-center gap-4">
          <TextButton>{t("buttons.secondary")}</TextButton>
          <TextButton data-focus="true">{t("buttons.focus")}</TextButton>
          <TextButton disabled>{t("buttons.secondaryDisabled")}</TextButton>
        </div>
      </Section>

      <Section title={t("chips.title")}>
        <div className="flex flex-wrap gap-2">
          <Chip pressed={chips.gym} onClick={() => setChips((c) => ({ ...c, gym: !c.gym }))}>
            {t("chips.gym")}
          </Chip>
          <Chip pressed={chips.home} onClick={() => setChips((c) => ({ ...c, home: !c.home }))}>
            {t("chips.home")}
          </Chip>
          <Chip pressed={chips.park} onClick={() => setChips((c) => ({ ...c, park: !c.park }))}>
            {t("chips.park")}
          </Chip>
          <Chip pressed={false} data-focus="true">
            {t("buttons.focus")}
          </Chip>
        </div>
        <p className="text-caption text-ink-3">
          {t("chips.selected")} / {t("chips.notSelected")}
        </p>
      </Section>

      <Section title={t("divider.title")}>
        {[0, 1, 2, 3].map((v) => (
          <Squiggle key={v} variant={v} />
        ))}
        <Squiggle variant={2} tone="muted" />
      </Section>

      <Section title={t("tick.title")}>
        <div className="flex flex-wrap items-center gap-6">
          {ticks.map((on, i) => (
            <Labeled key={i} label={on ? t("tick.done") : t("tick.empty")}>
              <TickButton
                pressed={on}
                label={t("tick.setLabel", { n: i + 1 })}
                onClick={() => setTicks((cur) => cur.map((v, k) => (k === i ? !v : v)))}
              />
            </Labeled>
          ))}
          <Labeled label={t("tick.disabled")}>
            <TickButton pressed={false} label={t("tick.setLabel", { n: 3 })} disabled />
          </Labeled>
          <Labeled label={t("buttons.focus")}>
            <TickButton pressed={false} label={t("tick.setLabel", { n: 4 })} data-focus="true" />
          </Labeled>
        </div>
      </Section>

      <Section title={t("number.title")}>
        <NumberInput
          label={t("number.weight")}
          unit={t("number.kg")}
          value={weight}
          onChange={setWeight}
          step={2.5}
          min={0}
          max={500}
          big
          hint={t("number.hint")}
        />
        <NumberInput label={t("number.reps")} value={reps} onChange={setReps} step={1} min={0} max={999} />
        <NumberInput
          label={t("number.reps")}
          value={empty}
          onChange={setEmpty}
          min={0}
          placeholder={t("number.placeholder")}
        />
      </Section>

      <Section title={t("cats.title")}>
        <div className="flex flex-wrap items-end gap-8 text-ink">
          <Labeled label={t("cats.still")}>
            <Cat pose="standing" size={96} />
          </Labeled>
          <Labeled label={t("cats.wiggle")}>
            <Cat pose="standing" size={96} wiggle />
          </Labeled>
          <Labeled label={t("cats.meaning")}>
            <Cat pose="standing" size={96} title={t("cats.meaningTitle")} />
          </Labeled>
        </div>
      </Section>
    </>
  );
}
