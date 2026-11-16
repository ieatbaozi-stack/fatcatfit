"use client";
// ลงทะเบียน service worker — Lead ใส่ <ServiceWorkerRegister /> ไว้ใน <body> ของ src/app/layout.tsx
import { useEffect } from "react";
import { PAGE_LANG_MESSAGE, SKIP_WAITING_MESSAGE, SW_SCOPE, SW_URL } from "./messages";

type SwContainer = Pick<ServiceWorkerContainer, "register">;

/**
 * ลงทะเบียน SW และให้รุ่นที่รออยู่ (ดาวน์โหลดไว้ตั้งแต่การเปิดครั้งก่อน) activate ทันทีตอนเปิดแอป
 * ก่อนผู้ใช้เริ่มจด — ไม่สลับรุ่นกลางการใช้งาน (ADR 0004 ข้อ 1)
 * ไม่โยน error: ลงทะเบียนล้มแล้วแอปยังทำงานต่อได้แบบไม่มีออฟไลน์
 * คืนค่า registration หรือ null ถ้าไม่รองรับ/ล้ม
 */
export async function registerServiceWorker(
  container: SwContainer | undefined,
  isProduction: boolean,
): Promise<ServiceWorkerRegistration | null> {
  if (!isProduction || !container) return null;
  try {
    const registration = await container.register(SW_URL, {
      scope: SW_SCOPE,
      // ตรวจไฟล์ sw.js กับเครือข่ายทุกครั้ง ไม่ใช้ HTTP cache → รุ่นใหม่ถูกพบตั้งแต่การเปิดครั้งแรกหลัง deploy
      updateViaCache: "none",
    });
    // รุ่นที่ดาวน์โหลดไว้ตั้งแต่การเปิดครั้งก่อน → activate ตอนนี้ (ยังไม่มีอะไรให้สลับกลางคัน)
    registration.waiting?.postMessage({ type: SKIP_WAITING_MESSAGE });
    // register() ด้วย URL เดิมไม่ตรวจหารุ่นใหม่ (W3C Service Workers, Register ขั้น 5) และใน Chrome 158
    // การ navigate ไม่ได้ทำให้พบรุ่นใหม่ทันที → สั่งตรวจเองทุกครั้งที่เปิดแอป รุ่นที่พบจะรอถึงการเปิดครั้งถัดไป
    registration.update().catch(() => {});
    return registration;
  } catch (error) {
    console.warn("[pwa] service worker registration failed", error);
    return null;
  }
}

/**
 * แจ้งภาษาปัจจุบันของหน้า (`<html lang>`) ให้ SW ที่ active — SW ล้างหน้าที่ cache เป็นภาษาอื่นแล้วดึงใหม่
 * จำเป็นเพราะการเปลี่ยนภาษาแบบ router.refresh() เป็น RSC request ซึ่ง SW ไม่ cache จึงไม่รู้ว่าภาษาเปลี่ยน
 */
export function reportPageLang(registration: Pick<ServiceWorkerRegistration, "active"> | null, lang: string): void {
  if (!registration?.active || !lang) return;
  registration.active.postMessage({ type: PAGE_LANG_MESSAGE, lang });
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    const container = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    const html = document.documentElement;
    let registration: ServiceWorkerRegistration | null = null;
    // แอปที่ติดตั้งบนมือถือมักถูกปลุกกลับมาแทนการเปิดใหม่ → ตรวจหารุ่นใหม่เมื่อกลับมาที่หน้าจอ
    // (รุ่นที่พบจะรอจนเปิดแอปครั้งถัดไป ไม่ activate กลางการใช้งาน)
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    const langObserver = new MutationObserver(() => reportPageLang(registration, html.lang));
    void registerServiceWorker(container, process.env.NODE_ENV === "production").then((r) => {
      registration = r;
      if (!r) return;
      reportPageLang(r, html.lang);
      langObserver.observe(html, { attributes: true, attributeFilter: ["lang"] });
    });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      langObserver.disconnect();
    };
  }, []);
  return null;
}
