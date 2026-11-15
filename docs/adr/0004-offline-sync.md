# ADR 0004 — ออฟไลน์และ sync: service worker, คิวเขียน, API ส่งซ้ำได้, การชนกัน, ร่างเซสชัน, ตัวจับเวลา

- สถานะ: **อนุมัติโดย boss 2026-11-16** — รับข้อเสนอ Q2: iOS/iPadOS 16.4+ และ Chrome Android 111+ · วันที่ 2026-11-15 · ผู้เขียน: architect
- ฐานข้อเท็จจริง: [research/2026-11-15-pwa-offline.md](../research/2026-11-15-pwa-offline.md) · เอกสารที่ architect เปิด 2026-11-15: [Tailwind compatibility](https://tailwindcss.com/docs/compatibility) (v4 ต้อง Safari 16.4+, Chrome 111+), [MDN randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
- ขึ้นกับ: ADR 0003 (คอลัมน์ร่วม `client_updated_at`, `deleted_at`)

## บริบท

PRD: เซิร์ฟเวอร์เป็นต้นฉบับ ในเครื่องเป็นคิวพัก · UUID จากไคลเอนต์ · ส่งซ้ำไม่เกิดแถวซ้ำ · sync ตอนเปิดแอป/กลับมาออนไลน์ · ปิดแอปกลางคันแล้วทำต่อได้ · ตัวจับเวลาพักถูกแม้จอดับ
ข้อเท็จจริง: iOS **ไม่มี Background Sync** · แอปที่ติดตั้งบน Home Screen ยกเว้นจากกฎล้าง 7 วัน (แท็บ Safari ไม่ยกเว้น) · Wake Lock ในแอปที่ติดตั้งต้อง iOS 18.4+ และไม่ได้ทำให้ JS วิ่งตอนจอดับ · Next 16 ใช้ Turbopack · `@serwist/next` สำหรับ webpack · `@serwist/turbopack` มีแต่เอกสารขัดกันเรื่องรุ่น (ยืนยันไม่ได้) · คิว IndexedDB ไม่ต้องพึ่ง Serwist

## ทางเลือกที่พิจารณา

**Service worker**

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| A. `@serwist/turbopack` + Turbopack | อยู่บนค่าเริ่มต้นของ Next 16 · Next docs ชี้ Serwist | เอกสารบอก "Serwist 10+" แต่ npm ยัง 9.5.x — ใช้ได้จริงไหมยังไม่รู้ · ต้องมี route `src/app/serwist/[path]/route.ts` |
| B. `@serwist/next` + `next build --webpack` | เอกสารชัด เส้นทางเก่าที่คนใช้มาก | ถอยจาก bundler เริ่มต้น · dev (Turbopack) กับ build (webpack) ต่างกัน |
| C. เขียน `public/sw.js` เอง (runtime cache ไม่ precache) | ไม่ขึ้นกับ bundler เลย | ต้องเขียน/เทสต์กลยุทธ์ cache เอง · ออฟไลน์ได้หลังเปิดออนไลน์ครั้งแรกเท่านั้น |

**การชนกัน**: (ก) ลำดับที่เซิร์ฟเวอร์ได้รับชนะ — เครื่องที่ออฟไลน์นานจะทับการแก้ที่ใหม่กว่า · (ข) **last-write-wins ต่อแถวตาม `client_updated_at`** — ตรงกับเจตนาผู้ใช้ เพราะเป็นคนเดียวกันสองเครื่อง นาฬิกามือถือ sync เวลาอยู่แล้ว · (ค) version + ปฏิเสธเมื่อชน — ผู้ใช้ต้องแก้ชนเอง เกินจำเป็นสำหรับข้อมูลส่วนตัว

**ที่เก็บในเครื่อง**: (ก) ฐานข้อมูลคู่ขนานเต็มรูป (ขัด PRD) · (ข) **คิว + snapshot แบบอ่านอย่างเดียวที่ได้จากเซิร์ฟเวอร์** + ร่างเซสชัน

## การตัดสินใจ

### 1. Service worker — spike ใน R0 (pwa-offline) แล้วเลือกตามเกณฑ์

ลองตามลำดับ A → B → C ใช้ตัวแรกที่ผ่าน **ทุกข้อ**: (1) `npm run build` ผ่านบน Next 16.4.x (2) ติดตั้งได้บน Android Chrome และ iOS Safari (3) เปิดออนไลน์ 1 ครั้ง → โหมดเครื่องบิน → ปิด/เปิดแอป → หน้าหลักและหน้าจดโหลดได้ (4) deploy รุ่นใหม่แล้วแอปได้รุ่นใหม่ภายในการเปิดครั้งที่สอง ไม่ค้างของเก่า (5) `npm run dev` ยังใช้ได้ · บันทึกผลใน `docs/adr/0005-service-worker-tool.md` (architect เขียนจากผล spike) ก่อนปิด R0

กลยุทธ์ cache (ทุกทางเลือก): asset ที่มี hash = cache-first · navigation = network-first ถอยไป app shell ที่ cache ไว้ · **`/api/**` ไม่ผ่าน cache ของ SW เลย** (ข้อมูลผู้ใช้อยู่ใน IndexedDB ที่โค้ดแอปควบคุม) · ฟอนต์ self-host ผ่าน `next/font` จึงเป็น asset ปกติ · ไม่มี locale ใน URL (next-intl โหมดไม่ใช้ i18n routing — frontend ยืนยันใน R0) เพื่อให้ shell มีชุดเดียว · SW ใหม่ activate ตอนเปิดแอปครั้งถัดไป ไม่สลับกลางเซสชันที่กำลังจด

### 2. ที่เก็บในเครื่อง (IndexedDB, `src/lib/offline/**`)

ฐานข้อมูลแยกต่อผู้ใช้ชื่อ `fcf:v1:<user_id>` + ฐานกลาง `fcf:device` (ภาษา โหมด "เครื่องนี้เคยเข้าสู่ระบบ" การปิดแบนเนอร์ติดตั้ง — ไม่มีข้อมูลสุขภาพ)

| store | เนื้อหา |
|---|---|
| `outbox` | คิวเขียน (ข้อ 3) |
| `rejected` | รายการที่เซิร์ฟเวอร์ปฏิเสธถาวร รอผู้ใช้ดู |
| `snapshot` | ผลล่าสุดของ `/api/bootstrap`: profile, places, ท่าของฉัน, เทมเพลต, สถิติดีสุดต่อท่า, ค่าครั้งก่อนต่อท่า, เซสชันที่ยังไม่จบ, ประวัติล่าสุด (60 วัน) — **อ่านอย่างเดียว ถูกแทนทั้งก้อนทุกครั้งที่ดึงใหม่** |
| `catalog` | คลังท่ากลาง + `catalog_version` (ดึงใหม่เมื่อเวอร์ชันเปลี่ยน) |
| `active_session` | ร่างเซสชันที่กำลังเล่น (ข้อ 6) |

สิ่งที่แสดงบนจอ = `snapshot` + ทับด้วยรายการใน `outbox` ที่ยังไม่ส่ง (และ `active_session` สำหรับหน้าจด) · เรียก `navigator.storage.persist()` ถ้ามี แต่ไม่พึ่ง

### 3. คิวเขียน (`outbox`)

```ts
type OutboxOp = {
  seq: number;              // autoIncrement = ลำดับส่ง
  v: 1;                     // รุ่นรูปแบบ — โค้ดใหม่ต้องอ่านรุ่นเก่าได้เสมอ
  op_id: string;            // UUID v4 ไว้ตามรอย
  entity: 'profile' | 'place' | 'body_entry' | 'body_measurement' | 'exercise'
        | 'workout_session' | 'session_exercise' | 'set_record'
        | 'workout_template' | 'template_exercise';
  id: string;               // id ของแถว (profile ใช้ user_id)
  action: 'upsert' | 'delete';
  data: Record<string, unknown> | null;   // ทั้งแถวในรูปแบบบนสาย, delete = null
  client_updated_at: string;              // ISO UTC
  attempts: number; next_attempt_at: number; last_error?: string;
  state: 'pending' | 'inflight';
};
```

- **รวมรายการ**: เขียนแถวเดิมซ้ำขณะรายการเดิมยัง `pending` → แทนที่ `data/action/client_updated_at` โดยคง `seq` เดิม (พ่อแม่จึงยังมาก่อนลูก) · ถ้า `inflight` → ต่อท้ายรายการใหม่
- **ลำดับ**: ส่งตาม `seq` ครั้งละไม่เกิน 50 รายการ ทีละชุด ไม่ส่งขนาน
- **ลองใหม่** (เน็ตหลุด, 5xx, 429, timeout): หน่วง `min(2^attempts วิ, 5 นาที)` + สุ่ม ±20% · ไม่มีเพดานจำนวนครั้ง — **ไม่ทิ้งเอง** · รีเซ็ตหน่วงเมื่อ `online` หรือเปิดแอป
- **ปฏิเสธถาวร** (`rejected` ในผลรายรายการ): ย้ายไป store `rejected` พร้อม code → แถบบน "ส่งไม่ผ่าน N" แตะดูได้ ผู้ใช้เลือก "ทิ้ง" หรือ "คัดลอกรายละเอียด" · ลูกของแถวที่ถูกปฏิเสธจะถูกปฏิเสธตาม (`parent_missing`)
- **ไม่ถือเป็นปฏิเสธถาวร**: 401 (หยุดส่ง ชวนล็อกอินใหม่ คิวยังอยู่) · 403 `consent_required` · 409 `upgrade_required` (รอโค้ดรุ่นใหม่)

### 4. API ที่ส่งซ้ำได้ (platform, `src/app/api/sync/**`)

`POST /api/sync/push` body `{ v: 1, ops: [{ op_id, entity, id, action, data, client_updated_at }] }` → `200 { results: [{ op_id, status: 'applied' | 'stale' | 'rejected', code? }], server_time }`

- ประมวลผลตามลำดับ แต่ละรายการเป็นอิสระ (ล้มกลางชุด ไคลเอนต์ส่งทั้งชุดซ้ำได้ผลเท่าเดิม) · ลบเซสชันที่มีลูกทำใน transaction
- upsert = `INSERT … ON CONFLICT (id) DO UPDATE … WHERE t.user_id = :me AND t.deleted_at IS NULL AND t.client_updated_at <= excluded.client_updated_at` → อัปเดต 0 แถว = `stale` (ถือว่าสำเร็จ ไคลเอนต์เอาออกจากคิว) · ถ้า id นั้นเป็นของผู้ใช้อื่น = `rejected` `id_conflict` (ไม่บอกรายละเอียด)
- delete = ตั้ง `deleted_at` (tombstone) · แถวไม่มีอยู่ = `applied` · **ลบชนะเสมอ** upsert ที่มาทีหลังบนแถวที่ลบแล้ว = `stale` · "ย้อนการลบ" ในไคลเอนต์ = สร้างแถวใหม่ id ใหม่
- `client_updated_at` อนาคตเกิน `server_time` → ใช้ `server_time` แทน · เกิน 24 ชม. = `rejected` `bad_clock`
- ตรวจทุกรายการ: zod ตาม entity + ช่องตาม track_type (ADR 0003) · พ่อแม่ต้องเป็นของ `:me` (composite FK) · `exercise_id` ต้องเป็นคลังกลางหรือของ `:me` · code ปฏิเสธ: `invalid` `parent_missing` `id_conflict` `exercise_has_history` `bad_clock`
- `GET /api/bootstrap` → snapshot ทั้งก้อน + `catalog_version` + `server_time` · ไม่ทำ delta sync ใน v1 (ข้อมูลต่อคนเล็ก) · เพิ่ม delta ภายหลังได้เพราะทุกตารางมี `(user_id, updated_at)` และ tombstone แล้ว

### 5. จังหวะ sync

push เมื่อ: เปิดแอป · `online` · `visibilitychange` → visible · หลังเขียนลงคิว (หน่วง 1.5 วิ รวมหลายเซ็ต) · ทุก 60 วิ ขณะแอปเปิดและมีคิวค้าง · ก่อนออกจากระบบ
ดึง `/api/bootstrap` เมื่อ: เปิดแอป · หลัง push ที่มี `applied` (หน่วง 5 วิ) · visible อีกครั้งหลังห่างเกิน 5 นาที · ดึงหลัง push เสมอเพื่อไม่ให้ snapshot เก่าทับสิ่งที่เพิ่งส่ง
แสดงสถานะที่แถบบน (UX ข้อ 1): ออฟไลน์ / กำลังส่ง / ค้างส่ง N / ส่งไม่ผ่าน N · ค้างเกิน 24 ชม. เตือนตาม UX

### 6. ร่างเซสชันที่ทำค้าง

- `active_session` เก็บ: แถวเซสชัน · ท่า · เซ็ตที่ติ๊กแล้ว · แถวแนะนำที่ยังไม่ติ๊ก · ตัวจับเวลาพัก · `updated_at` — **เขียนลง IndexedDB ทุกครั้งที่เปลี่ยน** ไม่รอจบเซสชัน
- ส่งเข้าคิวเมื่อมีเซ็ตแรกถูกติ๊ก (session → session_exercise → set ตามลำดับ) · ท่าที่ไม่มีเซ็ตติ๊กไม่ถูกส่ง · แถวแนะนำไม่ออกนอกเครื่อง · จบโดยไม่มีเซ็ต = ทิ้งในเครื่อง ไม่ส่งอะไร · เอาติ๊กออก = delete เซ็ตนั้น
- เปิดแอปมาเจอร่าง: ≤ 3 ชม. กลับหน้าจด · > 3 ชม. ถาม "เล่นต่อ / จบที่เวลาเซ็ตสุดท้าย" (ตาม UX) · เซสชันที่ยังไม่จบจากอีกเครื่องมาใน snapshot ให้เลือกทำต่อได้

### 7. ตัวจับเวลาพัก (ไม่พึ่ง wake lock)

เก็บ `rest = { started_at: epoch ms, duration_s }` ใน `active_session` · เวลาที่เหลือ = `started_at + duration_s×1000 − Date.now()` คำนวณใหม่ทุกครั้งที่วาด, เมื่อ `visibilitychange`, และเมื่อเปิดแอป — ไม่นับ tick สะสม · ครบเวลาขณะแอปเปิด: แสดง "ไปต่อ" + `navigator.vibrate` เมื่อมี · จอดับ/ปิดแอปไม่มีเสียงเตือน (push เป็น P2) แต่ค่าถูกเมื่อกลับมา · Wake Lock ขอเฉพาะเมื่อมีและอยู่หน้าจด เป็นของแถม · ตัวจับเวลา ▶ ของท่า `duration` ใช้หลักเดียวกัน

### 8. ออกจากระบบและลบบัญชี — สิ่งที่ล้าง

ก่อนออก: พยายาม push · ยังค้าง → ถาม "มี N รายการยังไม่ส่ง · ส่งก่อน / ทิ้งแล้วออก" · ล้าง: ลบฐาน `fcf:v1:<user_id>` ทั้งก้อน · ลบ Cache Storage ที่ชื่อขึ้นต้น `user-` (ถ้ามี) · state ในหน่วยความจำ · คงไว้: `fcf:device` และ cache ของ asset · ลบบัญชีทำแบบเดียวกันหลังเซิร์ฟเวอร์ยืนยัน · session หมดอายุ (401) ไม่ล้างอะไร — ล็อกอินคนเดิมกลับมาส่งต่อได้ ถ้าเป็นอีกคน ฐานเดิมไม่ถูกส่งและมีปุ่มทิ้ง

### 9. รุ่น OS ต่ำสุด (ข้อเสนอ — boss ตัดสิน Q2)

| | รองรับ (ต้องใช้ได้) | ทดสอบจริง |
|---|---|---|
| iOS/iPadOS Safari + แอปที่ติดตั้ง | **16.4+** — เพดานล่างของ Tailwind v4 · ฟีเจอร์ที่เราพึ่ง (SW, IndexedDB, `randomUUID`) มีก่อนนั้น · Wake Lock ในแอปที่ติดตั้งได้เฉพาะ 18.4+ ซึ่งเราไม่พึ่ง | รุ่นล่าสุดที่กลุ่มมี + รุ่นต่ำสุดที่มีเครื่องจริง |
| Android Chrome | **111+** (เพดานล่างของ Tailwind v4) | รุ่นปัจจุบัน |

## ผลที่ตามมา

- ง่ายขึ้น: ไม่มีฐานคู่ขนานให้ merge · ส่งซ้ำปลอดภัยโดยไม่ต้องมีตาราง idempotency key (id + LWW + tombstone พอ) · ตัวจับเวลาถูกแม้แอปถูกฆ่า
- ยากขึ้น: นาฬิกาเครื่องเพี้ยนมากทำให้ LWW ผิด (บรรเทาด้วยการ clamp) · snapshot ทั้งก้อนใหญ่ขึ้นตามจำนวนท่า (วัดใน R3) · รูปแบบคิวต้องเข้ากันย้อนหลังตลอด
- ต้องทำตาม: QA เขียน E2E ออฟไลน์ R3 ครอบ: ส่งซ้ำ, ล้มกลางชุด, สองเครื่องแก้เซ็ตเดียวกัน, ลบชนะแก้, ออกจากระบบขณะมีคิว · โค้ดหน้าจอห้ามเรียก `fetch` ไปเขียนข้อมูลเอง ต้องผ่าน `src/lib/offline`

## สิ่งที่ยังไม่รู้ / ต้องทดสอบ

| เรื่อง | ใคร | เมื่อไร |
|---|---|---|
| Serwist ทางเลือก A/B ผ่านเกณฑ์ข้อ 1 ไหม | pwa-offline spike | R0 |
| next-intl แบบไม่มี locale ใน URL ทำงานกับ App Router + SW shell | frontend | R0 |
| IndexedDB อยู่รอดหลังปิดแอปนาน/พื้นที่เครื่องเต็มบน iOS ที่ติดตั้ง | QA บนเครื่องจริง | R3, R6 |
| `navigator.vibrate` บน iOS (คาดว่าไม่มี — ยังไม่ยืนยัน) | pwa-offline | R3 |
| ขนาด `/api/bootstrap` ต่อผู้ใช้ที่มีประวัติ 1 ปี | platform | R3 |
