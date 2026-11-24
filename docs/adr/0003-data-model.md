# ADR 0003 — โมเดลข้อมูล: track_type, ตาราง, id, หน่วย, เวลา, สถิติ, การลบ

- สถานะ: **อนุมัติโดย boss 2026-11-16** — แก้ตาม boss: `distance_duration` บังคับเฉพาะเวลา ระยะทางเป็น optional · วันที่ 2026-11-15 · ผู้เขียน: architect
- ขึ้นกับ: ADR 0001 (ชนิดข้อมูลแต่ละ dialect), ADR 0002 (ตาราง auth), ADR 0004 (sync) · อ้าง [UX.md](../design/UX.md) ข้อ 3 (ฟอร์มตาม track_type)
- เอกสารที่ architect เปิด 2026-11-15: [MDN crypto.randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) (สร้าง UUID v4, ต้อง HTTPS, ใช้ใน Worker ได้, Baseline ตั้งแต่ มี.ค. 2022)

## บริบท

PRD ข้อ 5/7: เก็บหน่วยมาตรฐาน (kg/เมตร/วินาที) + ค่าที่ผู้ใช้พิมพ์ · เวลาเป็น UTC + วันที่ท้องถิ่น · ทุกการเขียนใช้ UUID จากไคลเอนต์ · `track_type` กำหนดช่อง · แฟลกท่าน้ำหนักตัว/เครื่องช่วย/ทีละข้างตั้งแต่แรก · เก็บชื่อท่า ณ ตอนบันทึก · PR คำนวณจากข้อมูล · ท่าที่มีประวัติเปลี่ยน track_type/ลบไม่ได้ · ลบบัญชีแล้วไม่เหลือข้อมูล · ทุกอย่างส่วนตัว ไม่มีโครงสร้างสังคม · ไม่ปิดทาง P2 (อาหาร, superset/drop set, RPE)

## ทางเลือกที่พิจารณา

| เรื่อง | ทางเลือก | ผล |
|---|---|---|
| นิยาม track_type | (ก) ตาราง `track_type` ในฐานข้อมูล · (ข) **ค่าคงที่ในโค้ด** + `CHECK` ในฐานข้อมูล | เลือก (ข): ฟอร์ม การตรวจ และสถิติเป็นโค้ดอยู่แล้ว ชนิดใหม่ต้องแก้โค้ดเสมอ · ตารางในฐานข้อมูลไม่ได้ทำให้เพิ่มชนิดโดยไม่ deploy ได้จริง |
| คอลัมน์ค่าของเซ็ต | (ก) EAV แถวละค่า · (ข) **คอลัมน์ nullable แบบกว้าง** · (ค) JSON | เลือก (ข) ตาม PRD ข้อ 7: query สถิติง่าย ตรวจชนิดได้ ย้าย dialect ได้ (JSON ขัด ADR 0001) |
| รุ่น UUID | (ก) **v4 จาก `crypto.randomUUID()`** · (ข) v7 เรียงตามเวลา | เลือก v4: ไม่ต้องมี dependency · ไม่ฝังเวลาของเครื่องที่อาจเพี้ยน · ขนาดข้อมูลหลักแสนแถว index locality ไม่มีผล · การเรียงใช้คอลัมน์ `position`/เวลาที่ชัดเจนแทน |
| การลบข้อมูลของผู้ใช้ | (ก) ลบจริง · (ข) **tombstone `deleted_at`** | เลือก (ข) สำหรับตารางที่ sync: กันข้อมูลฟื้นเมื่ออีกเครื่องส่งการแก้ที่ค้างมา (ADR 0004) · ลบจริงเฉพาะตอนลบบัญชี |

## การตัดสินใจ

### 1. กติการ่วม (แก้ทีหลังแพง — ตัดสินแล้ว)

