# ADR 0001 — ฐานข้อมูล โฮสต์ และภูมิภาค

- สถานะ: **อนุมัติโดย boss 2026-11-16** — เลือกทาง B (Neon) · ยืนยันแล้วว่าแพ็กเกจฟรีสร้างโปรเจกต์ที่ Singapore ได้ (boss สร้างแล้ว, Postgres 18) · แผนสำรองถ้า spike R0 ไม่ผ่าน: Turso โตเกียว + keepalive ใน CI + Vercel โตเกียว · **แก้ไข 2026-11-17** ตามผล spike S1 S2 S6 (ข้อ 6 มีกติกาใหม่ที่ boss ควรรับทราบ — ดูบันทึกการแก้ไขท้ายไฟล์)
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
| Drizzle + PGlite | `drizzle-orm/pglite` = Postgres แบบ WASM รันใน Node ได้ (เอกสารปัจจุบันสั่งติดตั้งรุ่น `rc`) | ทางการ (architect เปิดเอง) · **ใช้กับ 0.45.x ได้ — ยืนยันโดย spike S1 (2026-11-17)**: PGlite 0.5.16 + drizzle-orm 0.45.4 + `drizzle-orm/pglite/migrator` รัน migration จริงผ่าน |
| Vercel Hobby | function ได้ **ภูมิภาคเดียว** ค่าเริ่มต้น `iad1` · ตั้ง `sin1`/`hnd1` ได้ · cron วันละครั้ง | ทางการ |

ประมาณขนาด (architect ประมาณเอง ไม่ได้วัด): 100 คน × 4 เซสชัน/สัปดาห์ × 25 เซ็ต ≈ 520,000 แถวเซ็ต/ปี ≈ 150–250 MB/ปีรวม index → 1 GB ของ Neon พอหลายปี ส่วนเขียน ~1–2 ล้านแถว/ปี ต่ำกว่าเพดานของทุกตัว

## ทางเลือกที่พิจารณา

| | A. Turso (libSQL/SQLite) | B. Neon (Postgres) | C. Postgres เจ้าอื่น (เช่น Supabase) |
|---|---|---|---|
| ข้อดี | โควตาเยอะสุด · ตรงกับ PRD เดิม · เทสต์ด้วยไฟล์ SQLite ง่าย | ภูมิภาคสิงคโปร์มีจริง · Better Auth `pg` มีเอกสาร · Postgres ย้ายเจ้าได้ด้วย `pg_dump` และมีโฮสต์ฟรีหลายเจ้าเป็นทางสำรอง · ไม่มีการ archive | เป็นทางสำรองของ B ได้โดยไม่แก้โค้ด |
| ข้อเสีย | 3 เรื่องยังยืนยันไม่ได้ (สิงคโปร์, คู่ Better Auth+libSQL, อนาคตฟรี) · archive หลัง 10 วัน (เช่นช่วงปีใหม่ไม่มีใครเล่น) · ถ้าต้องย้าย ทางไปมีแค่ libSQL เจ้าเดียวหรือต้องเปลี่ยน dialect | cold start หลังว่าง 5 นาที (ยังไม่ได้วัดว่าช้าเท่าไร) · 1 GB · compute 100 CU-hr ต้องเฝ้า | **ยังไม่ได้วิจัย** ลิมิตและนโยบายหยุดชั่วคราว |

ปัจจัยตัดสิน: สิ่งที่แก้ทีหลังแพงคือ **dialect** (SQLite ↔ Postgres) ไม่ใช่เจ้าโฮสต์ · Postgres ทำให้เปลี่ยนเจ้าได้โดยไม่แตะโค้ด ส่วน libSQL ผูกกับ Turso เกือบเจ้าเดียว · cold start ของ Neon ถูกซ่อนด้วยคิวออฟไลน์ (ADR 0004) เพราะการจดไม่รอเซิร์ฟเวอร์

## การตัดสินใจ (ข้อเสนอของ architect)

