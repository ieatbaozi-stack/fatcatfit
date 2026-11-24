# ADR 0008 — คลังท่ากลาง: ชุดข้อมูล ขอบเขตข้อมูล หมวด/อุปกรณ์ กติกาแมป และการเปิดใช้งาน

- สถานะ: **อนุมัติโดย boss 2026-11-23** ผ่าน [R2_CATALOG_CONTRACT.md](../../R2_CATALOG_CONTRACT.md) (D0–D4, D9 ตามข้อเสนอ) · วันที่ 2026-11-23 · ผู้เขียน: architect
- ขึ้นกับ: ADR 0003 (ตาราง `exercise` ข้อ 2–3) · ADR 0004 (push/bootstrap/catalog ข้อ 2, 4) · ฐานข้อเท็จจริง: [research/2026-11-23-r2-exercise-datasets.md](../research/2026-11-23-r2-exercise-datasets.md)
- เอกสารที่ architect เปิด 2026-11-23: `schema.json` ของ free-exercise-db สาขา `main` (raw.githubusercontent.com/yuhonas/free-exercise-db/main/schema.json) — ค่าที่ยกมาในข้อ 4 มาจากไฟล์นี้ · catalog ต้องตรวจซ้ำกับ commit ที่ล็อกจริง

## บริบท

PRD E2: คลังตั้งต้น ~800 ท่าจากชุดข้อมูลเปิด · ใบอนุญาต/เครดิตต่อแถว · หน้าเครดิต · คาร์ดิโอ/กีฬา 60–100 · ชื่อไทย AI ร่าง + ตรวจรอบสอง (§3 ข้อ 8) · ชื่ออังกฤษเป็นหลัก (§8)
สิ่งที่แก้ทีหลังแพง: **id ของท่าคลัง** (ประวัติใน R3 อ้างถึง) · **`track_type`/`load_mode`** (ล็อกเมื่อมีเซ็ต — ADR 0003 ข้อ 2) · **ค่าหมวด/อุปกรณ์** (CHECK + ข้อมูลในเครื่องของผู้ใช้) · ใบอนุญาตของข้อมูลที่ขึ้น repo สาธารณะ
ข้อจำกัด: repo อาจเป็นสาธารณะ ไฟล์คลังจึงเผยแพร่ต่อไปด้วย · ฟรีทุกบริการ · R3 ต้องค้นท่าตอนออฟไลน์

## ทางเลือกที่พิจารณา

| เรื่อง | ทางเลือก | ผล |
|---|---|---|
| ชุดข้อมูลเวท (D0) | (ก) **free-exercise-db** Unlicense ชุดเดียว · (ข) wger — CC หลายแบบต่อท่า บางท่า share-alike · (ค) ทั้งสองชุด | ก: ใบอนุญาตเดียว ไม่มีภาระแชร์ต่อ จำนวนพอ · ข/ค ต้องเก็บ/แสดงใบอนุญาตหลายแบบและตัดท่าซ้ำ |
| เนื้อหาที่นำมา (D1) | (ก) **ชื่อ + ข้อมูลที่ใช้แมปเท่านั้น** · (ข) รวม `instructions` และรูป | ก: ที่มาข้อความ/รูปต้นทางยืนยันไม่ได้ · PRD ไม่ขอ · ไม่ต้องแปล ~800 ย่อหน้า |
| คาร์ดิโอ/กีฬา (D2) | (ก) **ทีมเขียนเอง** + คาร์ดิโอของ free-exercise-db · (ข) คัดจาก Compendium | ก: ไม่ต้องรอยืนยันเงื่อนไข · ข ต้องเปิด PDF และถามเจ้าของ |
| MET (D4) | (ก) **คอลัมน์ว่างไว้ก่อน** · (ข) ใส่จาก Compendium ตอนนี้ | ก: v1 ไม่มีฟีเจอร์ที่ใช้ · เติมทีหลังไม่ต้องแก้ schema |
| id ของท่าคลัง | (ก) **UUID v4 สุ่มครั้งเดียว เขียนลงไฟล์** · (ข) UUID v5 จาก id ต้นทาง · (ค) ใช้ id ต้นทาง (สตริง) | **เปลี่ยนเป็น ข (Lead 2026-11-23 ตามผลตรวจ security-privacy)**: ถ้าเป็น v4 ผู้ใช้ push id ของท่าคลังที่จะเพิ่มใหม่ (เห็นได้ใน PR) ไปก่อน deploy แล้ว seed ชน PK ทำให้ deploy ล้ม · v5 ไคลเอนต์ส่งไม่ได้เลยเพราะ push รับเฉพาะ v4 · ค ไม่ใช่ UUID |
| ที่ค้น | (ก) **ไคลเอนต์** · (ข) API ค้นฝั่งเซิร์ฟเวอร์ | ก: R3 ต้องค้นออฟไลน์อยู่แล้ว · ข้อมูล ~1,000 แถวพอในหน่วยความจำ |