- **id**: UUID v4 ตัวเล็กมีขีด สร้างที่ไคลเอนต์ด้วย `crypto.randomUUID()` (เซิร์ฟเวอร์สร้างเองเฉพาะแถวที่ไม่ได้มาจากคิว) · เซิร์ฟเวอร์ตรวจรูปแบบ ไม่ตรงปฏิเสธ · ท่าในคลังเป็นข้อยกเว้น: **UUID v5** คงที่ในไฟล์ `content/exercises/**` (seed ซ้ำได้ id เดิม · ไคลเอนต์ส่ง v5 ไม่ได้ ดู ADR 0008)
- **เวลา (instant)**: UTC ความละเอียดมิลลิวินาที ชื่อคอลัมน์ลงท้าย `_at` · **วันที่ท้องถิ่น** `local_date` (`YYYY-MM-DD`) คำนวณที่ไคลเอนต์ตอนเกิดเหตุการณ์ + `time_zone` (IANA จาก `Intl.DateTimeFormat().resolvedOptions().timeZone`) ที่ตารางเซสชัน · วันของเซสชัน = วันท้องถิ่นตอน **เริ่ม** (เล่นข้ามเที่ยงคืนไม่ตกวัน) · สรุปรายสัปดาห์/เดือนจัดกลุ่มด้วย `local_date` ไม่ใช้ timezone ของเซิร์ฟเวอร์
- **หน่วย**: เก็บค่ามาตรฐานเต็มความละเอียด double · ค่าที่มีหน่วยให้เลือกเก็บ 3 คอลัมน์ `<x>_<si>` + `<x>_input` (เลขที่พิมพ์) + `<x>_unit` · แสดงผล: หน่วยที่ตั้งตรงกับ `_unit` ใช้ `_input` ตรงๆ ไม่ตรงก็แปลงจากค่ามาตรฐาน · ค่าคงที่การแปลงอยู่ใน `src/lib/data/shared/units.ts` ที่เดียว (1 lb = 0.45359237 kg · 1 in = 0.0254 m · 1 mi = 1609.344 m · 1 mph = 0.44704 m/s · 1 km/h = 1/3.6 m/s)

| ค่า | มาตรฐาน | `_unit` ที่รับ | ไม่มีหน่วยให้เลือก |
|---|---|---|---|
| น้ำหนัก (เซ็ต, ร่างกาย, กล้ามเนื้อ) | `_kg` | `kg` `lb` | ครั้ง `reps` (int) |
| ระยะ | `_m` | `m` `km` `mi` | เวลา `duration_s` (int วินาที) |
| ความเร็ว | `_mps` | `kmh` `mph` | ความชัน `incline_pct` · ไขมัน `body_fat_pct` |
| ส่วนสูง/รอบตัว | `_m` | `cm` `in` | |

- **ตารางที่ sync** มีคอลัมน์ร่วม: `id` · `user_id` (FK → `user.id` ON DELETE CASCADE) · `created_at` · `updated_at` (เซิร์ฟเวอร์ตั้ง) · `client_updated_at` (ใช้ตัดสิน last-write-wins, ADR 0004) · `deleted_at` (tombstone) · ทุก query กรอง `user_id = ผู้ใช้ปัจจุบัน AND deleted_at IS NULL`
- **พ่อแม่ของผู้ใช้คนเดียวกัน** ใช้ composite FK `(parent_id, user_id) → parent(id, user_id)` (parent มี `UNIQUE(id, user_id)`) → ฐานข้อมูลเองกันการผูกลูกเข้ากับข้อมูลของคนอื่น
- enum เก็บเป็น `text` + `CHECK` · ห้ามคอลัมน์ JSON ยกเว้น `profile.goals`

### 2. track_type (นิยามใน `src/lib/data/shared/track-types.ts` ใช้ร่วมไคลเอนต์/เซิร์ฟเวอร์)

● บังคับ · ○ ไม่บังคับ · – ต้องเป็น null (เซิร์ฟเวอร์ปฏิเสธถ้ามีค่า)

| track_type | weight | reps | duration | distance | speed | incline |
|---|---|---|---|---|---|---|
| `weight_reps` | ● (`bodyweight_plus`: ○ = น้ำหนักเพิ่ม · `assisted`: ● = น้ำหนักช่วย) | ● | – | – | – | – |
| `reps_only` | – | ● | – | – | – | – |
| `duration` | – | – | ● | – | – | – |
| `distance_duration` | – | – | ● | ○ | – | – |
| `weight_duration` | ● | – | ● | – | – | – |
| `incline_speed_duration` | – | – | ● | ○ | ● | ● |

ทุกชนิด: `set_kind` ● (`normal` | `warmup`) · ระยะในหน้าลู่วิ่งและเพซเป็นค่าคำนวณ ไม่เก็บ · ช่วงค่าที่ยอมรับอยู่ในข้อ 3.2 (R3 contract D4) · boss ตัดสิน 2026-11-16: `distance_duration` บังคับเฉพาะเวลา ระยะเป็น optional (หลายคนวิ่งลู่แล้วไม่จดระยะ) — เซ็ตที่ไม่มีระยะไม่นับในสถิติระยะ/เพซ

**แฟลกของท่า** (ที่ตาราง `exercise`): `load_mode` = `external` | `bodyweight_plus` | `assisted` (ไม่ใช่ `external` ได้เฉพาะ `weight_reps`) · `is_unilateral` boolean (แสดงป้าย "ข้างละ" ค่าเก็บเป็นต่อข้าง ไม่คูณ 2) · **`track_type` และ `load_mode` ล็อกเมื่อท่ามีเซ็ตแล้ว** (เซิร์ฟเวอร์ปฏิเสธ `exercise_has_history` และสคริปต์ seed ปฏิเสธการเปลี่ยนท่าในคลังที่มีประวัติ) · `is_unilateral` แก้ได้

