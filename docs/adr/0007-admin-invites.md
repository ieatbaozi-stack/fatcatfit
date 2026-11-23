# ADR 0007 — สิทธิ์แอดมินและหน้าออกโค้ดเชิญ

- สถานะ: **ยอมรับ** (boss อนุมัติ [R1_5_ADMIN_INVITES_CONTRACT.md](../../R1_5_ADMIN_INVITES_CONTRACT.md) 2026-11-20 รับ D0–D6 ตามข้อเสนอทั้งหมด) · วันที่ 2026-11-20 · ผู้เขียน: architect · **แก้ไข 2026-11-20** (หลัง QA/security รอบแรก): หน้าอยู่กลุ่ม `(admin)` · เกณฑ์ 3 ส่วนหน้า · แชร์ `{ text }` · HEAD/OPTIONS · ลบบัญชีล้างป้าย — ดูบันทึกการแก้ไข
- ขึ้นกับ: ADR 0002 ข้อ 2–3, 6–7 · ADR 0003 ข้อ 1, 3, 5 · ADR 0005 กติกา 1 · ADR 0006 ข้อ 1–4 · PRD US-1.6
- ฐานข้อเท็จจริง: **[โค้ด]** `src/lib/auth/{http,server,throttle,invite-store}.ts` · `src/db/schema/{app,invite}.ts` · `drizzle/0001_*.sql` · `eslint.config.mjs` (อ่าน 2026-11-20) · **[ทางการ]** [MDN — Origin header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin) (แก้ล่าสุด 2026-08-07 เปิดดู 2026-11-20): เบราว์เซอร์ใส่ `Origin` ในคำขอ same-origin ทุก method ยกเว้น `GET`/`HEAD` → `fetch` POST ของแอปมี `Origin` เสมอ

## บริบท

- ออกโค้ดเชิญได้ทางเดียวคือ `scripts/invite.ts` ซึ่งต้องใช้ connection string ของ production · boss ต้องการออก/แชร์/ดู/เพิกถอนจากมือถือ (US-1.6) · มีแอดมินคนเดียว
- ข้อจำกัด: repo สาธารณะ (ห้ามมีอีเมลใน git) · ไม่มี API ใดในแอปเขียนสิทธิ์ได้ · ตาราง `user` อยู่ใต้ Better Auth · โค้ดดิบห้ามถูกเก็บหรือ log (ADR 0002 ข้อ 2) · HTML ถูก SW เก็บถ้าไม่กันไว้ (ADR 0005) · ห้ามเพิ่ม dependency

## ทางเลือกที่พิจารณา (D1 ของ contract)

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| **ก. ตาราง `app_admin` แยก (เลือก)** | Better Auth ไม่รู้จัก → ไม่มีเส้นทางของไลบรารีเขียนได้ · ไม่มีอีเมลใน git/env · ลบบัญชี = สิทธิ์หายด้วย cascade · เทสต์ลบบัญชีจับเอง | ต้อง SELECT เพิ่ม 1 ครั้งต่อคำขอแอดมิน · เพิ่มแอดมินด้วย SQL เท่านั้น |
| ข. คอลัมน์ `user.is_admin` | ไม่มีตารางเพิ่ม | อยู่ในตารางที่ Better Auth จัดการ ต้องประกาศ `additionalFields` `input: false` และทบทวนทุกครั้งที่อัปรุ่น/เปิดเส้นทางใหม่ |
| ค. env `ADMIN_EMAILS` | ไม่มี migration | อีเมลจริงอยู่ใน Vercel · เปลี่ยน = redeploy · อีเมลเปลี่ยนเจ้าของ = สิทธิ์ผิดคน |

## การตัดสินใจ

### 1. ตาราง `app_admin` (platform · migration `drizzle/0002_*.sql` · schema ใน `src/db/schema/admin.ts` export จาก `index.ts`)

| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| `user_id` | `uuid` NOT NULL | PK ชื่อ `app_admin_pkey` (แบบเดียวกับ `profile_pkey`: `primaryKey({ columns: [t.userId], name: "app_admin_pkey" })`) · FK `app_admin_user_id_user_id_fk` → `"user"("id")` **ON DELETE cascade ON UPDATE no action** |
| `created_at` | `timestamp (3) with time zone` NOT NULL | **ไม่มี DEFAULT** (ADR 0001) — SQL ของ boss ใส่ `now()` เอง |

