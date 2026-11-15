# ADR 0001 — ฐานข้อมูล โฮสต์ และภูมิภาค

- สถานะ: **เสนอ — รอ boss อนุมัติ** (ต้องตัดสินคำถาม Q1 ท้ายเอกสารก่อนเริ่ม R0)
- วันที่: 2026-11-15 · ผู้เขียน: architect
- ฐานข้อเท็จจริง: [research/2026-11-15-hosting-db.md](../research/2026-11-15-hosting-db.md), [research/2026-11-15-auth.md](../research/2026-11-15-auth.md) · เอกสารที่ architect เปิดเพิ่ม 2026-11-15: [Drizzle connect-neon](https://orm.drizzle.team/docs/connect-neon), [Drizzle connect-pglite](https://orm.drizzle.team/docs/connect-pglite)

## บริบท

ข้อกำหนดจาก PRD: อยู่ในแพ็กเกจฟรีทั้งหมด · ฐานข้อมูลอยู่ภูมิภาคใกล้ไทย · เซิร์ฟเวอร์เป็นต้นฉบับ · โฮสต์บน Vercel Hobby · ไม่กี่คนถึงหลักร้อยคน · PRD ข้อ 6 เสนอ Drizzle + Turso

ข้อเท็จจริงใหม่ (ทั้งหมดจากไฟล์วิจัย ยกเว้นที่ระบุ)

| เรื่อง | ค่า | ความมั่นใจ |
|---|---|---|
| Turso ฟรี | 5 GB · อ่าน 500M/เดือน · เขียน 10M/เดือน · **archive หลังไม่ใช้ 10 วัน** ต้อง `turso group unarchive` | ทางการ |
| Turso ภูมิภาค | เห็นโตเกียว/มุมไบ ไม่เห็นสิงคโปร์ · ไม่รู้ว่าฟรีจำกัดภูมิภาคไหม | ยืนยันไม่ได้ |
| Turso เจ้าของ | Supabase ประกาศซื้อ 2026-10-02 · ไม่พูดถึงแพ็กเกจฟรี | ดีล = ทางการ · อนาคตฟรี = ยืนยันไม่ได้ |
| Better Auth + libSQL | หน้า adapter ไม่พูดถึง libSQL | ยืนยันไม่ได้ |
| Neon ฟรี | Postgres · 1 GB/โปรเจกต์ · 100 CU-hr/เดือน · หลับหลังว่าง 5 นาที (ปิดไม่ได้) · เกินโควตา compute ถูกพักแต่ข้อมูลไม่หาย · มีภูมิภาค Singapore `aws-ap-southeast-1` | ทางการ · ฟรีเลือกสิงคโปร์ได้ไหม = ยืนยันไม่ได้ |
| Better Auth + Postgres | adapter Drizzle รองรับ provider `pg` ตามเอกสาร | ทางการ |
| Drizzle + Neon | driver `neon-http` (ไม่เหมาะกับ interactive transaction), `neon-serverless` (WebSocket, มี transaction), `node-postgres`, `postgres.js` | ทางการ (architect เปิดเอง) |
| Drizzle + PGlite | `drizzle-orm/pglite` = Postgres แบบ WASM รันใน Node ได้ (เอกสารปัจจุบันสั่งติดตั้งรุ่น `rc`) | ทางการ (architect เปิดเอง) · ใช้กับ 0.45.x = ยืนยันไม่ได้ |
| Vercel Hobby | function ได้ **ภูมิภาคเดียว** ค่าเริ่มต้น `iad1` · ตั้ง `sin1`/`hnd1` ได้ · cron วันละครั้ง | ทางการ |

ประมาณขนาด (architect ประมาณเอง ไม่ได้วัด): 100 คน × 4 เซสชัน/สัปดาห์ × 25 เซ็ต ≈ 520,000 แถวเซ็ต/ปี ≈ 150–250 MB/ปีรวม index → 1 GB ของ Neon พอหลายปี ส่วนเขียน ~1–2 ล้านแถว/ปี ต่ำกว่าเพดานของทุกตัว

## ทางเลือกที่พิจารณา

| | A. Turso (libSQL/SQLite) | B. Neon (Postgres) | C. Postgres เจ้าอื่น (เช่น Supabase) |
|---|---|---|---|
| ข้อดี | โควตาเยอะสุด · ตรงกับ PRD เดิม · เทสต์ด้วยไฟล์ SQLite ง่าย | ภูมิภาคสิงคโปร์มีจริง · Better Auth `pg` มีเอกสาร · Postgres ย้ายเจ้าได้ด้วย `pg_dump` และมีโฮสต์ฟรีหลายเจ้าเป็นทางสำรอง · ไม่มีการ archive | เป็นทางสำรองของ B ได้โดยไม่แก้โค้ด |
| ข้อเสีย | 3 เรื่องยังยืนยันไม่ได้ (สิงคโปร์, คู่ Better Auth+libSQL, อนาคตฟรี) · archive หลัง 10 วัน (เช่นช่วงปีใหม่ไม่มีใครเล่น) · ถ้าต้องย้าย ทางไปมีแค่ libSQL เจ้าเดียวหรือต้องเปลี่ยน dialect | cold start หลังว่าง 5 นาที (ยังไม่ได้วัดว่าช้าเท่าไร) · 1 GB · compute 100 CU-hr ต้องเฝ้า | **ยังไม่ได้วิจัย** ลิมิตและนโยบายหยุดชั่วคราว |

ปัจจัยตัดสิน: สิ่งที่แก้ทีหลังแพงคือ **dialect** (SQLite ↔ Postgres) ไม่ใช่เจ้าโฮสต์ · Postgres ทำให้เปลี่ยนเจ้าได้โดยไม่แตะโค้ด ส่วน libSQL ผูกกับ Turso เกือบเจ้าเดียว · cold start ของ Neon ถูกซ่อนด้วยคิวออฟไลน์ (ADR 0004) เพราะการจดไม่รอเซิร์ฟเวอร์

## การตัดสินใจ (ข้อเสนอของ architect)

1. **Dialect: PostgreSQL** · ORM: Drizzle stable `0.45.x` + drizzle-kit รุ่นที่คู่กัน (ขยับเป็น 1.0 เมื่อออก stable เป็นงาน chore แยก)
2. **โฮสต์ฐานข้อมูล: Neon Free ภูมิภาค Singapore** · ถ้าแพ็กเกจฟรีไม่ให้เลือกสิงคโปร์ ให้ใช้ภูมิภาคเอเชียที่ใกล้ที่สุดที่เลือกได้ แล้วแจ้ง architect
3. **ฐานข้อมูล 2 ชุดแยกกัน**: `prod` และ `dev` (preview deploy และเครื่องนักพัฒนาใช้ `dev` เท่านั้น) · ห้ามใช้ข้อมูลจริงใน `dev`
4. **Vercel Hobby** · ภูมิภาค function **ต้องตรงกับฐานข้อมูล** (Singapore → `sin1`) ตั้งใน `vercel.json` `regions` · Node.js runtime ทุก route ที่แตะฐานข้อมูล (ไม่ใช้ Edge)
5. **Driver**: ค่าเริ่มต้น `node-postgres` ผ่าน connection string แบบ pooled · spike ใน R0 วัดเวลาตอบครั้งแรกหลังหลับและครั้งถัดไป ถ้า `neon-serverless` ดีกว่าชัดเจนสลับได้ (แก้ไฟล์เดียว `src/db/client.ts`) · ต้องรองรับ transaction (ใช้ในการลบบัญชี)
6. **Migration**: `drizzle-kit generate` → ไฟล์ SQL มีเวอร์ชันใน `drizzle/` → ใช้ `drizzle-kit migrate` · **ห้ามใช้ `drizzle-kit push` กับ prod** · migration รันโดยขั้นตอน deploy ที่ ops กำหนด ไม่รันตอน cold start ของ function
7. **ฐานข้อมูลสำหรับเทสต์**: PGlite ในโปรเซส (รัน migration จริงทุกครั้ง) ถ้า spike R0 พบว่าใช้กับ Drizzle 0.45.x + migrator ไม่ได้ ให้ใช้ Postgres service container ใน GitHub Actions และบนเครื่องนักพัฒนาใช้ฐาน `dev`
8. **cron วันละครั้ง** `/api/cron/daily`: ล้างแถวหมดอายุ (OTP, rate limit, โค้ดเชิญหมดอายุ) และ query เบาๆ หนึ่งครั้งเป็น health check

## กติกาเขียน schema/query ให้ย้ายได้ (บังคับไม่ว่า boss เลือก A หรือ B)

| ชนิดเชิงตรรกะ | Postgres | SQLite/libSQL | ฝั่ง TS / บนสาย (JSON) |
|---|---|---|---|
| id | `uuid` | `text` (36 ตัว) | string ตัวเล็กมีขีด |
| เวลา (instant) | `timestamptz(3)` | `integer` epoch ms | `Date` / ISO-8601 UTC ลงท้าย `Z` มีมิลลิวินาที |
| วันที่ท้องถิ่น | `date` (mode string) | `text` `YYYY-MM-DD` | string `YYYY-MM-DD` |
| ตัวเลขทศนิยม | `double precision` | `real` | number |
| จำนวนเต็ม | `integer` | `integer` | number |
| boolean | `boolean` | `integer` 0/1 (Drizzle mode boolean) | boolean |
| enum | `text` + `CHECK` | `text` + `CHECK` | union ของ string |
| JSON เล็กๆ | `text` (ไม่ใช้ `jsonb`) | `text` | parse ด้วย zod |

ห้ามใช้: enum type ของ Postgres, `jsonb`, array, trigger, stored procedure, RLS, extension, ค่า default ฝั่ง DB ที่เป็นฟังก์ชัน (`now()`, `gen_random_uuid()`) ในตารางของแอป — **id และเวลาสร้างในโค้ดเสมอ** · ใช้เฉพาะ query builder ของ Drizzle (`onConflictDoUpdate`, `returning`, composite FK มีทั้งสอง dialect) · `sql\`...\`` ดิบอนุญาตเฉพาะใน `src/db/sql-helpers.ts` ไฟล์เดียว · มีเพียง `src/lib/data/server/**`, `src/lib/auth/**` และ `scripts/db-*.ts` ที่ import `src/db`

## แผนสำรองและสัญญาณที่ต้องย้าย

| สัญญาณ | ทำอะไร |
|---|---|
| Neon เปลี่ยนแพ็กเกจฟรี / compute เกินโควตาเกิน 1 ครั้ง / cold start ทำให้ login ช้าเกินรับได้ | ย้ายไป Postgres เจ้าอื่น: `pg_dump` → `pg_restore` → เปลี่ยน `DATABASE_URL` + ภูมิภาค Vercel · **ไม่แก้โค้ด** · ให้ researcher ตรวจเจ้าปลายทางก่อน |
| ต้องกลับไป SQLite (ไม่คาดว่าจะเกิด) | เขียน `src/db/schema/**` ใหม่ด้วย `sqliteTable` ตามตารางชนิดข้างบน → generate migration ชุดใหม่ → คัดลอกข้อมูลด้วย `scripts/db-copy.ts` · repository ไม่ต้องแก้ถ้ากติกาข้างบนถูกทำตาม |
| ทุกกรณี | `scripts/db-export.ts` (R6) ส่งออกทุกตารางเป็น JSON ที่ไม่ผูก dialect ใช้ทั้งเป็น backup และเป็นทางย้าย |

### ถ้า boss เลือก A (Turso) แทน — สิ่งที่ต้องเพิ่ม
1. ก่อน R0: boss รัน `turso db locations` หลังสมัคร แจ้งว่าฟรีเลือกได้ภูมิภาคไหน → ตั้ง Vercel ให้ตรง (`sin1` หรือ `hnd1`)
2. R0 spike (platform): Better Auth + Drizzle `sqlite` provider + `drizzle-orm/libsql` สมัคร/ล็อกอิน/ลบผู้ใช้ได้จริง และ `PRAGMA foreign_keys` ทำงาน (cascade ของการลบบัญชีพึ่งสิ่งนี้) · ไม่ผ่าน = กลับมาเลือก B
3. กัน archive: cron วันละครั้ง query จริงหนึ่งครั้ง (**ยังไม่รู้ว่านับเป็น activity**) + ops เขียนขั้นตอน `turso group unarchive` ใน `docs/OPERATIONS.md` + health check ที่ boss เห็นเมื่อฐานล่ม
4. ทุกกติกาในตารางชนิดข้อมูลข้างบนใช้เหมือนเดิม จึงย้ายไป B ได้ภายหลังตามแถวที่ 2 ของแผนสำรอง

## ผลที่ตามมา

- ง่ายขึ้น: ไม่ต้องกลัว archive · ย้ายเจ้า Postgres ได้โดยไม่แก้โค้ด · Better Auth ใช้ provider ที่มีเอกสาร · มี transaction จริง
- ยากขึ้น: CI/เทสต์ต้องมี Postgres (PGlite หรือ container) · cold start ตอนเปิดแอปครั้งแรกหลังว่าง · ต้องเฝ้า compute 100 CU-hr
- ต้องทำตาม: ops ตั้ง `regions` ใน `vercel.json` ตั้งแต่ R0 · ทุก PR ที่แตะ schema ผ่านกติกาชนิดข้อมูล (QA ตรวจ) · PRD ข้อ 6 และ 9.3 ต้องแก้ชื่อผู้ให้บริการ (Lead)

## สิ่งที่ยังไม่รู้ / ต้องทดสอบ

| เรื่อง | ใคร | เมื่อไร |
|---|---|---|
| Neon ฟรีเลือก Singapore ได้ไหม | boss ตอนสร้างโปรเจกต์ใน dashboard | ก่อน R0 |
| เวลาตอบหลัง Neon หลับ (ครั้งแรก/ครั้งถัดไป) จาก `sin1` | platform spike | R0 |
| PGlite ใช้กับ Drizzle 0.45.x + `drizzle-kit migrate` ได้ไหม | platform spike | R0 |
| compute ที่ใช้จริงต่อเดือนเทียบ 100 CU-hr | ops ดู dashboard | หลัง R3 ทุกเดือน |
| Neon ฟรีมี backup/PITR กี่วัน (มีผลต่อการลบบัญชีและ R6) | researcher | ก่อน R1 |
| ทางย้าย Postgres เจ้าอื่นที่ฟรี (ลิมิต, การหยุดชั่วคราว) | researcher | เมื่อสัญญาณในแผนสำรองเกิด |