### 3. ตารางของ v1

| ตาราง | รอบ | คอลัมน์หลัก (นอกจากคอลัมน์ร่วม) | ความสัมพันธ์ |
|---|---|---|---|
| `user` `session` `account` `verification` `rate_limit` | R0* | schema เขียนเองให้ตรงกับ `getAuthTables()` ของ better-auth (ไม่ใช้ CLI — ADR 0002 บันทึกการแก้ไข 2026-11-17) · `user.invite_code_id` เพิ่มใน R1 (nullable) | `session`/`account` → `user` CASCADE |
| `invite_code` | R1 | `code_hash` UNIQUE · `label` · `max_uses` · `uses_count` · `expires_at` · `revoked_at` · `created_at` | `user.invite_code_id` → นี่ ON DELETE SET NULL · ไม่มี `user_id` · ลบบัญชีแล้ว `label` ของโค้ดที่บัญชีใช้สมัครถูกตั้งเป็น `—` (R1.5 · ข้อ 5) |
| `auth_throttle` | R1 | `key` PK (`otp-email:<sha256>` / `otp-day:<YYYY-MM-DD>` / `invite-ip:<sha256>` / `admin-invite:<sha256(userId)>` (R1.5) — ADR 0002 ข้อ 3) · `window_started_at` · `count` · `expires_at` | ไม่ผูกผู้ใช้ · ลบด้วย hash ตอนลบบัญชี |
| `app_admin` | R1.5 | `user_id` PK (`app_admin_pkey`) · `created_at` (ไม่มี DEFAULT) · ไม่มีคอลัมน์ sync · แอปมีแต่ SELECT — เพิ่ม/ถอนด้วย SQL เท่านั้น (ADR 0007 ข้อ 1) | → `user` CASCADE (`app_admin_user_id_user_id_fk`) |
| `consent_record` | R1 | `notice_version` · `accepted_at` · `locale` (ไม่มีคอลัมน์ sync) | → `user` CASCADE |
| `profile` | R1 | PK = `user_id` · `locale` · `weight_unit` `length_unit` `distance_unit` · `theme` · `rest_seconds` (90) · `birth_year` · `height_m/_input/_unit` · `goals` (JSON array) · `experience` · `onboarded_at` · `client_updated_at` | 1:1 `user` CASCADE |
| `place` | R1 | `name` · `map_url` (CR3: ลิงก์ Google Maps 1–500 ตัว หรือ null · migration 0004) · `last_used_at` · `archived_at` | → `user` |
| `body_entry` | R1 (น้ำหนัก) · R4 (ที่เหลือ) | `measured_at` · `local_date` · `weight_kg/_input/_unit` ● · R4: `body_fat_pct` · `muscle_kg/_input` (ใช้ `weight_unit` เดียวกัน) | → `user` · วันละหลายแถวได้ กราฟใช้แถวล่าสุดของวัน |
| `body_measurement` | R4 | `body_entry_id` · `site` (`waist` `chest` `hip` `arm` `thigh` `neck` — เพิ่มได้ด้วย CHECK) · `value_m/_input/_unit` | composite → `body_entry` CASCADE |
| `exercise` | R2 | `owner_user_id` (null = คลังกลาง · **ใช้แทน `user_id`**) · `name` · `name_th` · `search_terms` · `track_type` · `load_mode` · `is_unilateral` · `category` · `equipment` · `source_dataset` `source_ref` `license` `attribution` · `met` · `archived_at` — ชนิดและ CHECK ในข้อ 3.1 | ท่าเอง → `user` CASCADE · คลังกลางไม่มีเจ้าของ |
| `workout_session` | R3 | `place_id` · `started_at` · `ended_at` (null = ยังเล่นอยู่) · `local_date` · `time_zone` · `template_id` (อ้างอิงเฉยๆ ไม่มี FK) — ชนิดและ CHECK ในข้อ 3.2 | `place_id` composite → `place` |
| `session_exercise` | R3 | `session_id` · `exercise_id` (เปลี่ยนไม่ได้) · `position` · **สำเนา ณ ตอนบันทึก**: `exercise_name` `exercise_name_th` `track_type` `load_mode` — ข้อ 3.2 | composite → `workout_session` CASCADE · `exercise_id` → `exercise` (NO ACTION) |
| `set_record` | R3 | `session_exercise_id` · `position` · `set_kind` · `completed_at` · `weight_kg/_input/_unit` · `reps` · `duration_s` · `distance_m/_input/_unit` · `speed_mps/_input/_unit` · `incline_pct` — ข้อ 3.2 | composite → `session_exercise` CASCADE |
| `workout_template` | R4 | `name` · `last_used_at` | → `user` |
| `template_exercise` | R4 | `template_id` · `exercise_id` · `position` · `set_count` | composite → `workout_template` CASCADE |