- ไม่มีคอลัมน์อื่น ไม่มี index เพิ่ม (PK พอ) · ไม่มีคอลัมน์ sync (ไม่เข้าคิว ไม่อยู่ใน bootstrap)
- **ในแอปมีแต่ SELECT**: ห้ามมี INSERT/UPDATE/DELETE `app_admin` ใน `src/` (เกณฑ์ 2) · เทสต์เพิ่มแถวด้วย SQL ตรงใน `*.test.ts` ได้ · เพิ่ม/ถอนสิทธิ์ทำใน Neon SQL Editor ตาม `docs/OPERATIONS.md` ข้อ 8.ง
- ไม่เพิ่ม `invite_code.created_by` (แอดมินคนเดียว · ADR 0003 ตั้งใจให้ `invite_code` ไม่มี `user_id`) — อนาคตเพิ่มเป็น nullable ได้ด้วย migration แบบเพิ่ม

### 2. `requireAdmin()` — ไฟล์ใหม่ `src/lib/auth/admin.ts` (`import "server-only"`)

- `requireAdmin(headers): Promise<AuthedUser>` = `requireUser(headers)` → `SELECT 1 FROM app_admin WHERE user_id = $1 LIMIT 1` **ทุกคำขอ ไม่ cache สิทธิ์** (เกณฑ์ 4) → ไม่มี session / หมดอายุ / ไม่ใช่แอดมิน = `HttpError(404, "not_found")` ทุกกรณี (แปลง 401 ของ `requireUser` เป็น 404) · error อื่น (DB ล่ม) ปล่อยขึ้นไปเป็น 500 ตามเดิม
- `isAdmin(db, userId): Promise<boolean>` — ตัวเดียวกับที่ `requireAdmin` และ `getMe` ใช้
- **เหตุที่ไม่ใส่ใน `server.ts`**: หน้า `/admin/invites` ต้องเรียก แต่ ESLint `boundaries/screens` ห้ามหน้าจอ import `lib/auth/server` · `lib/auth/admin` ไม่ถูกห้าม และ `server-only` กันไม่ให้เข้า bundle ไคลเอนต์ · **ข้อตกลง**: หน้าจอที่ import `@/lib/auth/admin` ได้มีแค่ `src/app/(admin)/admin/**/page.tsx` (ไม่มีกฎ ESLint เจาะจง — security-privacy ตรวจด้วยการค้น)
- API แอดมิน **ไม่เรียก `requireConsent()`** — **เหตุผล (security-privacy I1 · 2026-11-20)**: การยินยอมของ ADR 0002 ข้อ 6 ผูกกับการประมวลผลข้อมูลสุขภาพ · API แอดมินไม่อ่านหรือเขียนข้อมูลสุขภาพของใครเลย (ตารางที่แตะ = `app_admin` · `invite_code` ซึ่งไม่มีข้อมูลสุขภาพ · `user` เฉพาะ `isAdmin` ที่ `/api/me`) จึงไม่มีฐานให้ขอ consent · **เงื่อนไข**: ถ้าเส้นทางแอดมินใดเริ่มแตะข้อมูลสุขภาพ (เช่น ดูจำนวนเซสชันของผู้ใช้) ต้องเรียก `requireConsent()` และกลับมาทบทวนข้อนี้ · ข้อยกเว้นเพิ่มใน ADR 0002 ข้อ 6

### 3. API (route handler ใน `src/app/api/admin/**` · ทุกคำตอบผ่าน `json()`/`handle()` ของ `http.ts` → `Cache-Control: no-store`)

รูปข้อผิดพลาดตามโค้ดปัจจุบัน `{ code, ...extra }` · เวลาเป็น ISO-8601 UTC · **ลำดับตรวจห้ามสลับ**: ตรวจสิทธิ์ก่อนอ่าน body เสมอ (คนนอกต้องไม่เห็น 400/413)