## การตัดสินใจ

### 1. แหล่งข้อมูลและสิ่งที่นำมา (D0 D1 D2 D4)

- ท่าเวท: **free-exercise-db** ล็อกที่ commit เดียว บันทึก SHA ใน `content/exercises/SOURCES.md` · อัปรุ่นชุดข้อมูล = งานแยกที่จับคู่ด้วย `source_ref` (id เดิมคงไว้เสมอ)
- นำมาเฉพาะ: `id` ต้นทาง (→ `source_ref`) · `name` · `category` · `equipment` · `force` · `primaryMuscles[0]` (สามอย่างหลังใช้แมปเท่านั้น ไม่เก็บ) · **ห้ามนำ `instructions` `images` รูป หรือข้อความอื่น** ทั้งลงไฟล์คลัง ฐานข้อมูล และ API
- ไฟล์ดิบอยู่โฟลเดอร์ชั่วคราวนอก repo ไม่ commit ไม่รันโค้ดในนั้น
- คาร์ดิโอ/กีฬาที่ทีมเขียน: ชื่อกิจกรรมทั่วไป รายชื่อให้ boss ดูใน PR · ท่าหมวด `cardio` ของ free-exercise-db เข้าคลังด้วย · รวมคาร์ดิโอ+กีฬา 60–100 แถว
- `met` = null ทุกแถว · ถ้าภายหลังใส่จาก Compendium: ห้ามแก้ค่า ห้ามรวมกิจกรรมที่ MET ต่างกัน ต้องอ้างเว็บ/บทความ (ตามผลวิจัย) → ต้องมี ADR แก้ไขก่อน

### 2. ค่าที่เก็บต่อแถว (คลังกลาง · `owner_user_id` = null)

| คอลัมน์ | free-exercise-db | ทีมเขียนเอง |
|---|---|---|
| `source_dataset` | `free-exercise-db` | `fatcatfit` |
| `source_ref` | `id` ต้นทาง (สตริง `^[0-9a-zA-Z_-]+$`) | slug ที่ทีมตั้ง ไม่ซ้ำในไฟล์ |
| `license` | `Unlicense` | `original` (ทีมเขียนเอง) |
| `attribution` | `free-exercise-db (github.com/yuhonas/free-exercise-db)` | `Fat Cat Fit` |

- ค่าที่อนุญาตของ `source_dataset` และ `license` อยู่ใน `exercise-meta.ts` (สคริปต์ตรวจคลังใช้) · ฐานข้อมูลบังคับแค่ "ไม่ว่างเมื่อเป็นคลัง" (CHECK ใน ADR 0003) เพื่อเพิ่มชุดใหม่ได้โดยไม่ migration
- **id**: **UUID v5** จาก namespace คงที่ (ค่าคงที่ใน `scripts/seed-lib.ts`) กับชื่อ `<source_dataset>:<source_ref>` → ได้ id เดิมทุกครั้ง ไม่ต้องสุ่ม · ห้ามเปลี่ยน namespace ตลอดไป · `POST /api/sync/push` รับเฉพาะ v4 จึงไม่มีใครจอง id ของท่าคลังได้ · seed ล้มพร้อมข้อความชัดถ้าพบ id ชนกับแถวของผู้ใช้ (Lead แก้ 2026-11-23 จากเดิม v4 สุ่ม)
- `client_updated_at` ของแถวคลัง = seed ตั้งเท่ากับ `updated_at` · `deleted_at` ของแถวคลังเป็น null เสมอ (เลิกใช้ = `archived_at` — ADR 0003 ข้อ 3)
- ชื่อไทย (D3): `name_th` บังคับทุกแถวคลัง · ใช้คำทับศัพท์ที่คนเล่นยิมพูดจริง · คำสะกดแบบอื่นใส่ `search_terms` · โหมดไทยแสดง `name_th` ตัวใหญ่ + `name` ตัวเล็กเสมอ · โหมดอังกฤษแสดง `name` อย่างเดียว · ท่าของฉัน: `name` = ที่ผู้ใช้พิมพ์ `name_th`/`search_terms` = null
- แจ้งชื่อแปลก: บอก boss → แก้ไฟล์คลังรอบถัดไป · แก้ชื่อไม่กระทบประวัติเพราะ R3 เก็บสำเนาชื่อ