\* R0 สร้างตาราง Better Auth เป็น migration แรกเพื่อพิสูจน์ pipeline + spike (ADR 0001) ถ้า Lead อยากให้ R0 เล็กลงย้ายไป R1 ได้ · `body_entry` ต้องมีใน R1 เพราะแบบสอบถามบังคับน้ำหนัก (PROCESS เดิมวางไว้ R4)

Index หลัก: `(user_id, updated_at)` ทุกตาราง sync · `session_exercise(user_id, exercise_id)` · `workout_session(user_id, local_date)` · `set_record(session_exercise_id, position)` · `exercise(owner_user_id, updated_at)` (ใช้ทั้งท่าของฉันและ `catalog_version` ของแถว `owner_user_id IS NULL`)

### 3.1 ตาราง `exercise` (R2 · migration `0003` · การเลือกชุดข้อมูลและกติกาแมปอยู่ใน [ADR 0008](0008-exercise-catalog.md))

| คอลัมน์ | ชนิด / กติกา |
|---|---|
| `id` | uuid v4 PK · คลัง = คงที่จากไฟล์ `content/exercises/**` · ท่าของฉัน = จากไคลเอนต์ |
| `owner_user_id` | uuid null · null = คลังกลาง · FK → `user.id` ON DELETE CASCADE · ไม่มี composite FK จากลูก (คลังไม่มีเจ้าของ) — R3 ตรวจ "`exercise_id` เป็นคลังหรือของ `:me`" ในโค้ด (ADR 0004 ข้อ 4) |
| `name` | text NOT NULL ยาว 1–60 (CHECK) · คลัง = อังกฤษ ไม่ซ้ำในคลัง (สคริปต์ตรวจคลังบังคับ ไม่ใช่ฐานข้อมูล) · ท่าของฉัน = ที่ผู้ใช้พิมพ์ ซ้ำได้ |
| `name_th` | text null · CHECK `owner_user_id IS NOT NULL OR name_th IS NOT NULL` · ท่าของฉัน = null |
| `search_terms` | text null คั่นด้วย `\|` (ไม่ใช่ JSON) · บนสายเป็น array |
| `track_type` | text NOT NULL CHECK 6 ชนิดในข้อ 2 |
| `load_mode` | text NOT NULL CHECK `external` `bodyweight_plus` `assisted` · CHECK `load_mode = 'external' OR track_type = 'weight_reps'` |
| `is_unilateral` | boolean NOT NULL default false |
| `category` | text NOT NULL CHECK `chest` `back` `shoulders` `arms` `legs` `core` `full_body` `cardio` `sport` `mobility` `other` |
| `equipment` | text null (= ไม่ระบุ) CHECK `barbell` `dumbbell` `kettlebell` `machine` `cable` `band` `bodyweight` `other` |
| `source_dataset` `source_ref` `license` `attribution` | text null · CHECK `owner_user_id IS NOT NULL OR (ทั้งสี่ช่อง IS NOT NULL)` · ท่าของฉัน = null ทั้งหมด (เซิร์ฟเวอร์ตั้ง ไม่รับจากไคลเอนต์) |
| `met` | double precision null · R2 = null ทุกแถว (ADR 0008 ข้อ 1) |
| `archived_at` | instant null |
| คอลัมน์ร่วม | `created_at` `updated_at` `client_updated_at` (NOT NULL · แถวคลัง seed ตั้ง = `updated_at`) `deleted_at` · CHECK `owner_user_id IS NOT NULL OR deleted_at IS NULL` (คลังไม่ลบ) |

- ค่าคงที่ของ CHECK อยู่ `src/lib/data/shared/exercise-meta.ts` + `track-types.ts` ที่เดียว · repository ของท่าของฉันกรอง `owner_user_id = :me AND deleted_at IS NULL` · คลังกรอง `owner_user_id IS NULL`
- จำนวนสูงสุดต่อคน (นับเฉพาะแถวที่ใช้งาน: `deleted_at IS NULL AND archived_at IS NULL` · Lead ตัดสิน 2026-11-23 · แถวที่ลบแล้วนับในเพดานรวม 200): ท่าของฉัน 300 · `place` 30 → เกิน = `limit_reached` (ADR 0004 ข้อ 4)

### 3.2 ตาราง R3 `workout_session` `session_exercise` `set_record` (migration `0005` · R3 contract D4 D9 · ทุกตารางมีคอลัมน์ร่วม + `UNIQUE(id, user_id)`)

