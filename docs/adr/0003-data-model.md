# ADR 0003 — โมเดลข้อมูล: track_type, ตาราง, id, หน่วย, เวลา, สถิติ, การลบ

- สถานะ: **เสนอ — รอ boss อนุมัติ** · วันที่ 2026-11-15 · ผู้เขียน: architect
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

- **id**: UUID v4 ตัวเล็กมีขีด สร้างที่ไคลเอนต์ด้วย `crypto.randomUUID()` (เซิร์ฟเวอร์สร้างเองเฉพาะแถวที่ไม่ได้มาจากคิว) · เซิร์ฟเวอร์ตรวจรูปแบบ ไม่ตรงปฏิเสธ · ท่าในคลังมี UUID คงที่เขียนอยู่ในไฟล์ `content/exercises/**` (seed ซ้ำได้ id เดิม)
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
| `distance_duration` | – | – | ● | ● | – | – |
| `weight_duration` | ● | – | ● | – | – | – |
| `incline_speed_duration` | – | – | ● | ○ | ● | ● |

ทุกชนิด: `set_kind` ● (`normal` | `warmup`) · ระยะในหน้าลู่วิ่งและเพซเป็นค่าคำนวณ ไม่เก็บ · ช่วงค่าที่ยอมรับกำหนดใน contract R3 · UX ข้อ 5.6 (บังคับทั้งระยะและเวลา) เปลี่ยนได้โดยแก้ไฟล์นี้ ไม่ต้อง migrate

**แฟลกของท่า** (ที่ตาราง `exercise`): `load_mode` = `external` | `bodyweight_plus` | `assisted` (ไม่ใช่ `external` ได้เฉพาะ `weight_reps`) · `is_unilateral` boolean (แสดงป้าย "ข้างละ" ค่าเก็บเป็นต่อข้าง ไม่คูณ 2) · **`track_type` และ `load_mode` ล็อกเมื่อท่ามีเซ็ตแล้ว** (เซิร์ฟเวอร์ปฏิเสธ `exercise_has_history` และสคริปต์ seed ปฏิเสธการเปลี่ยนท่าในคลังที่มีประวัติ) · `is_unilateral` แก้ได้

### 3. ตารางของ v1

| ตาราง | รอบ | คอลัมน์หลัก (นอกจากคอลัมน์ร่วม) | ความสัมพันธ์ |
|---|---|---|---|
| `user` `session` `account` `verification` `rateLimit` | R0* | สร้างโดย Better Auth CLI · `user` เพิ่ม `invite_code_id` | `session`/`account` → `user` CASCADE |
| `invite_code` | R1 | `code_hash` UNIQUE · `label` · `max_uses` · `uses_count` · `expires_at` · `revoked_at` · `created_at` | `user.invite_code_id` → นี่ ON DELETE SET NULL · ไม่มี `user_id` |
| `auth_throttle` | R1 | `key` PK (`otp-email:<sha256>` / `otp-day:<YYYY-MM-DD>`) · `window_started_at` · `count` · `expires_at` | ไม่ผูกผู้ใช้ · ลบด้วย hash ตอนลบบัญชี |
| `consent_record` | R1 | `notice_version` · `accepted_at` · `locale` (ไม่มีคอลัมน์ sync) | → `user` CASCADE |
| `profile` | R1 | PK = `user_id` · `locale` · `weight_unit` `length_unit` `distance_unit` · `theme` · `rest_seconds` (90) · `birth_year` · `height_m/_input/_unit` · `goals` (JSON array) · `experience` · `onboarded_at` · `client_updated_at` | 1:1 `user` CASCADE |
| `place` | R1 | `name` · `last_used_at` · `archived_at` | → `user` |
| `body_entry` | R1 (น้ำหนัก) · R4 (ที่เหลือ) | `measured_at` · `local_date` · `weight_kg/_input/_unit` ● · R4: `body_fat_pct` · `muscle_kg/_input` (ใช้ `weight_unit` เดียวกัน) | → `user` · วันละหลายแถวได้ กราฟใช้แถวล่าสุดของวัน |
| `body_measurement` | R4 | `body_entry_id` · `site` (`waist` `chest` `hip` `arm` `thigh` `neck` — เพิ่มได้ด้วย CHECK) · `value_m/_input/_unit` | composite → `body_entry` CASCADE |
| `exercise` | R2 | `owner_user_id` (null = คลังกลาง) · `name` (อังกฤษสำหรับคลัง / ที่ผู้ใช้พิมพ์สำหรับท่าเอง) · `name_th` · `search_terms` · `track_type` · `load_mode` · `is_unilateral` · `category` · `equipment` · `source_dataset` `source_ref` `license` `attribution` · `met` · `archived_at` | ท่าเอง → `user` CASCADE · คลังกลางไม่มีเจ้าของ |
| `workout_session` | R3 | `place_id` · `started_at` · `ended_at` (null = ยังเล่นอยู่) · `local_date` · `time_zone` · `template_id` (อ้างอิงเฉยๆ ไม่มี FK) | `place_id` composite → `place` |
| `session_exercise` | R3 | `session_id` · `exercise_id` (เปลี่ยนไม่ได้) · `position` · **สำเนา ณ ตอนบันทึก**: `exercise_name` `exercise_name_th` `track_type` `load_mode` | composite → `workout_session` CASCADE · `exercise_id` → `exercise` (NO ACTION) |
| `set_record` | R3 | `session_exercise_id` · `position` · `set_kind` · `completed_at` · `weight_kg/_input/_unit` · `reps` · `duration_s` · `distance_m/_input/_unit` · `speed_mps/_input/_unit` · `incline_pct` | composite → `session_exercise` CASCADE |
| `workout_template` | R4 | `name` · `last_used_at` | → `user` |
| `template_exercise` | R4 | `template_id` · `exercise_id` · `position` · `set_count` | composite → `workout_template` CASCADE |