| เส้นทาง | ลำดับตรวจ | คำตอบ |
|---|---|---|
| `GET /api/admin/invites` | 1 `requireAdmin` | 200 `{ invites: [{ id, label, status, usesCount, maxUses, expiresAt, createdAt }] }` · เรียง `created_at DESC, id DESC` · สูงสุด 200 แถว · **ไม่มีโค้ดหรือ hash** · `status` คำนวณด้วย `inviteStatus()` เวลาเซิร์ฟเวอร์ |
| `POST /api/admin/invites` | 1 `assertSameOrigin(req, { requireOrigin: true })` → 2 `requireAdmin` → 3 `hitThrottle` → 4 `readJson` → 5 zod → 6 `createInvite` | 201 `{ id, code: "XXXX-XXXX", label, maxUses, expiresAt }` · 403 `bad_origin` · 429 `too_many_requests` + `X-Retry-After` · 400 `invalid_json` / 413 `payload_too_large` (จาก `readJson`) · 400 `invalid_input` |
| `POST /api/admin/invites/{id}/revoke` | 1 Origin แบบเข้ม → 2 `requireAdmin` → 3 `id` เป็น UUID ตัวเล็กมีขีด (ไม่ใช่ = 404 `not_found`) → 4 เพิกถอน | 200 `{ result: "revoked" \| "unchanged" }` · ไม่พบ = 404 `not_found` · ไม่อ่าน body |
| `GET /api/me` (เดิม) | เดิม | 200 เพิ่ม `isAdmin: boolean` ระดับบนสุด (ทุก `state`) · 401 เดิม |
| method อื่น: `/api/admin/invites` → `PUT` `PATCH` `DELETE` · `/api/admin/invites/{id}/revoke` → `GET` `PUT` `PATCH` `DELETE` | — | export handler ที่ตอบ 404 `{ code: "not_found" }` เสมอ (ไม่ให้ Next ตอบ 405 ที่ต่างจากคนนอก) |
| `OPTIONS` ทั้งสองเส้นทาง | — | export handler 404 `{ code: "not_found" }` ด้วย (ถ้าไม่ export Next ตอบ 204 + `Allow` เอง = บอกว่าเส้นทางมีอยู่) |
| `HEAD` ทั้งสองเส้นทาง | — | ไม่ export · Next ใช้ handler `GET` ของเส้นทางนั้น (platform ยืนยันจาก source Next 16.4.6) → status เดียวกับ `GET` (คนนอก 404) body ว่าง |

- **ทุกกรณีที่ไม่ผ่าน `requireAdmin` ได้ body `{"code":"not_found"}` เหมือนกันทุกไบต์** (เกณฑ์ 3) · 403 `bad_origin` มาก่อน 404 ได้เพราะไม่บอกอะไรเรื่องสิทธิ์ (ทุกคนได้เหมือนกัน)
- **Origin แบบเข้ม**: เพิ่มตัวเลือก `{ requireOrigin?: boolean }` ใน `assertSameOrigin` เดิม (ค่าเริ่ม false — ผู้เรียกเดิมไม่เปลี่ยน) · `true` = ไม่มี `Origin` → 403 `bad_origin` · กติกาเดิมยังใช้ (`Sec-Fetch-Site: cross-site` → 403 · host ไม่ตรง/ผิดรูป/`null` → 403)
- **throttle**: key `admin-invite:<sha256Hex(userId)>` · กฎ `ADMIN_INVITE_RULE = { windowS: 86400, max: 20 }` ใน `throttle.ts` · หน้าต่างคงที่นับจากครั้งแรก · นับทุก POST ที่ผ่าน `requireAdmin` รวมที่ input ผิด (ตั้งใจ) · cron รายวันล้างแถวหมดอายุอยู่แล้ว · **ลบ key นี้ใน `deleteAccount()`** (`src/lib/data/server/account.ts`) ใน transaction เดิม
- **ป้ายของโค้ดที่บัญชีใช้สมัคร (M1 ทาง ก. — boss ตัดสิน 2026-11-20)**: ป้ายผูกกับผู้สมัครผ่าน `user.invite_code_id` จึงนับเป็นข้อมูลส่วนบุคคลได้ · `deleteAccount()` ใน transaction เดิม **ก่อนลบ `user`**: อ่าน `invite_code_id` ของบัญชี → ถ้ามี `UPDATE invite_code SET label = '—'` (ค่าคงที่ `DELETED_INVITE_LABEL`) เฉพาะแถวนั้น · ล้างแม้เป็นโค้ดหลายสิทธิ์ที่คนอื่นใช้ด้วย (ป้ายบอกตัวคนใดคนหนึ่งได้) · ไม่แตะโค้ดอื่น · แถว `invite_code` ไม่ลบ (สถิติใช้ไป x/y ยังถูก) · `label` ยัง NOT NULL ไม่ต้อง migration · ประกาศความเป็นส่วนตัวเพิ่มบรรทัดเรื่องโค้ดที่ใช้สมัคร + ป้ายที่ผู้ดูแลตั้ง และเปลี่ยน `PRIVACY_NOTICE_VERSION` (ทุกคนยินยอมใหม่ 1 ครั้ง — ADR 0002 ข้อ 6)
- **zod (D3)** — schema เดียวใน `src/lib/data/shared/admin-invite.ts` (platform เขียน · frontend ใช้ตรวจฟอร์มก่อนส่ง) · `.strict()` (key แปลก = 400):
  - `label`: string → `trim()` → ความยาว **1–40 code point** (`[...s].length`) · ห้ามอักขระควบคุม `\p{Cc}` · เก็บค่าที่ trim แล้ว
  - `days`: integer ∈ {1, 3, 7, 14} · `maxUses`: integer 1–10 · `expiresAt = now + days × 86 400 000 ms`
  - สคริปต์คงกติกาเดิม (ยืดหยุ่นกว่า) — กติกา D3 อยู่ที่ API เท่านั้น