| ตาราง · คอลัมน์ | ชนิด / กติกา |
|---|---|
| `workout_session.place_id` | uuid NOT NULL · composite FK → `place(id, user_id)` · สถานที่ในกรุหรือถูก tombstone แล้วยังอ้างได้ (FK ยังอยู่) · แก้ได้ (R3b) |
| `.started_at` `.ended_at` | instant · `ended_at` null = เล่นอยู่ · CHECK `ended_at IS NULL OR (ended_at >= started_at AND ended_at <= started_at + interval '24 hours')` |
| `.local_date` `.time_zone` | `date` NOT NULL · text NOT NULL (IANA) · ตั้งครั้งเดียวตอนเริ่ม ไคลเอนต์ส่งค่าเดิมทุกครั้ง (เปลี่ยน time zone กลางเซสชันไม่เปลี่ยนวัน) · เซิร์ฟเวอร์ตรวจ `local_date` = วันที่ของ `started_at` ใน `time_zone` (ADR 0004 ข้อ 4 ส่วน R3) |
| `.template_id` | uuid null ไม่มี FK · R3 ไม่รับจากไคลเอนต์ (R4) · ชื่อเซสชันคำนวณตอนแสดง ไม่เก็บ |
| `session_exercise.session_id` | composite FK → `workout_session` CASCADE · **เปลี่ยนไม่ได้หลัง insert** |
| `.exercise_id` | uuid NOT NULL FK → `exercise(id)` NO ACTION · เปลี่ยนไม่ได้ · คลัง (v5) หรือของ `:me` (v4) ตรวจในโค้ด |
| `.position` | int NOT NULL CHECK 0–1,000 · ซ้ำได้ (เรียง `position, created_at, id`) |
| `.exercise_name` `.exercise_name_th` `.track_type` `.load_mode` | สำเนา NOT NULL (ยกเว้น `_th` null) · CHECK เดียวกับ `exercise` · **เซิร์ฟเวอร์คัดลอกจากแถว `exercise` ตอน insert ครั้งแรกเท่านั้น** upsert ครั้งหลังไม่เปลี่ยน · ไม่รับจากไคลเอนต์ |
| `set_record.session_exercise_id` | composite FK → `session_exercise` CASCADE · **เปลี่ยนไม่ได้หลัง insert** |
| `.position` `.set_kind` `.completed_at` | int CHECK 0–1,000 · text CHECK `normal` `warmup` · instant NOT NULL (ส่งเฉพาะเซ็ตที่ติ๊ก) |
| ค่าของเซ็ต | ช่องตาม `track_type`/`load_mode` ของ**สำเนา**ในข้อ 2 · ตรวจทั้ง zod และ CHECK ในฐานข้อมูล (CHECK อ้างสำเนาข้ามตารางไม่ได้ จึงตรวจแค่ช่วงค่าและความครบของคู่ `_input`/`_unit`/SI) · **ไคลเอนต์ส่ง `_input` + `_unit` เท่านั้น เซิร์ฟเวอร์คำนวณ SI ด้วย `units.ts`** |

**ช่วงค่า (D4 · ตรวจที่ `_input` ตาม `_unit` เพราะขอบเป็นเลขกลมในหน่วยที่พิมพ์ · ขอบรวมทั้งสองข้าง)**

| ช่อง | `_unit` | ช่วง | ทศนิยม |
|---|---|---|---|
| `weight_*` (ภายนอก / ถ่วงเพิ่ม / ช่วย) | `kg` · `lb` | 0–1,000 · 0–2,200 (0 = ไม้เปล่า/ไม่ถ่วง) | ≤ 2 |
| `reps` | — | 1–1,000 | จำนวนเต็ม |
| `duration_s` | — | 1–86,400 (24 ชม.) | จำนวนเต็ม |
| `distance_*` | `km` · `mi` (**R3 ไม่รับ `m`** — ขยายทีหลังได้แบบไม่ทำลาย) | 0.01–1,000 · 0.01–620 | ≤ 2 |
| `speed_*` | `kmh` · `mph` | 0.1–40 · 0.1–25 | ≤ 1 |
| `incline_pct` | — | 0–40 (ไม่รับลาดลง) | ≤ 1 |

- ตรวจทศนิยมใน zod เท่านั้น (`|x·10^n − round(x·10^n)| < 1e-9`) · ฐานข้อมูลตรวจช่วงด้วย CHECK ต่อคู่ เช่น `(weight_unit = 'kg' AND weight_input BETWEEN 0 AND 1000) OR (weight_unit = 'lb' AND weight_input BETWEEN 0 AND 2200)` และ `_input`/`_unit`/SI เป็น null พร้อมกันหรือมีค่าพร้อมกัน
- ค่าคงที่ช่วงอยู่ `src/lib/data/shared/track-types.ts` (หรือไฟล์ข้าง) ที่เดียว ใช้ทั้งฟอร์ม zod และ migration · เปลี่ยนช่วงทีหลัง = migration แก้ CHECK
- **ความยาวเซสชัน** ≤ 24 ชม. (CHECK ข้างบน) · ไคลเอนต์จบเซสชันที่ `min(เวลาเซ็ตสุดท้าย, started_at + 24 ชม.)` · เซิร์ฟเวอร์ไม่เทียบ `completed_at` ของเซ็ตกับช่วงของเซสชัน (ไม่ทิ้งเซ็ตเพราะนาฬิกาสองเครื่องต่างกัน)