\* R0 สร้างตาราง Better Auth เป็น migration แรกเพื่อพิสูจน์ pipeline + spike (ADR 0001) ถ้า Lead อยากให้ R0 เล็กลงย้ายไป R1 ได้ · `body_entry` ต้องมีใน R1 เพราะแบบสอบถามบังคับน้ำหนัก (PROCESS เดิมวางไว้ R4)

Index หลัก: `(user_id, updated_at)` ทุกตาราง sync · `session_exercise(user_id, exercise_id)` · `workout_session(user_id, local_date)` · `set_record(session_exercise_id, position)` · `exercise(owner_user_id)`

**กติกาการเปลี่ยนแปลง**: ท่าเอง/สถานที่/เทมเพลตลบ = tombstone · ท่าเองที่มีประวัติลบไม่ได้ → `archived_at` · ท่าในคลังไม่เคยลบ (เลิกใช้ = `archived_at`) · ลบเซสชัน = tombstone เซสชัน + ลูกทั้งหมดใน transaction เดียว · ลำดับซ้ำกันได้ (สองเครื่อง) เรียงด้วย `position, completed_at, id`

### 4. สถิติ (PR) — คำนวณ ไม่เก็บ

- นิยามอยู่ในฟังก์ชันบริสุทธิ์ `src/lib/stats/**` ใช้ร่วมไคลเอนต์/เซิร์ฟเวอร์ · ไม่นับ `warmup` และแถวที่มี `deleted_at`
- **เมื่อไร**: (1) ไคลเอนต์ตอนกด ✓ เทียบกับ "สถิติดีสุดต่อท่า" ใน snapshot + เซ็ตที่ยังค้างในคิว → แสดงทันทีแม้ออฟไลน์ (2) เซิร์ฟเวอร์คำนวณสด ตอนสร้าง `/api/bootstrap` และ endpoint กราฟ → แก้/ลบเซ็ตแล้วสถิติถูกเองโดยไม่มีงานคำนวณใหม่
- เซ็ตเป็น PR เมื่อค่าชนะทุกเซ็ตก่อนหน้า (ตาม `completed_at`) ของท่าเดียวกัน · ครั้งแรกที่ทำท่านั้นไม่ฉลอง (ค่าเริ่ม ปรับใน R3 ได้)

| ชนิด | ตัววัด (ทิศทาง) |
|---|---|
| `weight_reps` external | น้ำหนักสูงสุด ↑ · ครั้งสูงสุดที่น้ำหนัก ≥ เดิม ↑ · ปริมาณต่อเซสชัน Σ น้ำหนัก×ครั้ง ↑ |
| bodyweight_plus / assisted | ครั้งสูงสุด ↑ · น้ำหนักเพิ่มสูงสุด ↑ / น้ำหนักช่วยน้อยสุด ↓ |
| `reps_only` / `duration` | ครั้ง ↑ / เวลา ↑ |
| `distance_duration` | ระยะ ↑ · เพซ ↓ (กติกาเทียบเพซกำหนดใน R3) |
| `weight_duration` / `incline_speed_duration` | น้ำหนัก ↑ เวลา ↑ / เวลาที่ความชัน ≥ เดิม ↑ |

### 5. การลบบัญชี

ลบ `user` แถวเดียว → cascade ทุกตาราง (ตาม FK ข้างบน) + ลบ `verification`/`auth_throttle` ด้วยอีเมล/hash ใน transaction เดียวกัน (ADR 0002) · **เกตเทสต์**: วนทุกตารางใน schema ที่มีคอลัมน์ `user_id` หรือ `owner_user_id` อัตโนมัติ แล้วยืนยันว่าเหลือ 0 แถว → ตารางใหม่ในอนาคตถูกตรวจเองโดยไม่ต้องแก้เทสต์ · ข้อมูลใน backup ของผู้ให้บริการยังอยู่จนหมดอายุ (ต้องเขียนไว้ในประกาศความเป็นส่วนตัว)

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
| ช่วงค่าที่ยอมรับ · กติกาเพซ · เริ่มสัปดาห์วันจันทร์ไหม | Lead ใน contract | R3 / R5 |
| เวลาตอบของการคำนวณสถิติสดเมื่อข้อมูลหลักแสนแถว | platform วัด | R3 / R5 |