1. **Dialect: PostgreSQL** · ORM: Drizzle stable `0.45.x` + drizzle-kit รุ่นที่คู่กัน (ติดตั้งจริง: drizzle-orm `~0.45.4` + drizzle-kit `~0.31.11`) (ขยับเป็น 1.0 เมื่อออก stable เป็นงาน chore แยก)
2. **โฮสต์ฐานข้อมูล: Neon Free ภูมิภาค Singapore** · ถ้าแพ็กเกจฟรีไม่ให้เลือกสิงคโปร์ ให้ใช้ภูมิภาคเอเชียที่ใกล้ที่สุดที่เลือกได้ แล้วแจ้ง architect
3. **ฐานข้อมูล 2 ชุดแยกกัน**: `prod` และ `dev` (preview deploy และเครื่องนักพัฒนาใช้ `dev` เท่านั้น) · ห้ามใช้ข้อมูลจริงใน `dev`
4. **Vercel Hobby** · ภูมิภาค function **ต้องตรงกับฐานข้อมูล** (Singapore → `sin1`) ตั้งใน `vercel.json` `regions` · Node.js runtime ทุก route ที่แตะฐานข้อมูล (ไม่ใช้ Edge) · **Node.js `26.x`** ปักใน `package.json` `engines` ให้ตรงกับ CI และเครื่องพัฒนา (S6 — Vercel รองรับ 26.x/24.x/22.x แหล่งอยู่ใน `docs/OPERATIONS.md` ข้อ 2.1)
5. **Driver**: ค่าเริ่มต้น `node-postgres` ผ่าน connection string แบบ pooled · spike ใน R0 วัดเวลาตอบครั้งแรกหลังหลับและครั้งถัดไป ถ้า `neon-serverless` ดีกว่าชัดเจนสลับได้ (แก้ไฟล์เดียว `src/db/client.ts`) · ต้องรองรับ transaction (ใช้ในการลบบัญชี)
6. **Migration**: `drizzle-kit generate` → ไฟล์ SQL มีเวอร์ชันใน `drizzle/` → apply ด้วย migrator ของ drizzle-orm (`drizzle-orm/node-postgres/migrator`; เทสต์ใช้ `drizzle-orm/pglite/migrator` กับไฟล์ชุดเดียวกัน) ไม่ใช้ `drizzle-kit migrate` · ห้ามผสมสองวิธีกับฐานเดียวกัน (ยังไม่ได้ยืนยันว่าบันทึกประวัติ migration ที่เดียวกัน) · **ห้ามใช้ `drizzle-kit push` กับ prod** · ไม่รันตอน cold start ของ function
   - เครื่องนักพัฒนา/ฐาน `dev`: `npm run db:migrate` (`scripts/db-migrate.ts`)
   - production (S6): รัน **ในขั้น build ของ Vercel ก่อน `next build`** (`vercel.json` `buildCommand` → `scripts/release-migrate.ts`) · ทำงานเฉพาะเมื่อ `MIGRATE_ON_DEPLOY=1` **และ** `VERCEL_ENV=production` · ใช้ `DATABASE_URL_UNPOOLED` เท่านั้น · มี advisory lock กัน build ซ้อน · migration ล้ม = build ล้ม = Vercel ไม่สลับรุ่น · ตอนนี้ยังไม่เปิดใช้ (boss ตั้งตัวแปรเมื่อ Lead แจ้ง — `docs/OPERATIONS.md` ข้อ 2.3)
   - **กติกาที่ตามมา (บังคับทุกรอบ)**: migration ต้องเข้ากันได้ย้อนหลังกับโค้ดรุ่นที่ให้บริการอยู่ (expand → contract) เพราะ schema ใหม่ขึ้นก่อนโค้ดใหม่ และถ้า build ล้มหลัง migrate ฐานข้อมูลจะใหม่กว่าโค้ด · ลบ/เปลี่ยนชื่อคอลัมน์ทำแยก 2 รุ่น · Instant Rollback ของ Vercel ย้อนแต่โค้ด ไม่ย้อน schema
