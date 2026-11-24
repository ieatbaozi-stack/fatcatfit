"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui/cx";
import { Icon, type IconName } from "@/components/ui/icon";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useTabsHidden } from "./tabs-visibility";

export const TABS = [
  { href: "/", key: "home", icon: "home" },
  { href: "/history", key: "history", icon: "history" },
  { href: "/progress", key: "progress", icon: "progress" },
  { href: "/me", key: "me", icon: "me" },
] as const satisfies ReadonlyArray<{ href: string; key: string; icon: IconName }>;

/** แท็บที่เลือก: "/" ตรงเป๊ะ · อื่นๆ ตรงหรืออยู่ใต้ path นั้น */
export function isTabActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * แถบลอยจุดเด้ง 3 จุดระหว่างสลับหน้า (CR4 · Next 16 useLinkStatus — ไม่มี loading.tsx จึงไม่กระทบ ADR 0005/0006)
 * หน่วง 140ms ด้วย CSS เพื่อไม่ให้กะพริบเมื่อเปลี่ยนหน้าเร็ว/จากแคช · คืน null เมื่อไม่ pending เพื่อไม่เพิ่ม DOM ใน <Link>
 */
function TabPendingPill({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div
      role="status"
      aria-label={label}
      className="fcf-pending-pill pointer-events-none fixed top-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-line-strong bg-surface-3 px-4 py-2 text-ink shadow-elevated"
    >
      <LoadingDots size="md" />
    </div>
  );
}

/**
 * แถบนำทางล่าง 4 แท็บ (CR4 Studio Minimal):
 * เส้นคั่นบนบาง 1px · แท็บที่เลือก = พื้นรอง + สีเข้มหนา + แถบชี้ด้านล่าง (ไม่พึ่งสีอย่างเดียว ไม่มีเส้นยึกยือ)
 */
export function BottomTabs() {
  const t = useTranslations("nav");
  const ui = useTranslations("ui");
  const pathname = usePathname();
  const hidden = useTabsHidden();
  if (hidden) return null;

  return (
    <nav aria-label={t("label")} className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper">
      <div className="mx-auto max-w-120 px-2 pt-2 pb-2.5">
        <ul className="m-0 grid list-none grid-cols-4 gap-1 p-0">
          {TABS.map(({ href, key, icon }) => {
            const active = isTabActive(pathname, href);
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={t(key)}
                  className={cx(
                    "relative flex h-full min-h-13 min-w-0 flex-col items-center justify-center gap-0.5 rounded-hand px-0.5 pt-1.5 pb-2.5 text-caption no-underline transition-colors duration-150",
                    active ? "bg-paper-2 font-medium text-ink" : "font-normal text-ink-3",
                  )}
                >
                  <Icon name={icon} size={22} strokeWidth={active ? 2.2 : 1.75} />
                  {/* บรรทัดเดียวเสมอ แม้ซูมตัวอักษร 200% — ชื่อเต็มอยู่ใน aria-label */}
                  <span className="block max-w-full truncate whitespace-nowrap">{t(key)}</span>
                  {active ? <div aria-hidden="true" data-active-indicator className="absolute bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-ink" /> : null}
                  <TabPendingPill label={ui("loading")} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
