"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useCatalogStore } from "@/components/catalog/store";
import { activeCount } from "@/components/places/place-logic";
import { useOnline } from "@/pwa/use-online";

const ROW = "flex min-h-14 w-full items-center justify-between gap-3 text-body font-medium text-ink no-underline transition-opacity active:opacity-70";

function Chevron() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" className="flex-none text-ink-3">
      <path d="M9.5 6 L15.5 12 L9.5 18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavRow({ href, children, trailing }: { href: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} className={ROW}>
        <span>{children}</span>
        <span className="flex items-center gap-2 text-caption font-normal text-ink-3">
          {trailing}
          <Chevron />
        </span>
      </Link>
    </li>
  );
}

/** ส่วน "ออกกำลังกาย" ของหน้า "ฉัน" (UX 12.2 · CR4 Studio Minimal): ท่าออกกำลังกาย · สถานที่ */
export function TrainingSection() {
  const t = useTranslations("me");
  const online = useOnline();
  const { bootstrap } = useCatalogStore({ catalog: false, bootstrap: true }, online);
  const places = bootstrap.data?.places;
  return (
    <section aria-labelledby="training-heading" className="flex flex-col gap-1">
      <h2 id="training-heading" className="text-section">
        {t("training")}
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        <NavRow href="/me/exercises">{t("exercises")}</NavRow>
        <NavRow href="/me/places" trailing={places ? <span className="num text-ink-3">{t("placesCount", { count: activeCount(places) })}</span> : null}>
          {t("places")}
        </NavRow>
      </ul>
    </section>
  );
}

/** ส่วน "เกี่ยวกับ" (UX 12.2): เครดิตข้อมูลท่า · R6 เพิ่มเครดิตอื่น/เลขรุ่น */
export function AboutSection() {
  const t = useTranslations("me");
  return (
    <section aria-labelledby="about-heading" className="flex flex-col gap-1">
      <h2 id="about-heading" className="text-section">
        {t("about")}
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        <NavRow href="/me/credits">{t("credits")}</NavRow>
      </ul>
    </section>
  );
}