- **invite-store** (ใช้ฟังก์ชันเดิม ไม่เขียนซ้ำ · พฤติกรรมของสคริปต์ต้องไม่เปลี่ยน — เกณฑ์ 16):
  - list: เพิ่มตัวเลือกเรียง/จำกัดให้ `listInvites` (ค่าเริ่มเดิม = ASC ไม่จำกัด สำหรับสคริปต์)
  - revoke: ฟังก์ชันใหม่ `revokeInviteById(db, id, now) → "revoked" | "unchanged" | "not_found"` = `UPDATE … SET revoked_at = now WHERE id = $1 AND revoked_at IS NULL AND expires_at > now` (คำสั่งเดียว) · 0 แถว → SELECT ว่ามี id ไหม: มี = `unchanged` (เพิกถอนแล้ว/หมดอายุแล้ว) ไม่มี = `not_found` · `exhausted` ที่ยังไม่หมดอายุ → `revoked` · `revokeInvite` เดิมของสคริปต์ไม่แก้
- **โค้ดดิบ**: อยู่ในคำตอบ `POST` ครั้งเดียว · ห้าม log (รวม label และ body) · `handle()` log แค่ชื่อชนิด error อยู่แล้ว

### 4. หน้า `/admin/invites` (frontend · `src/app/(admin)/admin/invites/page.tsx` + `src/app/(admin)/layout.tsx` · URL ไม่เปลี่ยน)