**เพดาน (D9 · `limit_reached` · ล็อกแถว user แบบ R2)**: ต่อเซสชัน ท่าที่ไม่ถูกลบ ≤ 40 · ต่อท่าในเซสชัน เซ็ตที่ไม่ถูกลบ ≤ 100 · รวมต่อคน **นับแถวที่ลบแล้วด้วย** (กันสร้าง-ลบวน): `workout_session` 20,000 · `session_exercise` 150,000 · `set_record` 500,000 · ติดเพดานเฉพาะ upsert ที่สร้างแถวใหม่ · นับด้วย index `(user_id, …)` (platform วัดตามเกณฑ์ 18)

Index เพิ่ม: `session_exercise(session_id)` · `set_record(user_id, completed_at)` (ค่าครั้งก่อน/สถิติ) · `workout_session(user_id) WHERE ended_at IS NULL AND deleted_at IS NULL` (เซสชันที่เล่นอยู่) — platform ปรับได้ถ้าวัดแล้วดีกว่า

**กติกาการเปลี่ยนแปลง**: ท่าเอง/สถานที่/เทมเพลตลบ = tombstone · ท่าเองที่มีประวัติลบไม่ได้ → `archived_at` · ท่าในคลังไม่เคยลบ (เลิกใช้ = `archived_at`) · ลบเซสชัน = tombstone เซสชัน + ลูกทั้งหมดใน transaction เดียว · ลำดับซ้ำกันได้ (สองเครื่อง) เรียงด้วย `position, completed_at, id`

### 4. สถิติ (PR) — คำนวณ ไม่เก็บ

- นิยามอยู่ในฟังก์ชันบริสุทธิ์ `src/lib/stats/**` ใช้ร่วมไคลเอนต์/เซิร์ฟเวอร์ · ไม่นับ `warmup` และแถวที่มี `deleted_at`
- **เมื่อไร**: (1) ไคลเอนต์ตอนกด ✓ เทียบกับ "สถิติดีสุดต่อท่า" ใน snapshot + เซ็ตที่ยังค้างในคิว → แสดงทันทีแม้ออฟไลน์ (2) เซิร์ฟเวอร์คำนวณสด ตอนสร้าง `/api/bootstrap` และ endpoint กราฟ → แก้/ลบเซ็ตแล้วสถิติถูกเองโดยไม่มีงานคำนวณใหม่
- **กติกา R3 (contract D3)**: ฐานเทียบ = เซ็ต `normal` ที่ไม่ถูกลบ ของ `exercise_id` เดียวกัน จาก**เซสชันก่อนหน้า** + เซ็ตก่อนหน้าในเซสชันนี้ (ตาม `position, completed_at, id`) · ไม่นับเซ็ตที่สำเนา `track_type`/`load_mode` ไม่ตรงกับแถว `exercise` ปัจจุบัน (ใช้แถวแม้ถูก tombstone) · **ไม่มีเซ็ตจากเซสชันก่อนเลย = ไม่ฉลองและไม่มีดาวทั้งเซสชัน** · ต้อง**มากกว่า** (น้อยกว่าสำหรับ ↓) เท่ากันไม่นับ — เทียบค่า SI ด้วย epsilon 1e-6 · เซ็ตที่ชนะได้ดาว · **ฉลองไม่เกิน 1 ครั้งต่อท่าต่อเซสชัน** (เซ็ตแรกที่ชนะ) · ปริมาณรวมต่อเซสชันไม่ฉลอง (R5 กราฟ)
- "**X มากสุดที่ Y ≥ เดิม**" = เซ็ต (y, x) ชนะเมื่อ x > max{x ของเซ็ตฐานที่ y′ ≥ y} · ไม่มีเซ็ตฐานที่ y′ ≥ y = ไม่นับตัวนี้ (ตัว "Y สูงสุด" จับแทน) · ช่วย (↓): ใช้ y′ ≤ y · น้ำหนัก null ของ `bodyweight_plus` = 0
- **เพซ** = `duration_s / (distance_m/1000)` วินาทีต่อ km ↓ · นับเฉพาะเซ็ตที่มีระยะ **≥ 1,000 m** · ระยะ ↑ นับเฉพาะเซ็ตที่มีระยะ · เวลา ↑ นับทุกเซ็ต
- ไคลเอนต์ (ออฟไลน์) = `bests` จาก snapshot ⊕ เซ็ตในคิวของเซสชันที่จบแล้ว ⊕ เซ็ตก่อนหน้าในเซสชันนี้ · `bests` ใน bootstrap คำนวณจากเซสชันที่**จบแล้ว**เท่านั้น และตัว "≥ เดิม" ส่งเป็นรายการจุดที่ไม่ถูกข่ม (Pareto frontier ของ (y, x)) ไม่ใช่เลขเดียว · ฟังก์ชันพับเซ็ตเข้า `bests` อยู่ใน `src/lib/stats` ใช้ทั้งสองฝั่ง
- **รูป `ExerciseBests`** (ตัวจริงใน `src/lib/stats/bests.ts` · บันทึก 2026-11-24): `max_weight_kg` · `max_reps` (เฉพาะ `reps_only`) · `reps_at_weight[]` (frontier · `assisted` ใช้น้ำหนักช่วย ทิศ ≤ · `bodyweight_plus` ใช้น้ำหนักถ่วง null = 0) · `max_extra_weight_kg` · `min_assist_kg` · `max_duration_s` · `duration_at_weight[]` (`weight_duration`) · `max_distance_m` · `best_pace_s_per_km` (เฉพาะเซ็ต ≥ 1 km) · `duration_at_incline[]` (frontier) · สร้างจากเซ็ต `normal` เท่านั้น · `last_sets` รวมวอร์มอัพ (ไคลเอนต์ข้ามเอง)

