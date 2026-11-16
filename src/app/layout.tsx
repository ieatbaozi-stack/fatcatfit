import type { Metadata, Viewport } from "next";
import { Gaegu, Noto_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { BottomTabs } from "@/components/nav/bottom-tabs";
import { themeInitScript } from "@/components/theme/theme";
import "./globals.css";

// ฟอนต์ self-host ตอน build (next/font) — ไม่เรียก CDN ตอนใช้งาน ใช้ออฟไลน์ได้
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500"],
  variable: "--font-noto-sans-thai",
  display: "swap",
});

// Gaegu Light: คำเด่นอังกฤษสั้นๆ เท่านั้น
const gaegu = Gaegu({
  subsets: ["latin"],
  weight: "300",
  variable: "--font-gaegu",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("title"), description: t("description") };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // ให้ env(safe-area-inset-*) ทำงานบน iPhone
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("a11y");

  return (
    <html lang={locale} suppressHydrationWarning className={`${notoSansThai.variable} ${gaegu.variable}`}>
      <head>
        {/* ตั้ง data-theme ก่อน paint กันกะพริบ */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only rounded-hand border-draw border-ink bg-paper px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-5 focus:z-20"
          >
            {t("skipToContent")}
          </a>
          <div className="mx-auto flex min-h-dvh w-full max-w-120 flex-col px-5">
            <main id="main" className="flex-1 pt-8 pb-32">
              {children}
            </main>
          </div>
          <BottomTabs />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