- **กลุ่มของตัวเอง `(admin)`** (ไม่ใช่ `(app)` — แก้ 2026-11-20 commit 96449fa): layout ตรวจ `hasSessionCookie` แบบเดียวกับ `(app)` → ไม่มี cookie 307 `/welcome` · ห่อ `AuthGate kind="app"` · **ไม่มีแถบล่าง** · ไม่อ่านอะไรจาก session · มี cookie → หน้า (server component) เรียก `requireAdmin(await headers())` จับ `HttpError` 404 → `notFound()` · error อื่นโยนต่อ (500 ไม่ปลอมเป็น 404) · **ข้อยกเว้นของ ADR 0006 ข้อ 2** (หน้าแรกที่ query DB ตอน render) ยอมได้เพราะหน้าไม่ถูก cache (ข้อ 5) และ HTML ไม่มีข้อมูลโค้ด/รายการ (โหลดจาก API ฝั่งไคลเอนต์)
- ห้ามมี `loading.tsx` · `<Suspense>` · `not-found.tsx` ใต้ `(admin)` หรือ `admin/` (ADR 0005 กติกา 1: Suspense/loading ทำให้ `notFound()`/`redirect()` กลายเป็น 200) · หน้าแอดมินใหม่ในอนาคตอยู่ใต้ `(admin)/admin/**`
- **ข้อจำกัดของ Next 16.4.6 (อ่าน source แล้ว — แทนสมมติฐานเดิม)**: `notFound()` ที่โยนจากหน้าตอน dynamic render → เซิร์ฟเวอร์ตอบ 404 เป็น error shell `<html id="__next_error__">` แล้วไคลเอนต์วาด 404 **ภายใน layout ของ segment นั้น** ไม่ใช่แทนที่ด้วย root not-found (`next/dist/server/app-render/app-render.js` ~2495–2560 · `getErrorRSCPayload` ~1286–1325) → ถ้าอยู่ใต้ `(app)` ผู้ใช้ทั่วไปเห็นแถบล่างในหน้า 404 จึงย้ายไป `(admin)` · HTML ดิบต่างจาก path ที่ไม่มีอยู่เสมอ (บอกได้แค่ว่าเส้นทางมีอยู่ — repo สาธารณะอยู่แล้ว)
- **เกณฑ์ 3 ส่วนหน้า (boss อนุมัติแก้ 2026-11-20)**: วัดจากสิ่งที่ผู้ใช้เห็น — status 404 · ข้อความเหมือนหน้า 404 ปกติ · ไม่มีแถบล่าง · ไม่มีข้อความของหน้าแอดมิน · **ไม่เทียบ HTML ดิบ** · ส่วน API ยังเทียบ body ทุกไบต์ตามเดิม
- ลิงก์สร้างฝั่งไคลเอนต์ `location.origin + "/welcome#invite=" + code` · โค้ดอยู่ใน state ของหน้าเท่านั้น (ไม่ลง `localStorage` `sessionStorage` IndexedDB Cache Storage · ไม่อยู่ใน URL ใดๆ) · `isAdmin` ก็ไม่เก็บลง storage
- **แชร์ (Lead ตัดสิน 2026-11-20)**: `navigator.share({ text })` อย่างเดียว — `text` = ข้อความ D5 ที่มีลิงก์อยู่แล้ว · **ไม่ส่ง `url`** (บางแอปต่อลิงก์ซ้ำ) · ไม่มี `navigator.share` หรือ reject ที่ไม่ใช่ `AbortError` → ถอยไปคัดลอก · `AbortError` = ผู้ใช้ยกเลิก ไม่ขึ้น error · ข้อความแชร์ไม่มีป้าย/อีเมล
- แถว "ออกโค้ดเชิญ ›" ในหน้า "ฉัน" แสดงเมื่อ `/api/me` ตอบ `isAdmin: true` เท่านั้น · HTML ของ `/me` เหมือนกันทุกคน

### 5. service worker (pwa-offline)

- `isStorablePageUrl()` คืน false เมื่อ pathname = `/admin` หรือขึ้นต้นด้วย `/admin/` → ไม่ถูกเก็บลง `fcf-pages-v1` และไม่อยู่ใน `pagesToStage` · ห้ามเพิ่มเข้า `OFFLINE_PAGES` · `/api/**` ไม่ผ่าน cache อยู่แล้ว
- ผลข้างเคียงที่รับไว้: เปิด `/admin/invites` ตอนออฟไลน์แบบโหลดเต็มหน้า SW ถอยไป `/` (หน้าหลักที่ URL แอดมิน — ADR 0006 ข้อ 4) · จึงให้ frontend **ปิดแถว "ออกโค้ดเชิญ" ตอนออฟไลน์** (`useOnline()`) และหน้าแอดมินที่เปิดอยู่แล้วแสดงสถานะ "ต้องต่อเน็ต" ปิดปุ่ม (ux-brand กำหนดหน้าตา)

## ผลที่ตามมา

- ง่ายขึ้น: boss ออกโค้ดจากมือถือ · สิทธิ์หายเองเมื่อลบบัญชี · ไม่มีอีเมลใน git/env · API ใช้ logic เดียวกับสคริปต์
- ยากขึ้น: เพิ่ม/ถอนแอดมินต้องเข้า Neon · หน้าแรกที่ query DB ตอน render ต้องคุมไม่ให้ถูก cache · มีกติกาโค้ดเชิญสองชุด (API เข้ม · สคริปต์หลวม)
- ต้องทำตาม: ห้ามเพิ่มเส้นทางที่เขียน `app_admin` · เส้นทางแอดมินใหม่ทุกเส้นใช้ลำดับข้อ 3 (Origin เข้ม → `requireAdmin` → ที่เหลือ) · หน้าแอดมินใหม่อยู่ใต้ `src/app/(admin)/admin/**` · security-privacy ตรวจทุกรอบที่แตะ `src/lib/auth/admin.ts` `src/app/api/admin/**` หรือ `src/app/(admin)/**`

## สิ่งที่ยังไม่รู้