7. **ฐานข้อมูลสำหรับเทสต์**: PGlite ในโปรเซส รัน migration จริงจาก `drizzle/` ทุกครั้ง (`src/db/testing/pglite.ts`) — **ยืนยันแล้วใน S1** · CI ไม่ต้องมี Postgres container · ข้อจำกัด: PGlite ไม่ใช่ Neon จริง (driver, pooler, เวลาตอบ) จึงไม่ใช้วัดประสิทธิภาพ
8. **cron วันละครั้ง** `/api/cron/daily`: ล้างแถวหมดอายุ (OTP, rate limit, โค้ดเชิญหมดอายุ) และ query เบาๆ หนึ่งครั้งเป็น health check
   - **หมายเหตุ 2026-11-19 (ตามโค้ดที่ทำจริงใน R1, `src/lib/auth/cleanup.ts`):** ลบ `rate_limit` ที่ `last_request` เก่ากว่า 24 ชม. · `verification` ที่หมดอายุ · `auth_throttle` ที่หมดอายุ · **โค้ดเชิญที่หมดอายุยังไม่ถูกลบ** (ตารางเล็ก ไม่มีข้อมูลส่วนตัว) · ข้อความข้างบนคงไว้ตามที่อนุมัติ

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

ห้ามใช้: enum type ของ Postgres, `jsonb`, array, trigger, stored procedure, RLS, extension, `serial`, `bigint`, ค่า default ฝั่ง DB ที่เป็นฟังก์ชัน (`now()`, `gen_random_uuid()`) ในตารางของแอป — **id และเวลาสร้างในโค้ดเสมอ** (default ที่เป็นค่าคงที่ เช่น `DEFAULT false` ใช้ได้) · เวลาเก็บเป็น `timestamptz(3)` เสมอ ไม่เก็บเป็นตัวเลข epoch · **ข้อยกเว้นเดียว**: `rate_limit.last_request` ของ Better Auth เป็น epoch ms ที่ไลบรารีกำหนด เก็บเป็น `double precision` (แม่นยำถึง 2^53) ไม่ใช่ `bigint` · กติกาตารางนี้ตรวจอัตโนมัติใน `src/db/migrations.test.ts` · ใช้เฉพาะ query builder ของ Drizzle (`onConflictDoUpdate`, `returning`, composite FK มีทั้งสอง dialect) · `sql\`...\`` ดิบอนุญาตเฉพาะใน `src/db/sql-helpers.ts` ไฟล์เดียว · มีเพียง `src/lib/data/server/**`, `src/lib/auth/**` และ `scripts/db-*.ts` ที่ import `src/db`

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
- ยากขึ้น: เทสต์ใช้ PGlite ซึ่งไม่ใช่ Neon จริง · cold start ตอนเปิดแอปครั้งแรกหลังว่าง · ต้องเฝ้า compute 100 CU-hr · migration ต้องเขียนแบบ expand → contract (ข้อ 6)
- ต้องทำตาม: ops ตั้ง `regions` ใน `vercel.json` ตั้งแต่ R0 · ทุก PR ที่แตะ schema ผ่านกติกาชนิดข้อมูล (เทสต์ `src/db/migrations.test.ts` + QA ตรวจ) · PR ที่มี migration ระบุใน contract ว่าเข้ากันได้ย้อนหลังอย่างไร · PRD ข้อ 6 และ 9.3 ต้องแก้ชื่อผู้ให้บริการ (Lead)

## สิ่งที่ยังไม่รู้ / ต้องทดสอบ

| เรื่อง | ใคร | เมื่อไร |
|---|---|---|
| ~~Neon ฟรีเลือก Singapore ได้ไหม~~ ได้ (boss สร้างแล้ว 2026-11-16) | — | ปิดแล้ว |
| เวลาตอบหลัง Neon หลับ (ครั้งแรก/ครั้งถัดไป) จาก `sin1` เทียบ `node-postgres` กับ `neon-serverless` (S3) · ตัวเลขจากเครื่อง boss ซึ่งไม่ใช่ `sin1`: ครั้งแรก 0.37 วิ ครั้งถัดไป ~0.03 วิ — ใช้ตัดสินไม่ได้ | platform spike | R0 หลัง deploy |
| ~~PGlite ใช้กับ Drizzle 0.45.x + migrator ได้ไหม~~ ได้ (S1) | — | ปิดแล้ว |
| build บน Vercel ต่อฐาน production ผ่าน `DATABASE_URL_UNPOOLED` ได้ และ `npx tsx` มีให้ใช้ตอน build | ops-release ตอนเปิด `MIGRATE_ON_DEPLOY` ครั้งแรก | R1 |
| compute ที่ใช้จริงต่อเดือนเทียบ 100 CU-hr | ops ดู dashboard | หลัง R3 ทุกเดือน |
| Neon ฟรีมี backup/PITR กี่วัน (มีผลต่อการลบบัญชีและ R6) | researcher | ก่อน R1 |
| ทางย้าย Postgres เจ้าอื่นที่ฟรี (ลิมิต, การหยุดชั่วคราว) | researcher | เมื่อสัญญาณในแผนสำรองเกิด |

