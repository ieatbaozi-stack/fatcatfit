# ADR 0006 — การพาไปจอที่ถูกตามสถานะบัญชี และจอยินดีต้อนรับตอนออฟไลน์

- สถานะ: **ยอมรับ** (boss อนุมัติ `R1_AUTH_CONTRACT.md` 2026-11-18 ข้อ D1–D4 รวม D3 รับทราบการเปลี่ยน UX ของ "ฉัน / ตั้งค่า" · โค้ดใช้งานแล้วใน R1) · วันที่ 2026-11-18 · ผู้เขียน: architect · **แก้ไข 2026-11-20**: ข้อยกเว้นหน้า `/admin/**` ตาม [ADR 0007](0007-admin-invites.md)
- ขึ้นกับ: ADR 0002 ข้อ 2, 6, 7 · ADR 0004 ข้อ 8 · ADR 0005 กติกา 1–2 และแก้ไขเพิ่มเติม 2026-11-18
- ฐานข้อเท็จจริง (เปิดดู 2026-11-18): **[โค้ด]** Next 16.4.6 ใน `node_modules/next/dist` · better-auth 1.7.25 ใน `node_modules/better-auth/dist` · **[ทางการ]** [Next — Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating) (lastUpdated 2026-11-06) · [Vercel — Runtime Logs](https://vercel.com/docs/logs/runtime) (last_updated 2026-08-28)

## บริบท

- ต้องพาผู้ใช้ไปจอที่ถูก: ไม่ล็อกอิน → ยินดีต้อนรับ · ยังไม่ยินยอม (ประกาศเวอร์ชันปัจจุบัน) → ยินยอม · ยังไม่กรอกแบบสอบถาม → แบบสอบถาม · ครบ → หน้าหลัก
- SW เก็บเฉพาะ 200 ที่ไม่ redirect (`isCacheableResponse`) · หลังออกจากระบบ `clearUserCaches()` ลบ `fcf-pages-v1` แล้วไม่มีหน้าไหนให้ถอย → เปิดแอปตอนออฟไลน์ได้ `503 Offline` ล้วน (ADR 0005 กติกา 2) · contract เกณฑ์ 13 ต้องได้จอยินดีต้อนรับ ปุ่มปิด "ต้องต่อเน็ตเพื่อเข้าสู่ระบบ" + แมว #24
- กติกาที่ต้องคง: HTML ห้ามมีข้อมูลส่วนตัว render เหมือนกันทุกสถานะ (ADR 0005 กติกา 1) · redirect ฝั่งเซิร์ฟเวอร์ทำได้แต่ห้ามเป็นด่านเดียว · การกั้นข้อมูลจริงอยู่ที่ API (ADR 0002 ข้อ 6–7)
- ข้อเท็จจริงจาก source ของ Next 16.4.6 ที่บังคับการออกแบบ:
  - `redirect()` ที่โยนนอก Suspense → ตอบ **HTTP 307 + `Location`** (`server/app-render/app-render.js` บรรทัด 2511–2522) · ถ้าโยน**หลังเริ่ม stream** (ใน Suspense/`loading.tsx`) → ตอบ **200 + `<meta http-equiv="refresh">`** (`make-get-server-inserted-html.js` บรรทัด 54–60) ซึ่ง SW **จะเก็บไว้เป็นหน้า**
  - เมื่อ SW เสิร์ฟ HTML ของหน้าอื่นแทน router ใช้ URL ของเบราว์เซอร์เป็น `canonicalUrl` แต่ใช้ tree ของ HTML ที่ได้ (`client/components/router-reducer/create-initial-router-state.js` บรรทัด 28–30) → `usePathname()` ไม่บอกว่าจอที่เห็นคือจออะไร
  - `history.replaceState` ของเบราว์เซอร์รวมเข้ากับ router ของ Next (เอกสาร Linking and Navigating)
- better-auth: `getSessionCookie(headers)` จาก `better-auth/cookies` อ่าน cookie session (รวม prefix `__Secure-`) โดยไม่แตะฐานข้อมูล (`dist/cookies/index.mjs` บรรทัด 264–273)
- Vercel Runtime Logs เก็บ "Search Params" ของ request (เอกสาร Runtime Logs) → `?invite=<โค้ด>` จะอยู่ใน log ขัดเกณฑ์ 12

## ทางเลือกที่พิจารณา

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| ก. path คงที่ `/welcome` ใน `OFFLINE_PAGES` + SW ถอยไปหน้านี้ · สถานะทั้งหมดตรวจฝั่งเซิร์ฟเวอร์ (redirect) | ไม่มีจอผิดกะพริบตอนออนไลน์ | ตรวจ consent/แบบสอบถามทุก navigation = query ฐานข้อมูลทุกหน้า · หน้าที่ redirect ไม่ถูกเก็บ ผู้ใช้ที่ยังไม่กรอกแบบสอบถามไม่มีหน้าไหนใช้ออฟไลน์ · ตอนออฟไลน์ไม่มีใครตรวจ (ขัดกติกา 1 "ห้ามเป็นด่านเดียว") |
| ข. ตรวจฝั่งไคลเอนต์อย่างเดียว ทุกหน้าไม่ redirect | ทุกหน้าเก็บได้ทุกสถานะ · ไม่ต้องแก้ fallback ของ SW | คนไม่ล็อกอินเปิด `/` ออนไลน์เห็นหน้าหลักแวบก่อนเด้ง · ทุกการเปิดแอปของคนไม่ล็อกอินต้องรอ `/api/me` ก่อนรู้ว่าอยู่ผิดจอ |
| **ค. ผสม (เลือก)**: เซิร์ฟเวอร์ตรวจแค่ "มี cookie session ไหม" แล้ว 307 · ไคลเอนต์ตรวจสถานะจริงและจัดการออฟไลน์ · SW ถอยไป `/welcome` | ไม่กะพริบในกรณีที่พบบ่อยที่สุด (ไม่มี cookie) · เซิร์ฟเวอร์ไม่ query ฐานข้อมูลตอนเปิดหน้า · ออฟไลน์มีด่านฝั่งไคลเอนต์เสมอ | 3 ชั้นต้องสอดคล้องกัน · หลังออกจากระบบ SW ดึงแท็บแล้วได้ redirect ทิ้งทุกรอบ (เสียคำขอเล็กน้อย) |
| ค′. เหมือน ค แต่ตรวจ cookie ใน `src/proxy.ts` | 307 แน่นอนไม่ขึ้นกับ Suspense | `src/proxy.ts` ไม่อยู่ในขอบเขตไฟล์ของใครใน contract · รันทุก request ต้องตั้ง matcher — ใช้เป็นทางถอยถ้าเทสต์ 307 ของ ค ไม่ผ่าน (Lead มอบไฟล์ใหม่) |

## การตัดสินใจ

### 1. path ของจอ (ตัดสินแล้ว — `OFFLINE_PAGES` และ cache อ้างถึง)

| path | ชนิด (`kind`) | เซิร์ฟเวอร์ตรวจ cookie | ใน `OFFLINE_PAGES` |
|---|---|---|---|
| `/welcome` — โค้ดเชิญ · Google · "ใช้อีเมลแทน" → อีเมล → OTP เป็น**ขั้นในหน้าเดียว** (ไม่มี path ย่อย) · แบบไม่มี Google ของ iPhone ใช้หน้านี้ด้วย flag | `public` | **ไม่** — HTML เหมือนกันทุกสถานะ เก็บได้เสมอ | ใช่ |
| `/privacy` ประกาศความเป็นส่วนตัว | `open` (ไม่มีด่านทั้งสองทาง) | ไม่ | ไม่ |
| `/consent` · `/onboarding` (2 ขั้นในหน้าเดียว) | `setup` | ใช่ | ไม่ (ต้องออนไลน์อยู่แล้ว) |
| `/` `/history` `/progress` `/me` (+ หน้าใหม่ของแอปในอนาคต) | `app` | ใช่ | ใช่ (เดิม) |
| `/admin/invites` (R1.5 · กลุ่ม `(admin)` ไม่มีแถบล่าง · **ข้อยกเว้น** — ADR 0007 ข้อ 4–5) | `app` | ใช่ + หน้าเรียก `requireAdmin()` (query DB) → ไม่ผ่าน `notFound()` | **ไม่** และ SW ไม่เก็บทุก path ใต้ `/admin` |
| `/styleguide`, not-found, error | `open` | ไม่ | ไม่ |

- **ลิงก์เชิญ = `/welcome#invite=XXXX-XXXX`** (fragment ไม่ถูกส่งถึงเซิร์ฟเวอร์ → ไม่ลง log ของ Vercel และไม่เป็น key ของ cache) · หน้าอ่าน hash ฝั่งไคลเอนต์ เติมช่อง แล้ว `history.replaceState` ลบออก · server component ห้ามรับโค้ดเชิญทาง URL · `scripts/invite.ts` พิมพ์ลิงก์รูปแบบนี้
- Google: `callbackURL: "/"` · `errorCallbackURL: "/welcome"` (Better Auth ต่อ `?error=` — ไม่ใช่ความลับ) · หลังยืนยัน OTP สำเร็จ: `location.replace("/")` (โหลดเต็มหน้า ให้ SW เก็บหน้าในสถานะล็อกอิน)

### 2. ใครตรวจอะไรที่ไหน

| ชั้น | ตรวจ | ผล | ไฟล์ |
|---|---|---|---|
| layout ของกลุ่ม `(app)` `(setup)` และ `(admin)` (R1.5) (server) | `hasSessionCookie(await headers())` — มี cookie หรือไม่ **ไม่ตรวจความถูกต้อง ไม่ query DB** | ไม่มี → `redirect("/welcome")` · มี → render ตามปกติ (ไม่อ่านอะไรจาก session) | `src/app/(app)/layout.tsx` `src/app/(setup)/layout.tsx` `src/app/(admin)/layout.tsx` · helper `src/lib/auth/session-cookie.ts` |
| `AuthGate` (client, ใน layout ของทุกกลุ่มยกเว้น `open`) รับ `kind` เป็น prop จาก layout — **ห้ามใช้ `usePathname()` ตัดสินว่าเป็นจออะไร** | `GET /api/me` ตอนเปิดหน้า (โหลดเต็มหน้า) และเมื่อกลับมาออนไลน์ | ตามตารางข้อ 3 | `src/components/auth/**` |
| API | `requireUser()` / `requireConsent()` | ด่านจริงของข้อมูล (ADR 0002 ข้อ 6) | `src/lib/auth/**`, `src/app/api/**` |
| SW | ไม่ตรวจสถานะ · เก็บ/ถอยตามข้อ 4 | — | `src/pwa/**` |

ห้ามมี `loading.tsx` หรือ `<Suspense>` ครอบ layout ที่ redirect (เช่น `src/app/loading.tsx`) — จะทำให้ได้ 200 + meta refresh ซึ่ง SW เก็บ · เทสต์ข้อ 6 จับ

**ข้อยกเว้นหน้า `/admin/**` (R1.5 · ADR 0007)**: หน้าแอดมินเป็นหน้าเดียวที่ query DB ตอน render (`requireAdmin()` → `notFound()`) และ HTML ต่างกันตามสิทธิ์ (หน้า vs 404) — ยอมได้เพราะ (1) SW ไม่เก็บ path ใต้ `/admin` เลย จึงไม่มี HTML ของสถานะหนึ่งค้างไปเสิร์ฟอีกสถานะ (2) HTML ไม่มีข้อมูลโค้ด/รายการ (โหลดจาก API) (3) ด่านจริงยังเป็น `requireAdmin()` ที่ API · หน้าอยู่กลุ่มของตัวเอง `(admin)` (layout ตรวจ cookie แบบเดียวกับ `(app)` · `AuthGate kind="app"` · **ไม่มีแถบล่าง**) เพราะ Next 16.4.6 วาด 404 จาก `notFound()` ภายใน layout ของ segment — ใต้ `(app)` ผู้ใช้ทั่วไปจะเห็นแถบล่างในหน้า 404 (ADR 0007 ข้อ 4) · ห้ามมี `loading.tsx`/`<Suspense>`/`not-found.tsx` ใต้ `(admin)` หรือ `admin/` · หน้าอื่นทั้งหมดยังอยู่ใต้กติกาเดิม

### 3. ตารางตัดสินของ `AuthGate` (ฟังก์ชันบริสุทธิ์ `decideRoute(kind, net, me, hint)` + unit test ครบทุกช่อง)

`GET /api/me`: `401` = ไม่ล็อกอิน · `200 { state: "consent_required" | "onboarding_required" | "ready", user: {...}, isAdmin }` (`isAdmin` ตั้งแต่ R1.5 — ใช้แสดงแถวทางเข้าหน้าแอดมินเท่านั้น ไม่ใช่สิทธิ์ · `decideRoute` ไม่อ่าน) · `Cache-Control: no-store`

| ผล `/api/me` | `public` (`/welcome`) | `setup` | `app` |
|---|---|---|---|
| 401 | อยู่ · ล้าง hint `fcf:auth` | ไป `/welcome` · ล้าง hint | ไป `/welcome` · ล้าง hint |
| `consent_required` | ไป `/consent` | อยู่ถ้าเป็น `/consent` ไม่งั้นไป `/consent` | ไป `/consent` |
| `onboarding_required` | ไป `/onboarding` | อยู่ถ้าเป็น `/onboarding` ไม่งั้นไป `/onboarding` | ไป `/onboarding` |
| `ready` | ไป `/` · ตั้ง hint | ไป `/` · ตั้ง hint | อยู่ · ตั้ง hint |
| 5xx / ตอบไม่ได้ทั้งที่ออนไลน์ | อยู่ | อยู่ + จอผิดพลาด #23 ลองใหม่ | hint `ready` → อยู่ · ไม่มี → จอผิดพลาด #23 |
| **ออฟไลน์** (ตัวตรวจเน็ตของ pwa-offline หรือ fetch reject) | อยู่ แสดงสถานะออฟไลน์ (ปุ่มปิด + #24) | อยู่ ปุ่มส่งปิด | hint `ready` → แสดงหน้า · ไม่มี → **แสดงจอยินดีต้อนรับแบบออฟไลน์แทนเนื้อหาในที่เดิม** |

- "ไป X" = `router.replace(X)` เฉพาะเมื่อออนไลน์และได้ผลชี้ขาด (401 หรือ 200) · **ออฟไลน์ไม่เปลี่ยนหน้าเด็ดขาด** (กันวน: URL ที่ไม่มีสำเนาอาจถูกถอยไปหน้าอื่น)
- จอยินดีต้อนรับแบบออฟไลน์เป็น component เดียวกับสถานะออฟไลน์ของ `/welcome` → เกณฑ์ 13 ผ่านไม่ว่า SW ถอยไปหน้าไหน
- ระหว่างรอ `/api/me` แสดงเนื้อหาไปก่อน (HTML ไม่มีข้อมูลส่วนตัว) · ข้อมูลของผู้ใช้ (เช่นอีเมลในหน้า "ฉัน") โหลดจาก `/api/me` ฝั่งไคลเอนต์เท่านั้น
- hint ใน `localStorage` (ไม่ใช่ข้อมูลส่วนตัว ไม่ใช่สิทธิ์): `fcf:auth` = `"ready"` · `fcf:known-device` = `"1"` (ใช้ซ่อนช่องโค้ดเชิญตาม UX E1 ข้อ 4 · ล้างเฉพาะตอนลบบัญชี) · R3 ย้ายเข้า IndexedDB `fcf:device` ได้ (แก้ง่าย)

### 4. service worker (ผลต่อ ADR 0005)

- `OFFLINE_PAGES = ["/", "/history", "/progress", "/me", "/welcome"]` · เทสต์เปลี่ยนจาก "ตรงกับแถบล่าง" เป็น "แถบล่างทุกแท็บอยู่ในรายการ + มี `/welcome`"
- ถอยเมื่อเครือข่ายล้ม: สำเนาของ URL นั้น → `/` → **`/welcome`** → `503 Offline`
- **ไม่เก็บ navigation ที่ URL มี query** (เช่น `/welcome?error=…`) — URL เดียวกันไม่มี query ถูกเก็บแทนเมื่อเปิดครั้งถัดไป
- **ไม่เก็บ `/admin` และทุก path ใต้ `/admin/`** (R1.5): `isStorablePageUrl()` คืน false · ไม่อยู่ใน `pagesToStage` · เปิดตอนออฟไลน์แบบโหลดเต็มหน้าได้ fallback ตามลำดับเดิม (`/` → `/welcome` → 503) — frontend ปิดแถวทางเข้าตอนออฟไลน์ (ADR 0007 ข้อ 5)
- `fetchPage` ของ SW ใช้ `redirect: "manual"` (ไม่ตามไป render `/welcome` ซ้ำ 4 รอบเมื่อออกจากระบบแล้ว) · ผลเหมือนเดิม: redirect ไม่ถูกเก็บ
- หลังออกจากระบบ: แท็บ `app` ถูก redirect → ไม่ถูกเก็บ · `/welcome` ถูกเก็บ → เปิดแอปออฟไลน์ได้จอยินดีต้อนรับ (แทน 503) · ก่อนล็อกอินครั้งแรก: SW ติดตั้งจาก `/welcome` แล้วเก็บ `/welcome` ทันที
- ถ้ามีการดึงหน้าที่ค้างอยู่ด้วย cookie เดิมเขียน `/` กลับหลังล้าง cache: ไม่เป็นปัญหา (HTML ไม่มีข้อมูลส่วนตัว และ hint ถูกล้างแล้ว → ออฟไลน์ได้จอยินดีต้อนรับในที่เดิม)

### 5. ออกจากระบบ / ลบบัญชี (ลำดับฝั่งไคลเอนต์ · ต้องออนไลน์)

1. ออกจากระบบ: `await authClient.signOut()` ลบบัญชี: `await fetch("DELETE /api/me")` — ล้มแล้ว**หยุด ไม่ล้างอะไร**
2. `await resetDeviceAfterSignOut({ accountDeleted })` (pwa-offline): `clearUserCaches()` + ล้าง `fcf:auth` (+ `fcf:known-device` เมื่อลบบัญชี) · R3 เพิ่มการลบฐาน IndexedDB ที่ฟังก์ชันนี้
3. `location.replace("/welcome")` (โหลดเต็มหน้า: ล้าง state ในหน่วยความจำ + SW เก็บ `/welcome` และเติมแท็บตามข้อ 4)

### 6. เกณฑ์ทดสอบ

| # | เทสต์ | ระดับ / เจ้าของ |
|---|---|---|
| 1 | ไม่มี cookie: `GET /` `/history` `/progress` `/me` `/consent` `/onboarding` (ไม่ตาม redirect) → 307 `Location: /welcome` · `GET /welcome` → 200 ทั้งมีและไม่มี cookie | e2e / qa-test |
| 2 | ทุกช่องของตารางข้อ 3 | unit / frontend |
| 3 | เกณฑ์ 13: context ใหม่ เปิด `/welcome` ออนไลน์ → ออฟไลน์ → เปิด `/` → เห็นปุ่มปิด "ต้องต่อเน็ตเพื่อเข้าสู่ระบบ" + แมว #24 ไม่มีข้อความ `Offline` · ทำซ้ำหลังล็อกอิน → ออกจากระบบ → ออฟไลน์ | e2e / qa-test |
| 4 | ล็อกอินครบ → ออฟไลน์ → เปิดทุกแท็บได้หน้าแอป · ยังไม่กรอกแบบสอบถาม → ออฟไลน์เปิด `/` ได้จอยินดีต้อนรับแบบออฟไลน์ ไม่วน | e2e / qa-test |
| 5 | ใน `fcf-pages-v1` ทุกสถานะ: ไม่มี key ที่มี `?` หรือ `#` · ไม่มีเนื้อหา `__next-page-redirect` · ไม่มีอีเมล/ชื่อ/โค้ดเชิญ | e2e / qa-test + security-privacy |
| 6 | fallback `/` → `/welcome` → 503 · ไม่เก็บ URL ที่มี query · `OFFLINE_PAGES` | unit `strategy.test.ts` / pwa-offline · สคริปต์ S5 ครบ 3 phase |
| 7 | `hasSessionCookie` รับทั้งชื่อมีและไม่มี `__Secure-` · `GET /api/me` ทั้ง 4 สถานะ + `no-store` | unit / platform |
| 8 | ลิงก์ `#invite=` เติมช่องแล้ว URL ไม่มี hash · ไม่มีคำขอใดที่มีโค้ดเชิญใน URL | e2e / qa-test |

## งานของแต่ละบทบาท (ตามขอบเขตไฟล์ใน contract)

- **platform**: `src/lib/auth/session-cookie.ts` (`hasSessionCookie` — ห่อ `getSessionCookie` ของ `better-auth/cookies` ไม่ import db) · `GET /api/me` ตามรูปข้อ 3 · `DELETE /api/me` · `scripts/invite.ts` พิมพ์ลิงก์ `/welcome#invite=` · เทสต์ 7
- **frontend**: ย้ายหน้าเข้า route group `(public)` `(setup)` `(app)` (URL ไม่เปลี่ยน) · `BottomTabs` ย้ายไป layout `(app)` · root layout คง `<ServiceWorkerRegister />` · layout ที่ redirect · `AuthGate` + `decideRoute` + จอยินดีต้อนรับแบบออฟไลน์ · อ่าน/ลบ `#invite=` · flow ข้อ 5 ขั้น 1 และ 3 · เทสต์ 2
- **pwa-offline**: ข้อ 4 ทั้งหมดใน `sw.ts`/`strategy.ts` · `src/pwa/auth-hint.ts` (อ่าน/ตั้ง/ล้าง hint — frontend เรียกผ่านฟังก์ชันนี้เท่านั้น) · `resetDeviceAfterSignOut()` · ตัวตรวจเน็ตตัวเดียว (`useOnline()`) ที่ AuthGate แถบเน็ตหลุด และแถวภาษาใช้ร่วม · เทสต์ 6
- **qa-test**: เทสต์ 1, 3, 4, 5, 8 · **security-privacy**: เทสต์ 5 + ตรวจว่า layout ไม่อ่านข้อมูลจาก session

## ผลที่ตามมา

- ง่ายขึ้น: เกณฑ์ 13 ผ่านได้สองทาง (SW ถอยไป `/welcome` หรือ AuthGate แสดงในที่เดิม) · หน้าไม่ query DB ตอน render · โค้ดเชิญไม่ผ่าน URL ไปเซิร์ฟเวอร์
- ยากขึ้น: สถานะอยู่ 3 ชั้น ต้องคุมด้วยตารางข้อ 3 · ผู้ใช้ที่มี cookie แต่ยังไม่ยินยอมเห็นหน้าหลักแวบก่อนไป `/consent` (ครั้งเดียวตอนสมัคร)
- ต้องทำตาม: หน้าใหม่ของแอปอยู่ในกลุ่ม `(app)` (หน้าแอดมินอยู่ `(admin)` — ADR 0007) · หน้าใหม่ที่ต้องเปิดก่อนล็อกอินอยู่ใน `(public)` และห้าม redirect ฝั่งเซิร์ฟเวอร์ · ห้ามเพิ่ม `loading.tsx` ที่ root

## สิ่งที่ Lead ต้องรับทราบ

- contract/UX เขียน `?invite=` — ADR นี้เปลี่ยนเป็น `#invite=` เพื่อให้เกณฑ์ 12 (ไม่มีโค้ดเชิญใน log) ผ่านได้จริง ผู้ใช้เห็นเหมือนเดิม · ux-brand แก้ UX E1 ข้อ 1 ให้ตรง

## สิ่งที่ยังไม่รู้

| เรื่อง | ใคร | เมื่อไร |
|---|---|---|
| Serwist `NetworkFirst` ส่งคำตอบ redirect (opaqueredirect) ของ navigation ต่อให้เบราว์เซอร์ถูกต้องทั้ง Chrome และ iOS — อนุมานจากสเปก ยังไม่ทดสอบ | qa-test (เทสต์ 1 ขณะ SW คุม) · boss เครื่องจริง | R1 ขั้น 5–6 |
| iOS standalone เสิร์ฟ `/welcome` จาก SW ที่ URL `/` ตอนเครื่องบิน | boss + qa-test | R1 เกณฑ์ 16 |
| iOS ลบ `localStorage` ของแอปที่ติดตั้งเมื่อไม่ได้ใช้นานหรือไม่ (ถ้าลบ: ผู้ใช้ที่ล็อกอินอยู่เห็นจอยินดีต้อนรับตอนออฟไลน์ — ปลอดภัยแต่ใช้ไม่ได้) | researcher | ก่อน R3 |

## บันทึกการแก้ไข

| วันที่ | สิ่งที่แก้ | เหตุผล | เปลี่ยนการตัดสินใจไหม |
|---|---|---|---|
| 2026-11-19 | บรรทัดสถานะ: เสนอ → **ยอมรับ** · ไม่แก้เนื้อหา | boss อนุมัติ `R1_AUTH_CONTRACT.md` 2026-11-18 (D1–D4, D3 รับทราบการเปลี่ยน UX ของ "ฉัน / ตั้งค่า") และโค้ดใช้งานแล้วใน R1 · secretary ตรวจตามหน้าที่ 2 · ตาราง "สิ่งที่ยังไม่รู้" ยังไม่ปิดแถวใด (รอ Lead/architect) | ไม่ |
| 2026-11-20 | ข้อ 1 แถว `/admin/invites` · ข้อ 2 ข้อยกเว้นหน้า `/admin/**` (query DB ตอน render + `notFound()`) · ข้อ 4 SW ไม่เก็บ `/admin/**` | R1.5 contract ที่ boss อนุมัติ 2026-11-20 · ADR 0007 | ใช่ บางส่วน — ข้อยกเว้นเฉพาะ `/admin/**` · กติกาเดิมของหน้าอื่นไม่เปลี่ยน |
| 2026-11-20 | ข้อ 1 แถว `/admin/invites` + ข้อ 2 ตารางชั้น layout และข้อยกเว้น: หน้าแอดมินอยู่กลุ่ม `(admin)` (ไม่ใช่ `(app)`) ไม่มีแถบล่าง · ห้าม loading/Suspense/not-found ใต้ `(admin)` | qa-test รอบแรก: 404 ใต้ `(app)` เห็นแถบล่าง · source Next 16.4.6 (ADR 0007 ข้อ 4) · commit 96449fa | ไม่ — ด่าน cookie และ `kind` เดิม ที่อยู่ไฟล์เปลี่ยน |
| 2026-11-23 | ข้อ 5 ออกจากระบบ: เพิ่มขั้นถามยืนยันก่อนเรียก `signOut` (ตามที่ boss ขอ) · ลำดับฝั่งไคลเอนต์และการล้างข้อมูลเหมือนเดิม | CR2 (`CR2_SIGNOUT_CONFIRM_CONTRACT.md`) | ไม่ |
