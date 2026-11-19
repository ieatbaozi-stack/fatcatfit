"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui/cx";
import { Icon, type IconName } from "@/components/ui/icon";
import { Squiggle } from "@/components/ui/squiggle";

export const TABS = [
  { href: "/", key: "home", icon: "home" },
  { href: "/history", key: "history", icon: "history" },
  { href: "/progress", key: "progress", icon: "progress" },
  { href: "/me", key: "me", icon: "me" },
] as const satisfies ReadonlyArray<{ href: string; key: string; icon: IconName }>;

/** แท็บที่เลือก: "/" ตรงเป๊ะ · อื่นๆ ตรงหรืออยู่ใต้ path นั้น */
export function isTabActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // หน้าแอดมิน (/admin/**) เป็นของแท็บ "ฉัน" (UX 11.1)
  if (href === "/me" && (pathname === "/admin" || pathname.startsWith("/admin/"))) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** แถบนำทางล่าง 4 แท็บ — ติดขอบล่าง เคารพ safe-area · ป้าย 14px · แท็บที่เลือก = ขีดเส้นใต้วาดมือ + aria-current */
export function BottomTabs() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="pb-safe fixed inset-x-0 bottom-0 z-10 bg-paper">
      <div className="relative mx-auto max-w-120 px-1 pt-3 pb-3">
        {/* ห่อด้วย div: Squiggle มี w-full อยู่แล้ว ถ้าใส่ inset-x-2 ตรงๆ เส้นจะยาวเกินขอบขวา 8px */}
        <div className="absolute inset-x-2 top-0">
          <Squiggle variant={0} />
        </div>
        <ul className="m-0 grid list-none grid-cols-4 p-0">
          {TABS.map(({ href, key, icon }) => {
            const active = isTabActive(pathname, href);
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={t(key)}
                  className={cx(
                    "flex min-h-13 min-w-0 flex-col items-center justify-center gap-0.5 rounded-hand text-caption no-underline",
                    active ? "font-medium text-ink" : "font-normal text-ink-3",
                  )}
                >
                  <Icon name={icon} size={26} />
                  {/* บรรทัดเดียวเสมอ แม้ซูมตัวอักษร 200% — ถ้ายาวเกินช่องจะตัดด้วย … (ชื่อเต็มอยู่ใน aria-label) · pb-2/-mb-2 เว้นที่ให้เส้นใต้วาดมือไม่ถูก overflow ตัด */}
                  <span className={cx("-mb-2 block max-w-full truncate whitespace-nowrap pb-2", active && "underline-hand")}>{t(key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
