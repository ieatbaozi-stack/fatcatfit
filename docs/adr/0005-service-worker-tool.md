# ADR 0005 — เครื่องมือ service worker: `@serwist/turbopack` (ทาง A) และกติกา cache ที่ตามมา

- สถานะ: **เสนอ — รอ boss รับทราบ** · วันที่ 2026-11-17 · ผู้เขียน: architect
- ฐานข้อเท็จจริง: ผล spike S5 ของ pwa-offline (รายงานต่อ Lead 2026-11-17) · สคริปต์ตรวจ `src/pwa/e2e/s5-offline-check.ts` · โค้ดจริง `src/pwa/**`, `src/app/serwist/[path]/route.ts`, `next.config.ts` · source ของแพ็กเกจที่ติดตั้ง (`node_modules/@serwist/turbopack/src/*`, `node_modules/next/dist/...`) — **ไม่ใช่เอกสารทางการ** ระบุไว้ทุกจุดที่อ้าง
- เอกสารที่ architect เปิด 2026-11-17: [Serwist — Next.js + Turbopack](https://serwist.pages.dev/docs/next/turbo) · [Next.js — Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy) (หน้าอัปเดต 2026-03-20)
- ขึ้นกับ / ทำให้สมบูรณ์: ADR 0004 ข้อ 1 · เกี่ยวกับ ADR 0002 ข้อ 7 (ออกจากระบบ)
- **แก้ไขเพิ่มเติม 2026-11-18** (หลังปิด R0 · v0.1.0): ดูหัวข้อ "แก้ไขเพิ่มเติม 2026-11-18" ท้ายไฟล์ — ส่วนบนคงไว้ตามที่เขียน 2026-11-17 ตรงไหนขัดกันให้ยึดส่วนท้าย

## บริบท

ADR 0004 ข้อ 1 ให้ลอง A → B → C แล้วใช้ตัวแรกที่ผ่านเกณฑ์ 5 ข้อ · ข้อจำกัดที่พบระหว่าง R0:
- Next 16.4.6 ใช้ Turbopack · หน้าเอกสาร Serwist มีแต่คอมเมนต์ "Serwist 10 and newer will only support Next.js 15.0.0 and above" ไม่ปักรุ่น · pwa-offline รายงานว่า npm `latest` = 9.5.14, `preview` = 10.0.0-preview.14 และ 9.5.14 ทำตามหน้าเอกสารนั้นได้
- S4: next-intl อ่านภาษาจาก cookie `NEXT_LOCALE` ตอน render → **ทุกหน้าเป็น dynamic และ HTML ของ URL เดียวกันต่างกันตามภาษา** · SW อ่าน cookie ของ request ไม่ได้
- HTML ที่ Next ส่งมี `no-store` แต่เราตั้งใจเก็บไว้ใช้ตอนออฟไลน์ → อะไรที่อยู่ใน HTML ถูกเก็บในเครื่อง

## ผลเทียบเกณฑ์ (ทาง A เท่านั้น — ผ่านจึงไม่ได้ลอง B, C)

| # | เกณฑ์ (ADR 0004 ข้อ 1) | ผลของ A | ยืนยันด้วยอะไร | ยังต้องรอ |
|---|---|---|---|---|
| 1 | `npm run build` ผ่านบน Next 16.4.x | ผ่าน · สร้าง `/serwist/sw.js` ตอน build | build บน Windows (เครื่องพัฒนา) + Lead รันเกตซ้ำหลังรวม | build บน **Linux** (CI บน GitHub) และบน **Vercel** — ยังไม่มีผล ณ วันที่เขียน |
| 2 | ติดตั้งได้บน Android Chrome และ iOS Safari | ผ่านเฉพาะ Chromium | `Page.getInstallabilityErrors` = `[]` | Android จริง · iPhone จริง (contract เกณฑ์ 9) |
| 3 | เปิดออนไลน์ 1 ครั้ง → ออฟไลน์ → ปิด/เปิด → หน้าหลัก (และหน้าจด) โหลดได้ | ผ่านใน Chrome 158 headless: `/` โหลดได้ · URL ที่ไม่เคยเปิดได้ shell · `/api/health` ไม่ถูกตอบจาก cache · hydrate ไม่มี JS error | สคริปต์ S5 รันใน worktree **ก่อนรวม**: proxy จำลอง next-intl และให้ `/history` `/progress` `/me` `/styleguide` ตอบด้วยหน้า `/` · หลังรวม Lead ยืนยันเพียง "ลงทะเบียนได้ ไม่มี CSP violation" | รันซ้ำกับแอปที่รวมแล้วโดยไม่ stub หน้า · เครื่องจริง · **หน้าจดยังไม่มี (R3)** |
| 4 | deploy รุ่นใหม่ → ได้รุ่นใหม่ภายในการเปิดครั้งที่ 2 | ผ่านใน Chrome: เปิดครั้งที่ 1 ได้ HTML รุ่นใหม่ (network-first) และ SW ใหม่รอโดยไม่สลับกลางคัน · ครั้งที่ 2 SW ใหม่ active และ precache รุ่นเก่าถูกล้าง | สคริปต์ S5 (`next build` สองครั้งจำลอง deploy) | deploy จริงบน Vercel · iOS |
| 5 | `npm run dev` ยังใช้ได้ | ผ่าน · ตอน dev ไม่ลงทะเบียน SW (`register.tsx` ลงทะเบียนเฉพาะ production) | รายงาน pwa-offline + โค้ด | — |

## การตัดสินใจ

1. **ใช้ทาง A**: `@serwist/turbopack` + `serwist` ปัก `~9.5.14` (+ `esbuild` ~0.28) · route `src/app/serwist/[path]/route.ts` (`createSerwistRoute`, force-static → สร้างไฟล์ตอน build ไม่รัน esbuild ตอนผู้ใช้เรียก) · `withSerwist()` ใน `next.config.ts` · โค้ด SW อยู่ที่ `src/pwa/sw.ts` · เหตุผล: ผ่านทุกเกณฑ์ที่ทดสอบในเครื่องได้ · dev และ build ใช้ bundler เดียวกัน · มี precache ของ asset ทั้งชุด (ทาง C ไม่มี)
2. **ตัดสินแล้ว แก้ทีหลังแพง**: URL ของ SW = **`/serwist/sw.js`** scope `/` · แอปที่ติดตั้งแล้วจะตรวจ URL นี้ตลอดไป ถ้าเปลี่ยนเครื่องมือในอนาคต ต้องเสิร์ฟ SW ตัวใหม่ (หรือตัวที่ unregister ตัวเอง) ที่ URL เดิม
3. ค่าตั้งที่ต้องคงไว้ (จาก S5): `useNativeEsbuild: true` (source `index.schema.ts`: ค่าเริ่ม true เฉพาะ `win32` — ตั้งตรงๆ ให้ Linux เหมือน Windows) · `esbuildOptions.format: "iife"` (classic script) · **ไม่ใช้ `SerwistProvider`** (source `index.react.tsx`: `reloadOnOnline` ค่าเริ่ม true → reload หน้าเมื่อกลับมาออนไลน์ เสี่ยงเสียสิ่งที่กำลังจด) ใช้ `src/pwa/register.tsx` แทน · `skipWaiting: false` + หน้าเว็บส่ง `SKIP_WAITING` ตอนเปิดแอป · `clientsClaim: true` · `updateViaCache: "none"`
4. **ห้ามเปิด** `cacheComponents` และ `experimental.useOffline` ของ Next โดยไม่มี ADR ใหม่: source `@serwist/turbopack/src/index.ts` เขียนว่า "This version is for when NOT using `cacheComponents`" · `useOffline` เปลี่ยนพฤติกรรมเมื่อดึง RSC ไม่ได้จาก "ถอยไปโหลดทั้งหน้า" เป็น "รอเน็ตกลับมา" (source `fetch-server-response.js`) ซึ่งจะทำให้แตะแท็บตอนออฟไลน์ค้าง

### กลยุทธ์ cache ที่ใช้จริง

| request | การจัดการ |
|---|---|
| `/_next/static/**` | precache ตอนติดตั้ง + cache-first (`fcf-assets-v1` สำหรับที่ไม่อยู่ใน precache) |
| navigation (HTML) | network-first หมดเวลา 4 วิ → สำเนาของ URL นั้น → shell `/` → `503 Offline` (text/plain) · เก็บใน `fcf-pages-v1` |
| `/api/**` ทุก method | **ไม่มี route ใน SW** → เบราว์เซอร์ส่งเครือข่ายเอง · ออฟไลน์ = `fetch` reject |
| RSC request (header `RSC` หรือ `?_rsc`), `/serwist/*`, ต่าง origin, non-GET, อื่นๆ | ไม่แตะ |
| เงื่อนไขเก็บ | เฉพาะ 200 type basic ไม่ redirect · cache มีเลขรุ่น (`CACHE_VERSION` ใน `src/pwa/strategy.ts`) SW ใหม่ลบชื่อรุ่นเก่าตอน activate |
| วงจรรุ่น | ตอนเปิดแอปและเมื่อ `visibilitychange` → visible: `registration.update()` · SW ใหม่ติดตั้งแล้วรอ · เปิดแอปครั้งถัดไป: หน้าเว็บส่ง `SKIP_WAITING` ก่อนผู้ใช้เริ่มจด |

### เงื่อนไขที่ต้องถอย และต้นทุน

| สัญญาณ | ทำอะไร |
|---|---|
| build ล้มบน Linux/Vercel เพราะ esbuild native | ลอง `useNativeEsbuild: false` (esbuild-wasm) ก่อน · ไม่ผ่านใน 1 วันทำงาน → ทาง C |
| iPhone/Android จริงไม่ผ่านเกณฑ์ 2–4 **และสาเหตุอยู่ที่ตัวเครื่องมือ** (bundle, การลงทะเบียน) | ทาง C · ถ้าสาเหตุอยู่ที่กลยุทธ์ (เช่น iOS ไม่ใช้ HTML ที่ cache) เปลี่ยนเครื่องมือไม่ช่วย ให้แก้กลยุทธ์ |
| Next อัปรุ่นแล้ว route ของ Serwist ใช้ไม่ได้ / Serwist 10 ออก stable แล้ว 9.x ไม่ได้รับการแก้ / API เปลี่ยน | chore อัปเป็น 10 แล้วรันสคริปต์ S5 ซ้ำ · ไม่ได้ → ทาง B (`@serwist/next` + `next build --webpack`) ถ้ายังต้องการ precache · ไม่งั้นทาง C |

ต้นทุนการถอย: `strategy.ts` `register.tsx` `clear-caches.ts` `messages.ts` และเทสต์ของมันไม่ผูกกับ Serwist ใช้ต่อได้ · **B** = ลบ route + เปลี่ยน `next.config.ts`/script build, `sw.ts` ใช้ API เดิม (dev กับ build ต่าง bundler) · **C** = เขียน `sw.ts` ใหม่ด้วย Cache API ตรงๆ ประมาณ 1–2 วัน, ไม่มี precache (ออฟไลน์ได้เฉพาะ asset ที่เคยโหลด), ต้องเสิร์ฟที่ `/serwist/sw.js` ตามข้อ 2 · ทุกทาง: เพิ่ม `CACHE_VERSION` และรันสคริปต์ S5 ครบ 3 phase

## กติกาที่ตามมาสำหรับรอบถัดไป

| # | กติกา | ใคร / รอบ |
|---|---|---|
| 1 | **HTML ห้ามมีข้อมูลส่วนตัว**: หน้า render เหมือนกันไม่ว่าล็อกอินหรือไม่ (ต่างได้แค่ภาษา) · server component ห้ามอ่าน session เพื่อใส่ชื่อ อีเมล น้ำหนัก ลง HTML · ข้อมูลผู้ใช้โหลดฝั่งไคลเอนต์จาก IndexedDB / `/api/**` · redirect ฝั่งเซิร์ฟเวอร์ตามสถานะล็อกอินทำได้ (คำตอบที่ redirect ไม่ถูก cache) แต่ห้ามเป็นด่านเดียว เพราะตอนออฟไลน์ SW เสิร์ฟ HTML ที่ cache โดยไม่ถามเซิร์ฟเวอร์ → หน้าต้องตรวจสถานะล็อกอินฝั่งไคลเอนต์ด้วย · การกั้นข้อมูลจริงอยู่ที่ API | frontend, platform R1 · security-privacy ตรวจ: ล็อกอินแล้วเปิดทุกหน้า แล้วค้น `fcf-pages-v1` ว่าไม่มีอีเมล/ชื่อ |
| 2 | ออกจากระบบ/ลบบัญชี: เรียก `clearUserCaches()` (`src/pwa/clear-caches.ts`) — ลบ `fcf-pages-v*` และ `user-*` คง precache/asset · ผล: หลังออกจากระบบ เปิดแอปตอนออฟไลน์จะได้ `503 Offline` จนกว่าจะออนไลน์ (ยอมรับได้ เพราะเข้าสู่ระบบต้องออนไลน์อยู่แล้ว) | frontend R1 |
| 3 | **ภาษาใน cache**: SW ติดภาษาจาก `<html lang>` กับทุกหน้าที่เก็บ · เก็บได้ทีละภาษา (ได้หน้าภาษาใหม่ → ลบหน้าภาษาอื่นแล้วดึงใหม่) · `<ServiceWorkerRegister />` แจ้ง `<html lang>` ตอนเปิดและเมื่อเปลี่ยน · **ข้อจำกัด**: สลับภาษาตอนออฟไลน์ไม่มีผลจนกว่าจะออนไลน์ (`router.refresh()` ดึง RSC ไม่ได้ → โหลดหน้าเดิมจาก cache ภาษาเดิม — คาดจาก source ยังไม่ทดสอบ) · `<html lang>` ต้องมาจาก next-intl เสมอ ห้ามหน้าใดเขียนทับ | frontend (ควรปิดตัวสลับภาษาหรือบอกผู้ใช้เมื่อออฟไลน์ — R1 หรือ R6) |
| 4 | SW ต้องคง header ของคำตอบเดิมเมื่อเก็บ HTML (ตอนนี้คัดลอกทั้งหมด) — CSP ของหน้าที่เปิดตอนออฟไลน์มาจาก header ที่เก็บไว้ | pwa-offline ทุกครั้งที่แก้ `sw.ts` |
| 5 | header `/serwist/:path*` → `Cache-Control: no-cache, no-store, must-revalidate` (อยู่ใน `next.config.ts`) ห้ามเอาออก · `registration.update()` ตอนเปิดและตอน visible ห้ามเอาออก | ops-release, pwa-offline |
| 6 | แตะลิงก์/แท็บตอนออฟไลน์ = โหลดทั้งหน้า (RSC ไม่ถูก cache → Next ถอยไป browser navigation ตาม source) → state ในหน่วยความจำหาย · ทุกอย่างที่ต้องอยู่รอดต้องอยู่ใน IndexedDB | frontend, pwa-offline R3 |

**สิ่งที่ R3 (คิวออฟไลน์) ต้องรู้**: (ก) SW ไม่มีส่วนในคิว — outbox, sync, retry อยู่ใน `src/lib/offline` ฝั่งหน้า (iOS ไม่มี Background Sync) · (ข) `/api/**` ตอนออฟไลน์ `fetch` reject ทันที (ไม่มี 503 จาก SW) ต้องนับเป็น "เน็ตหลุด" (ลองใหม่) ไม่ใช่ปฏิเสธ · (ค) **หน้าจดต้องมี URL คงที่** (เช่น `/record` อ่านเซสชันจาก `active_session`) ห้ามใส่ id ใน path เพราะ URL ที่ไม่เคยเปิดได้ shell `/` แทน · (ง) SW ต้อง cache หน้าจด (และทุกแท็บ) ตั้งแต่ตอนติดตั้ง ไม่รอผู้ใช้เคยเปิด — ตอนนี้ install เก็บแค่ `/` · (จ) ตอน SW ใหม่ติดตั้ง (ซึ่งออนไลน์อยู่) ให้ดึงทุก URL ใน `fcf-pages-v1` ใหม่ ไม่ใช่แค่ `/` เพื่อกันหน้า HTML รุ่นเก่าอ้าง chunk ที่ precache ลบไปแล้ว (ดูสิ่งที่ยังไม่รู้)

## ผลต่อ CSP

SW คัดลอก header รวม CSP ไปกับ HTML ที่เก็บ จึงใช้ได้ทั้ง CSP ปัจจุบัน (`'unsafe-inline'`) และ CSP แบบ nonce · ถ้าใช้ nonce: HTML กับ header ที่เก็บมี nonce ตัวเดียวกันจึงยังทำงานตอนออฟไลน์ แต่ nonce ถูกใช้ซ้ำทุกครั้งที่เปิดจาก cache (ไม่ "ใหม่ทุกครั้ง" ตามที่เอกสาร Next กำหนด) — ยอมรับได้เพราะผู้โจมตีต้องฉีดเข้า HTML ที่ cache ก่อน · เอกสาร Next ระบุว่า nonce ต้อง render แบบ dynamic ทุกหน้า ซึ่งตอนนี้เป็นอยู่แล้วจาก S4 → ข้อเสนอให้ทบทวน CSP แบบ nonce ใน R1 อยู่ในรายงานถึง Lead (การตัดสินเป็นของ ops-release + security-privacy)

## ผลที่ตามมา

- ง่ายขึ้น: ออฟไลน์ได้ตั้งแต่เปิดครั้งแรก (precache) · รุ่นใหม่ไม่สลับกลางการจด · `/api/**` ไม่มีทางถูก cache โดยบังเอิญ (ไม่มี route เลย)
- ยากขึ้น: พึ่งแพ็กเกจที่เอกสารไม่ปักรุ่นและใช้ route handler เป็นทางอ้อม · HTML เป็นข้อมูลในเครื่องที่ต้องคุม (กติกา 1) · ภาษาเปลี่ยนตอนออฟไลน์ไม่ได้
- ต้องทำตาม: ทุกรอบที่แก้ `src/pwa/**` รันสคริปต์ S5 ครบ 3 phase (`first` `update` `locale`) · QA ย้ายสคริปต์เข้า `tests/e2e` เมื่อพร้อม (ตอนนี้ไม่อยู่ใน CI)

## สิ่งที่ยังไม่รู้ / ต้องทดสอบ

| เรื่อง | ใคร | เมื่อไร |
|---|---|---|
| build ผ่านบน Linux (CI) และ Vercel · `useNativeEsbuild` บน Linux · route `/serwist/sw.js` ไม่กลายเป็น function ที่ต้องมี esbuild ตอนรัน | Lead/ops (CI รันครั้งแรก) · platform (deploy) | ก่อนปิด R0 |
| เกณฑ์ 2–4 บน iPhone (16.4+ ถึงล่าสุด) และ Android จริง จากโดเมน Vercel | boss + QA | ก่อนปิด R0 (contract เกณฑ์ 9–11) |
| สคริปต์ S5 กับแอปที่รวมแล้วโดยไม่ stub หน้า · แตะแท็บตอนออฟไลน์ · สลับภาษาตอนออฟไลน์ | qa-test / pwa-offline | ก่อนปิด R0 |
| ออฟไลน์หลังอัปเดต เปิดหน้าที่ cache ไว้ก่อนอัปเดต (HTML รุ่นเก่า + precache รุ่นใหม่) — chunk ที่โหลดทีหลังอาจหาย | pwa-offline | R3 (พร้อมข้อ จ) |
| iOS standalone ใช้ HTML จาก SW เมื่อเปิดจาก Home Screen ตอนเครื่องบินจริงไหม | boss + QA | R0 เกณฑ์ 10 |
| Serwist 10 stable: รุ่น API และการรองรับ Next 16 | researcher | เมื่อออก stable |

## แก้ไขเพิ่มเติม 2026-11-18 — สิ่งที่ R0 ส่งมอบจริง

ที่มา: QA ตรวจจบ R0 (2026-11-17) พบ "แตะแท็บที่ยังไม่เคยเปิดตอนออฟไลน์ได้หน้าหลักแทน" และ "สลับภาษาตอนออฟไลน์ไม่มีผลและไม่บอกผู้ใช้" · แก้ใน PR #6 (`84409fb` pwa, `3b47bad` frontend) · ทุกข้อด้านล่างยืนยันจากโค้ดที่ v0.1.0: `src/pwa/sw.ts` `src/pwa/strategy.ts` `src/pwa/register.tsx` `src/components/theme/locale-switch.tsx` และ e2e `tests/e2e/pwa.spec.ts` (รันใน CI)

| # | เรื่อง | เดิม (2026-11-17) | ตอนนี้ (โค้ด) | ทำไม |
|---|---|---|---|---|
| 1 | หน้าที่มีตอนออฟไลน์ตั้งแต่ติดตั้ง | install เก็บแค่ `/` · แท็บที่ไม่เคยเปิดได้ shell `/` | `OFFLINE_PAGES = ["/", "/history", "/progress", "/me"]` (`strategy.ts` เทสต์ตรวจว่าตรงกับแถบล่าง) · install ดึงทุกแท็บ **+ ทุก URL ที่อยู่ใน `fcf-pages-v1` แล้ว** (`pagesToStage`) · ระหว่างใช้งาน แท็บที่ขาดถูกเติมเมื่อมี navigation ที่ cache ได้ หรือหน้าเว็บแจ้งภาษา (`planPageSync`) | QA: ผู้ใช้ใหม่เปิดแค่ `/` แล้วเน็ตหลุด แตะแท็บอื่นได้หน้าหลักทั้งที่ URL เป็นแท็บอื่น |
| 2 | วิธีเก็บ HTML ตอน install | — | **ไม่ใช่ precache ของ Serwist** (HTML ไม่อยู่ใน `__SW_MANIFEST`) · SW `fetch` เองแบบ `credentials: "same-origin"` (ได้ cookie ภาษา) หมดเวลา 10 วิ · เก็บเฉพาะ 200 ไม่ redirect · หน้าที่ดึงไม่ได้ข้าม **ไม่ทำให้ install ล้ม** | หน้าที่พังหน้าเดียวต้องไม่ขวางรุ่นที่แก้แล้ว |
| 3 | staging cache | — | install เขียนลง `fcf-pages-staging-v1` ไม่แตะ `fcf-pages-v1` · activate (`promoteStagedPages`): ภาษาเป้าหมาย = ภาษาของ cache หน้าปัจจุบัน (ว่าง → ภาษาของหน้าที่พัก) → ย้ายหน้าที่พักในภาษานั้นเข้า `fcf-pages-v1` → ลบ staging → ลบหน้าภาษาอื่น → หน้าที่เหลือ (ดึงไม่ได้ตอน install, ภาษาไม่ตรง, เปิดระหว่างรอ) ดึงใหม่เบื้องหลังหลัง activate ล้มก็คงสำเนาเดิม · asset ที่ไม่เจอใน cache ของตัวเองหาในทุก cache ก่อนล้ม (`anyCacheFallback`) · `isUserScopedCache` นับ staging เป็น cache ของผู้ใช้ด้วย (ล้างตอนออกจากระบบ) | SW เก่ายังคุมจนกว่าจะ activate และ precache ของมันไม่รู้จัก chunk รุ่นใหม่ · ทำให้ HTML ใน `fcf-pages-v1` เป็นรุ่นเดียวกับ precache ของ SW ที่คุมอยู่ (ทำ "สิ่งที่ R3 ต้องรู้" ข้อ ง และ จ แล้ว) |
| 4 | เปลี่ยนภาษา **ออฟไลน์** | ข้อจำกัดในกติกา 3 (กดได้แต่ไม่มีผล) | ตามสถานะ `navigator.onLine` (ฟัง `online`/`offline`): ชิปภาษาอื่นถูกปิด ชิปภาษาปัจจุบันยังเลือกอยู่ · ข้อความใต้ชิป `role="status"` "เปลี่ยนภาษาได้เมื่อต่อเน็ต" / "Change language when you're online" · `choose()` ตรวจ `navigator.onLine` ซ้ำ | QA: สลับตอนออฟไลน์ไม่มีผลและไม่บอกผู้ใช้ · `router.refresh()` ดึง RSC ไม่ได้ |
| 5 | เปลี่ยนภาษา **ออนไลน์** | กติกา 3 | หน้าเว็บเขียน cookie `NEXT_LOCALE` (1 ปี, `SameSite=Lax`) + `router.refresh()` (RSC ไม่ผ่าน cache ของ SW) → `<html lang>` เปลี่ยน → `MutationObserver` ใน `register.tsx` ส่ง `PAGE_LANG` ให้ SW → SW `syncPages`: **ลบหน้าภาษาอื่นทันที** แล้วดึงใหม่ทั้งหน้าที่ลบ (ทุก URL ไม่ใช่แค่แท็บ) + แท็บที่ขาด · เก็บเฉพาะหน้าที่ `<html lang>` ตรงภาษาใหม่ · **ไม่ reload หน้าในเบราว์เซอร์** — ดึงเบื้องหลังใน SW · navigation ที่ได้หน้าภาษาใหม่ทำแบบเดียวกัน (`cacheDidUpdate`) | กันได้หน้าภาษาเดิมตอนออฟไลน์หลังเปลี่ยนภาษา (e2e: เปลี่ยนภาษาออนไลน์ → ออฟไลน์ → ทั้ง 4 แท็บเป็นภาษาใหม่) |
| 6 | `/api/**` | ไม่มี route ใน SW | **ไม่เปลี่ยน** · `classifyRequest` คืน `bypass` สำหรับ `/api` และ `/api/*` ก่อนตรวจ method · `pagesToStage` กรอง `/api` ออกจากหน้าที่ดึงตอน install · e2e ตรวจว่าไม่ถูกเก็บและออฟไลน์แล้วเรียกไม่ได้ | ข้อมูลผู้ใช้ห้ามผ่าน cache ของ SW |

กติกาเดิมที่ได้รับผลกระทบ:
- **กติกา 2 (ออกจากระบบ)**: หลัง `clearUserCaches()` เปิดแอปตอนออฟไลน์ได้ `503 Offline` เหมือนเดิม · แต่เมื่อออนไลน์และมี navigation หรือหน้าเว็บแจ้งภาษา SW จะ **เติมทั้ง 4 แท็บกลับเองโดยไม่ต้องเปิด** — สิ่งที่ถูกเก็บคือ HTML ที่เซิร์ฟเวอร์ตอบให้ cookie ขณะนั้น (redirect ไม่ถูกเก็บ)
- **กติกา 1 (HTML ห้ามมีข้อมูลส่วนตัว) สำคัญขึ้น**: SW ดึงแท็บที่ผู้ใช้ไม่เคยเปิดด้วย cookie ของผู้ใช้ → ข้อมูลส่วนตัวในแท็บใดก็ตามจะลงเครื่องโดยผู้ใช้ไม่ได้เปิดดู
- **กติกา 3**: ข้อจำกัด "สลับภาษาตอนออฟไลน์ไม่มีผล" ปิดด้วย UI แล้วใน R0 (ข้อ 4) ไม่ต้องรอ R1/R6
- **หน้าใหม่ที่ต้องเปิดได้ตอนออฟไลน์** (เช่นหน้าจดของ R3): เพิ่มใน `OFFLINE_PAGES` path คงที่ไม่มี id/query · ทุกหน้าที่เพิ่ม = ดึงเพิ่ม 1 ครั้งตอน install และทุกครั้งที่เปลี่ยนภาษา

### ความเสี่ยงที่ยังเปิด

| เรื่อง | รายละเอียด | เมื่อไร |
|---|---|---|
| `fcf-assets-v1` โตเรื่อยๆ | CacheFirst ไม่มี expiration/จำกัดจำนวน · ถูกล้างเฉพาะเมื่อเพิ่ม `CACHE_VERSION` (precache ของ Serwist ล้างตัวเองด้วย `cleanupOutdatedCaches`) · กินโควตาพื้นที่เดียวกับ IndexedDB ของคิวออฟไลน์ | **เลื่อนไป R3** (พร้อมคิวออฟไลน์และการวัดพื้นที่) |
| ดึงหน้าใหม่หลัง activate ไม่ถูกรอ | `refreshInto` หลัง activate เรียกแบบ `void` นอก `waitUntil` → เบราว์เซอร์อาจหยุด SW ก่อนเสร็จ · ผลคือหน้านั้นคงสำเนาเดิม แล้วถูกเติมเมื่อหน้าเว็บแจ้งภาษาครั้งถัดไป | ยอมรับได้ ทบทวนใน R3 |
| ออนไลน์ตาม `navigator.onLine` | ต่อ Wi-Fi ที่ไม่มีเน็ตจริง → ปุ่มภาษาเปิดอยู่ กดแล้ว `router.refresh()` ล้ม (cookie เปลี่ยนแล้ว หน้ายังภาษาเดิม) · ยังไม่ทดสอบ | R3 (ใช้ตัวตรวจเน็ตเดียวกับแถบสถานะ) |
| ออฟไลน์หลังอัปเดต (แถวในตาราง "สิ่งที่ยังไม่รู้") | ลดความเสี่ยงด้วยข้อ 3 แล้ว · ตรวจด้วยสคริปต์มือ `tests/e2e/update-check.ts` และ S5 เท่านั้น **ไม่อยู่ใน CI** | R3 |

เครื่องจริง: boss รายงานผ่านเกณฑ์ 9–10 ของ R0 (ติดตั้ง ออฟไลน์ทุกแท็บ ปุ่มภาษาตอนออฟไลน์ ภาษาอังกฤษทุกแท็บตอนออฟไลน์) 2026-11-18 ไม่ได้ระบุรุ่นเครื่อง — แถว iOS/Android ใน "สิ่งที่ยังไม่รู้" ยังเปิดสำหรับรุ่นต่ำสุด (iOS 16.4 · Chrome 111)