### 3. หมวดและอุปกรณ์ (D9 · ค่าบนสายและในฐานข้อมูล · แก้ทีหลังต้อง migration)

- `category` (NOT NULL · 11 ค่า · ลำดับนี้คือลำดับชิป): `chest` อก · `back` หลัง · `shoulders` ไหล่ · `arms` แขน · `legs` ขา/ก้น · `core` แกนกลาง · `full_body` ทั้งตัว · `cardio` คาร์ดิโอ · `sport` กีฬา · `mobility` ยืดเหยียด · `other` อื่นๆ
- `equipment` (null = ไม่ระบุ): `barbell` `dumbbell` `kettlebell` `machine` `cable` `band` `bodyweight` `other`
- ค่าคงที่อยู่ `src/lib/data/shared/exercise-meta.ts` ที่เดียว (zod, CHECK ใน migration, สคริปต์ตรวจคลัง, ป้ายชิปผ่าน key ข้อความ)

### 4. กติกาแมปจาก free-exercise-db (สคริปต์แปลงของ catalog ทำตามลำดับนี้)

**หมวด** — ข้อแรกที่ตรงชนะ
1. `category` ต้นทาง `stretching` → `mobility` · `cardio` → `cardio` · `olympic weightlifting` หรือ `strongman` → `full_body`
2. ที่เหลือ (`strength` `powerlifting` `plyometrics`) ใช้ `primaryMuscles[0]`: `chest` → `chest` · `lats` `middle back` `lower back` `traps` → `back` · `shoulders` → `shoulders` · `biceps` `triceps` `forearms` → `arms` · `quadriceps` `hamstrings` `glutes` `calves` `abductors` `adductors` → `legs` · `abdominals` → `core` · `neck` หรือไม่มีค่า → `other`
3. `sport` ใช้กับรายการที่ทีมเขียนเท่านั้น

**อุปกรณ์**: `barbell` `e-z curl bar` → `barbell` · `dumbbell` → `dumbbell` · `kettlebells` → `kettlebell` · `machine` → `machine` · `cable` → `cable` · `bands` → `band` · `body only` → `bodyweight` · `medicine ball` `exercise ball` `foam roll` `other` → `other` · null → null

**`track_type` / `load_mode`** — ข้อแรกที่ตรงชนะ (จับคำในชื่อแบบไม่สนตัวพิมพ์)

| # | เงื่อนไข | `track_type` | `load_mode` |
|---|---|---|---|
| 1 | ชื่อมี `assisted` | `weight_reps` | `assisted` |
| 2 | ชื่อมี treadmill / incline walk | `incline_speed_duration` | `external` |
| 3 | หมวดที่แมปได้ `cardio` และชื่อเป็นวิ่ง/จ๊อก/ปั่น/bike/cycling/ว่าย/พาย/rowing/elliptical | `distance_duration` | `external` |
| 4 | ชื่อมี farmer / carry / yoke / ถือเดิน | `weight_duration` | `external` |
| 5 | หมวด `mobility` · หรือ `force` = `static` · หรือชื่อมี plank / hold / stretch / hang | `duration` | `external` |
| 6 | คาร์ดิโอที่เหลือ (เชือก สเต็ป ฯลฯ) และ `sport` ทุกแถว | `duration` | `external` |
| 7 | อุปกรณ์ `bodyweight` และชื่อเป็น pull-up / chin-up / dip (รวมรูปแบบย่อย) | `weight_reps` | `bodyweight_plus` |
| 8 | อุปกรณ์ `bodyweight` ที่เหลือ (รวม plyometrics) | `reps_only` | `external` |
| 9 | ที่เหลือทั้งหมด | `weight_reps` | `external` |

- `load_mode` ที่ไม่ใช่ `external` ได้เฉพาะ `weight_reps` (CHECK) · ข้อ 5 ที่ถือน้ำหนัก (เช่น weighted plank) ยังเป็น `duration` ใน v1
- `is_unilateral` = true เมื่อชื่อมี single-arm / one-arm / single-leg / one-leg / unilateral (มีหรือไม่มีขีด) · `alternating` ไม่นับ
- รายการที่ตรงหลายข้อหรือขัดสามัญสำนึก catalog แก้ด้วยมือในไฟล์คลังได้ แต่ต้องอยู่ใน**รายการยกเว้นที่ส่ง Lead ใน PR** · หลัง R3 เริ่มใช้จริง แถวที่มีประวัติเปลี่ยน `track_type`/`load_mode` ไม่ได้ (seed ปฏิเสธ — ADR 0003 ข้อ 2)

