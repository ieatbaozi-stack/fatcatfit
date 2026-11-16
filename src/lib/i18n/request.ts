import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "./config";

// next-intl แบบไม่มี locale ใน URL: อ่านภาษาจาก cookie ทุก request
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
  };
});