| ชนิด | ตัวที่ฉลอง (ทิศทาง) |
|---|---|
| `weight_reps` external | น้ำหนักสูงสุด ↑ · ครั้งมากสุดที่น้ำหนัก ≥ เดิม ↑ |
| `weight_reps` bodyweight_plus | ครั้งมากสุดที่น้ำหนักถ่วง ≥ เดิม ↑ · น้ำหนักถ่วงสูงสุด ↑ (> 0) |
| `weight_reps` assisted | น้ำหนักช่วยน้อยสุด ↓ · ครั้งมากสุดที่ช่วย ≤ เดิม ↑ |
| `reps_only` / `duration` | ครั้ง ↑ / เวลา ↑ |
| `distance_duration` | ระยะ ↑ · เวลา ↑ · เพซ ↓ (ระยะ ≥ 1 km) |
| `weight_duration` | น้ำหนัก ↑ · เวลามากสุดที่น้ำหนัก ≥ เดิม ↑ |
| `incline_speed_duration` | เวลามากสุดที่ความชัน ≥ เดิม ↑ |

### 5. การลบบัญชี

ลบ `user` แถวเดียว → cascade ทุกตาราง (ตาม FK ข้างบน) + ลบ `verification`/`auth_throttle` ด้วยอีเมล/hash ใน transaction เดียวกัน (ADR 0002) · ก่อนลบ `user` ตั้ง `invite_code.label = '—'` ของโค้ดที่บัญชีใช้สมัคร (R1.5 · ป้ายอาจระบุตัวผู้สมัคร · ADR 0002 ข้อ 7 · ADR 0007 ข้อ 3) — แถว `invite_code` ไม่มี `user_id` จึงไม่อยู่ในเกตเทสต์ข้างล่าง ต้องมีเทสต์ของตัวเอง · **เกตเทสต์**: วนทุกตารางใน schema ที่มีคอลัมน์ `user_id` หรือ `owner_user_id` อัตโนมัติ แล้วยืนยันว่าเหลือ 0 แถว → ตารางใหม่ในอนาคตถูกตรวจเองโดยไม่ต้องแก้เทสต์ · ข้อมูลใน backup ของผู้ให้บริการยังอยู่จนหมดอายุ (ต้องเขียนไว้ในประกาศความเป็นส่วนตัว)

### 6. ไม่ปิดทาง P2 (ทุกข้อเป็น migration แบบเพิ่ม)

RPE → `set_record.rpe` · drop set → เพิ่มค่าใน `set_kind` · superset → `session_exercise.superset_group` · อาหาร → ตาราง `food_entry` ใหม่ที่มีคอลัมน์ร่วม · รูปความคืบหน้า → ตารางใหม่ + ที่เก็บไฟล์ (ต้องมี ADR) · ไม่สร้างคอลัมน์เหล่านี้ล่วงหน้า

## ผลที่ตามมา

- ง่ายขึ้น: สถิติถูกเสมอหลังแก้/ลบ · ประวัติไม่เปลี่ยนเมื่อแก้ท่า · ฐานข้อมูลเองกันการผูกข้อมูลข้ามผู้ใช้ · เพิ่ม P2 ได้โดยไม่รื้อ
- ยากขึ้น: ทุก query ต้องกรอง `deleted_at` (ให้ repository ใน `src/lib/data/server` ทำที่เดียว) · ค่าที่มีหน่วยมี 3 คอลัมน์ · คำนวณสถิติสดต้องมี index ถูกต้อง
- ต้องทำตาม: เพิ่ม track_type ใหม่ = แก้ registry + migration ปรับ CHECK + เทสต์ฟอร์ม/สถิติ · contract ทุกรอบที่สร้างตารางต้องอ้างตารางในข้อ 3