| เรื่อง | ใคร | เมื่อไร |
|---|---|---|
| ~~`notFound()` ใต้ `(app)` ได้ HTML เดียวกับ path ที่ไม่มีอยู่~~ **ปิด 2026-11-20: ไม่ตรง** — Next วาด 404 ภายใน layout ของ segment (ข้อ 4) → ย้ายไป `(admin)` (96449fa) · เกณฑ์ 3 ส่วนหน้าแก้เป็นวัดสิ่งที่ผู้ใช้เห็น (boss อนุมัติ) | — | — |
| ~~หน้าแอดมินได้ `Cache-Control` ที่มี `no-store` จาก Next เองหรือไม่~~ **ปิด 2026-11-20** (qa-test วัดจริงบน `/admin/invites`): `private, no-cache, no-store, max-age=0, must-revalidate` · คำตอบ API แอดมินมี `no-store` ใน e2e (เกณฑ์ 9) | — | — |
| ~~`HEAD`/`OPTIONS` บนเส้นทางแอดมิน~~ **ปิด 2026-11-20** (platform อ่าน source Next): `HEAD` ใช้ handler `GET` · `OPTIONS` ที่ไม่ export = 204 + `Allow` → export เป็น 404 (ตารางข้อ 3) | — | — |
| ~~Google sign-in / `navigator.share` ในเบราว์เซอร์ของ LINE~~ **ปิด 2026-11-20**: [research](../research/2026-11-20-r1-5-share-line.md) · boss ตัดสินไม่ทำอะไรเฉพาะ LINE รอบนี้ นอกจากคำแนะนำบนจอยินดีต้อนรับ (บันทึกท้าย contract) | — | — |

## บันทึกการแก้ไข

| วันที่ | สิ่งที่แก้ | เหตุผล | เปลี่ยนการตัดสินใจไหม |
|---|---|---|---|
| 2026-11-20 | ข้อ 4: หน้าย้ายจาก `(app)/admin/invites` → `(admin)/admin/invites` + layout `(admin)` (cookie → 307 · `AuthGate kind="app"` · ไม่มีแถบล่าง) · ห้าม loading/Suspense/not-found ใต้ `(admin)` · ข้อจำกัด 404 shell ของ Next · ข้อ 2 ข้อตกลง import ชี้ `(admin)` | qa-test รอบแรกไม่ผ่านเกณฑ์ 3 ส่วนหน้า (เห็นแถบล่าง · HTML เป็น error shell) · source Next 16.4.6 ยืนยัน · commit 96449fa | ใช่ บางส่วน — ที่อยู่ไฟล์/กลุ่ม · URL พฤติกรรมสิทธิ์ และ API ไม่เปลี่ยน |
| 2026-11-20 | ข้อ 4: เกณฑ์ 3 ส่วนหน้าวัดจากสิ่งที่ผู้ใช้เห็น ไม่เทียบ HTML ดิบ | boss อนุมัติแก้เกณฑ์ (บันทึกท้าย contract) | ใช่ — เกณฑ์ที่ boss อนุมัติเปลี่ยน |
| 2026-11-20 | ข้อ 4: แชร์ `navigator.share({ text })` อย่างเดียว (เดิม contract เขียน `{ text, url }`) | Lead ตัดสินหลังคำถามของ ux-brand — ข้อความ D5 มีลิงก์แล้ว กันลิงก์ซ้ำ | ไม่ — รายละเอียดวิธีทำ |
| 2026-11-20 | ข้อ 3: แถว `OPTIONS`/`HEAD` · ปิดข้อ "ยังไม่รู้" | platform ยืนยันจาก source Next | ไม่ — ยืนยันข้อที่เปิดไว้ |
| 2026-11-20 | ข้อ 3: `deleteAccount()` ล้างป้ายของโค้ดที่บัญชีใช้สมัครเป็น `—` · ประกาศความเป็นส่วนตัวเพิ่มบรรทัด + เปลี่ยน `PRIVACY_NOTICE_VERSION` | security-privacy M1 · boss เลือกทาง ก. 2026-11-20 | ใช่ — เพิ่มขั้นในการลบบัญชี (ADR 0002 ข้อ 7) |
| 2026-11-20 | ข้อ 2: เขียนเหตุผลที่ API แอดมินไม่เรียก `requireConsent()` (security-privacy I1) · ปิดแถว "no-store" ในข้อ "สิ่งที่ยังไม่รู้" ตามที่ qa-test วัดจริง | ตรวจเอกสารโดย secretary ตามคำสั่ง boss · ไม่มีการเปลี่ยนโค้ด | ไม่ — ยืนยันการตัดสินที่มีอยู่ |
