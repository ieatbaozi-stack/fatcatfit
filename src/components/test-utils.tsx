import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import th from "../../messages/th.json";

const MESSAGES = { th, en } as const;

/** render พร้อม next-intl (ค่าเริ่ม th) สำหรับเทสต์ component */
export function renderWithIntl(ui: ReactElement, locale: "th" | "en" = "th") {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );
}