## บันทึกการแก้ไข

| วันที่ | สิ่งที่แก้ | เหตุผล | เปลี่ยนการตัดสินใจไหม |
|---|---|---|---|
| 2026-11-17 | ข้อ 7 + ตารางข้อเท็จจริง: PGlite ยืนยันแล้ว ตัดทางสำรอง Postgres container | S1: PGlite 0.5.16 + drizzle-orm 0.45.4 + migrator รัน migration จริงผ่าน | ไม่ — เลือกทางหลักที่เขียนไว้ |
| 2026-11-17 | ข้อ 1: ระบุรุ่น drizzle-kit 0.31.11 | รุ่นที่คู่กับ drizzle-orm 0.45.4 ตามที่ platform ติดตั้ง | ไม่ |
| 2026-11-17 | กติกาชนิดข้อมูล: ตัดสินเรื่อง `bigint` — **ไม่เพิ่ม** ในตารางชนิดที่อนุญาต · `rate_limit.last_request` คง `double precision` เป็นข้อยกเว้นเดียว · เพิ่ม `serial`/`bigint` ในรายการห้าม และระบุว่า default ค่าคงที่ใช้ได้ | S2: CLI ของ Better Auth จะสร้าง `bigint` แต่ค่า epoch ms เกิน int32 · `double precision` เก็บจำนวนเต็มได้แม่นยำถึง 2^53 (≈ ค.ศ. 287,000 ในหน่วย ms) อยู่ในตารางชนิดเดิมอยู่แล้ว และ adapter อ่านกลับเป็น number (มีเทสต์) · ถ้าเพิ่ม `bigint` ต้องตัดสินเพิ่มว่าฝั่ง TS ใช้ number หรือ bigint (`pg` คืน int8 เป็น string) ซึ่งเป็นภาระโดยไม่มีตารางของแอปต้องการ · แก้ทีหลังถูก: ตารางนี้มีแต่แถวอายุสั้น | ไม่ — ทำให้กติกาชัดขึ้น |
| 2026-11-17 | ข้อ 4: Node `26.x` | S6: Vercel รองรับ 26.x (ค่าเริ่ม), 24.x, 22.x · ปักให้ตรงกับ CI และเครื่องพัฒนา | ไม่ — ADR เดิมไม่ได้ระบุรุ่น |
| 2026-11-17 | ข้อ 6: apply ด้วย migrator ของ drizzle-orm แทน `drizzle-kit migrate` · production รันในขั้น build ของ Vercel (ต้องเปิดด้วย `MIGRATE_ON_DEPLOY=1`) · **กติกาใหม่ expand → contract** | S6 (ops-release เทียบ 3 วิธีใน `docs/OPERATIONS.md` ข้อ 2.2) · ADR เดิมปล่อย "ขั้นตอน deploy ที่ ops กำหนด" ไว้ · วิธีนี้ทำให้ schema ใหม่ขึ้นก่อนโค้ดใหม่เสมอ จึงต้องมีกติกาเข้ากันได้ย้อนหลัง | **ใช่ บางส่วน** — วิธีรัน migration ตอน deploy เป็นการตัดสินใจใหม่ (ADR เดิมไม่ได้ระบุ) และเพิ่มกติกาที่ทุกรอบต้องทำตาม → boss ควรรับทราบ |
| 2026-11-19 | ข้อ 8: หมายเหตุสิ่งที่ cron ทำจริงใน R1 (`rate_limit` เก่ากว่า 24 ชม., `verification` และ `auth_throttle` ที่หมดอายุ) · โค้ดเชิญที่หมดอายุยังไม่ถูกลบ | ตรวจ `src/lib/auth/cleanup.ts` · ข้อความเดิมคงไว้ | ไม่ — หมายเหตุ |