## สิ่งที่ยังไม่รู้ / ต้องตัดสินภายหลัง (แก้ง่าย)

| เรื่อง | ใคร | เมื่อไร |
|---|---|---|
| ถามอายุเป็นปีเกิด (UX ข้อ 5.4) — โมเดลเก็บ `birth_year` ไม่ว่าจอจะถามแบบไหน | boss | ก่อน R1 |
| หน่วยเป็นชุดหรือแยก (UX ข้อ 5.5) — `profile` เก็บแยก 3 คอลัมน์จึงรองรับทั้งสองแบบ | boss | ก่อน R1 |
| ~~ช่วงค่าที่ยอมรับ · กติกาเพซ~~ ตัดสินแล้วในข้อ 3.2 และ 4 (R3 contract D3 D4) · เริ่มสัปดาห์วันจันทร์ไหม | Lead ใน contract | R5 |
| เวลาตอบของการคำนวณสถิติสดเมื่อข้อมูลหลักแสนแถว | platform วัด | R3 / R5 |

## บันทึกการแก้ไข

| วันที่ | สิ่งที่แก้ | เหตุผล | เปลี่ยนการตัดสินใจไหม |
|---|---|---|---|
| 2026-11-17 | ข้อ 3 แถวตาราง Better Auth: ชื่อ `rate_limit`, ไม่ใช้ CLI, `invite_code_id` มาใน R1 | ให้ตรงกับ migration แรกที่ทำจริงใน R0 (spike S2) | ไม่ |
| 2026-11-18 | `auth_throttle`: เพิ่มรูปแบบ key `invite-ip:<sha256(ip)>` | `/api/invite/check` ไม่ผ่าน limiter ของ Better Auth ต้องจำกัดต่อ IP เอง (ADR 0002 บันทึกการแก้ไข 2026-11-18) · ไม่เปลี่ยนคอลัมน์ | ไม่ |
| 2026-11-20 | ข้อ 3: เพิ่มตาราง `app_admin` (R1.5) · `auth_throttle` เพิ่มรูปแบบ key `admin-invite:<sha256(userId)>` · ไม่เพิ่ม `invite_code.created_by` | R1.5 contract D1 ที่ boss อนุมัติ · ADR 0007 · `app_admin` มี `user_id` จึงถูกเกตเทสต์ลบบัญชี (ข้อ 5) ตรวจเอง | ไม่ — ตารางเพิ่มแบบ migration ใหม่ กติกาข้อ 1 คงเดิม |
| 2026-11-20 | ข้อ 3 แถว `invite_code` + ข้อ 5: ลบบัญชีล้าง `label` ของโค้ดที่บัญชีใช้สมัครเป็น `—` | security-privacy M1 · boss เลือกทาง ก. 2026-11-20 · ไม่มี migration (`label` ยัง NOT NULL) | ใช่ บางส่วน — เพิ่มขั้นในการลบบัญชี โครงตารางไม่เปลี่ยน |
| 2026-11-23 | ข้อ 3: แถว `exercise` ชี้ไปข้อ 3.1 ใหม่ (ชนิด, CHECK หมวด 11 ค่า/อุปกรณ์ 8 ค่า, CHECK แถวคลัง, `client_updated_at` ของคลัง, คลังไม่ลบ) · index เป็น `(owner_user_id, updated_at)` · จำนวนสูงสุดต่อคน (ท่า 300 · สถานที่ 30) | R2 contract ที่ boss อนุมัติ 2026-11-23 (D7 D8 D9) · ADR 0008 | ไม่ — รายละเอียดของตารางที่วางไว้แล้ว กติกาข้อ 1–2 คงเดิม |
| 2026-11-24 | ข้อ 3.2 ใหม่: ชนิด/CHECK ของ 3 ตาราง R3 · สำเนาท่าคัดลอกที่เซิร์ฟเวอร์ · SI คำนวณที่เซิร์ฟเวอร์ · `session_id`/`session_exercise_id` เปลี่ยนไม่ได้ · ช่วงค่า D4 (ตรวจที่ `_input` ตาม `_unit` · ระยะไม่รับ `m` ใน R3) · เซสชัน ≤ 24 ชม. · เพดาน D9 · ข้อ 4: กติกาสถิติ D3 (ฐานเทียบ, เซสชันแรก, ฉลอง ≤ 1, "≥ เดิม", เพซ ≥ 1 km, `bests` จากเซสชันที่จบ + frontier) | R3 contract ที่ boss อนุมัติ 2026-11-24 (D2 D3 D4 D9) | ไม่ — รายละเอียดของตารางที่วางไว้ในข้อ 3 · กติกาข้อ 1–2 คงเดิม · ข้อ 4 แทนค่าเริ่มที่ระบุว่า "ปรับใน R3 ได้" |