### 5. การส่งคลังไปไคลเอนต์และการค้น

- `GET /api/catalog` (ต้องล็อกอิน + ยินยอม) → `{ catalog_version, exercises: [{ id, name, name_th, search_terms: string[], track_type, load_mode, is_unilateral, category, equipment, source_dataset, archived_at }] }` ทุกแถวคลัง (รวมแถวในกรุ ไคลเอนต์ซ่อน) · **ไม่ส่ง** `source_ref` `license` `attribution` `met` (หน้าเครดิตใช้รายการชุดข้อมูลคงที่ใน `exercise-meta.ts` ที่ตรงกับ `SOURCES.md`)
- `search_terms` ในฐานข้อมูลเป็น text คั่นด้วย `|` · บนสายเป็น array (ท่าของฉัน = `[]`)
- `catalog_version` = `<จำนวนแถวคลังทั้งหมด>-<max(updated_at) เป็น epoch ms>` · `ETag: "<catalog_version>"` · คำขอที่ `If-None-Match` ตรง (รับทั้งแบบมีและไม่มี `W/`) → 304 · คง `Cache-Control: no-store` ตามทุก API — ไคลเอนต์ส่ง `If-None-Match` เองจากเวอร์ชันที่เก็บไว้ (R3 เก็บใน IndexedDB store `catalog`)
- seed แตะ `updated_at` เฉพาะแถวที่เนื้อหาเปลี่ยน → รันซ้ำแล้ว `catalog_version` คงเดิม
- ค้นฝั่งไคลเอนต์ด้วยฟังก์ชันบริสุทธิ์ `src/lib/data/shared/exercise-search.ts` ตาม contract R2 หัวข้อ "API & ชนิดข้อมูล" ข้อ 4 · ไม่มี API ค้นฝั่งเซิร์ฟเวอร์

## ผลที่ตามมา

- ง่ายขึ้น: ใบอนุญาตเดียว (Unlicense) + ข้อมูลของทีมเอง → หน้าเครดิตสั้น ไม่มีภาระแชร์ต่อใน repo สาธารณะ · id คงที่ทำให้ seed ซ้ำและอัปรุ่นชุดข้อมูลได้โดยประวัติไม่หลุด · R3 แค่เก็บผล `/api/catalog` ลงเครื่อง
- ยากขึ้น: ไม่มีวิธีทำท่า/รูปให้ผู้ใช้ · ชื่อไทย ~900 แถวพึ่ง AI + ตรวจสองรอบ · กติกาแมปด้วยคำในชื่อพลาดได้ ต้องมีรายการยกเว้น
- ต้องทำตาม: เพิ่มหมวด/อุปกรณ์ = แก้ `exercise-meta.ts` + migration ปรับ CHECK + key ข้อความ · สคริปต์ตรวจคลังต้องปฏิเสธคอลัมน์ `instructions`/รูป · ทุกแถวคลังต้องมี `name_th` `source_*` `license` `attribution`

## สิ่งที่ยังไม่รู้

| เรื่อง | ใคร | เมื่อไร |
|---|---|---|
| ที่มาข้อความต้นทางของ exercises.json (ก่อน free-exercise-db) — ยืนยันไม่ได้ · ลดความเสี่ยงด้วยข้อ 1 | — | ติดตามถ้ามีข้อมูลใหม่ |
| จำนวนท่าจริงที่ commit ที่ล็อก (README "800+") และค่า enum ที่ commit นั้นตรงกับข้อ 4 ไหม | catalog (สคริปต์ตรวจคลัง) | R2 |
| ชื่อต้นทางยาวเกิน 60 ตัว (CHECK ของ `name`) มีกี่แถว — ถ้ามี catalog ย่อชื่อในไฟล์ (คง `source_ref`) และใส่ในรายการยกเว้น · ถ้ามากจน Lead เห็นว่าควรขยายเพดานเฉพาะคลัง ต้องแก้ contract ก่อน migration | catalog → Lead | R2 ก่อน merge migration |
| ขนาด `/api/catalog` แบบ gzip (เกณฑ์ ≤ 200 KB ไม่งั้น Lead ตัดสิน) | platform/Lead | R2 เกณฑ์ข้อ 10 |
| Vercel แปลง `ETag` เป็นแบบ weak ตอนบีบอัดไหม — ยังไม่ยืนยัน จึงรับทั้งสองแบบในข้อ 5 | platform | R2 |
| เงื่อนไข Compendium สำหรับแอป (ถ้าจะใส่ MET) | researcher + boss | เมื่อมีฟีเจอร์ใช้ MET |
