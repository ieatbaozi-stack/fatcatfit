# แหล่งข้อมูลคลังท่า (R2)

ไฟล์คลังที่ seed และสคริปต์ตรวจอ่าน: `free-exercise-db.json` · `fatcatfit.json` · (`overrides.json` = รายการยกเว้นจากกติกาแมป ไม่ใช่ไฟล์คลัง)
โครงสร้างไฟล์: อ็อบเจ็กต์ meta (`source_dataset` `license` `attribution` `upstream_commit` `upstream_url`) + `exercises[]` หนึ่งท่าต่อบรรทัด · meta ถูกคัดลอกลงทุกแถวในฐานข้อมูลตอน seed

## ชุดข้อมูล

| ชุด | `source_dataset` | ใบอนุญาต | commit ที่ล็อก | จำนวนแถว |
|---|---|---|---|---|
| free-exercise-db (https://github.com/yuhonas/free-exercise-db) | `free-exercise-db` | Unlicense (สาธารณสมบัติ) | `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` (push 2026-09-27) | 876 |
| ทีมเขียนเอง (คาร์ดิโอ/กีฬา ชื่อกิจกรรมทั่วไป) | `fatcatfit` | `original` | — | ดูผลสคริปต์ตรวจ |

- นำมาเฉพาะ `id` (→ `source_ref`) `name` และค่าที่ใช้แมป (`category` `equipment` `force` `primaryMuscles[0]` — ไม่เก็บ) · **ไม่นำ `instructions` `images`** (ADR 0008 ข้อ 1) · สคริปต์ตรวจปฏิเสธไฟล์ที่มีช่องเหล่านี้
- ค่า enum ของต้นทางตรวจกับ `schema.json` ที่ commit เดียวกันแล้ว (7 หมวด · 12 อุปกรณ์ · 17 กล้ามเนื้อ ตรงกับที่ ADR 0008 ข้อ 4 อ้าง) · สคริปต์แปลงล้มถ้าเจอค่านอกชุดนี้
- ใบอนุญาตตรวจจาก `LICENSE.md` ที่ commit ที่ล็อกจริง — ดู `docs/content/LICENSES.md`
- ไม่ใช้ MET (`met` = null ทุกแถว · contract D4 ก)

## วิธีอัปรุ่น / สร้างไฟล์ใหม่

1. ดึงเฉพาะ `dist/exercises.json` จาก repo ทางการที่ commit ที่ต้องการ ไปไว้นอก repo (เช่นโฟลเดอร์ชั่วคราว) — ห้ามรันโค้ดในนั้น
2. `npx tsx scripts/seed-convert.ts <path>/exercises.json --commit <sha 40 ตัว>` — แถวเดิมจับด้วย `source_ref` คง `id` `name_th` `search_terms` (แก้มือในไฟล์คลังได้) · คำนวณหมวด/อุปกรณ์/track_type ใหม่ + `overrides.json`
3. `npx tsx scripts/seed-check.ts` ต้องผ่าน แล้วรัน `npx tsx scripts/seed-exercises.ts` (ฐาน dev) — รันซ้ำต้องได้ "เปลี่ยน 0 แถว"

## กติกา id

UUID v4 สุ่มครั้งเดียวต่อแถว เขียนลงไฟล์ **ห้ามเปลี่ยน** (ประวัติใน R3 อ้างถึง) · แถวที่หายจากไฟล์ = seed ตั้ง `archived_at` ไม่ลบ
