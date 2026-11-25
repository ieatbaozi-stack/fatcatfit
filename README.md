# แมวอ้วนจะผอม (Fat Cat Fit)

เว็บแอปแบบติดตั้งได้ (PWA) สำหรับจดการออกกำลังกายบนมือถือ ทำใช้กันเองในกลุ่มเพื่อนกลุ่มเล็ก ไม่แสวงหากำไร

**สถานะ:** v0.5.2 (2026-11-25 · รอบ **CR4 / CR4.1** ปรับโฉม UI สไตล์ Studio Minimal + โหมดมืด Soft Charcoal · PR #22/#23 merged · ดู [CR4_UI_REVAMP_CONTRACT.md](CR4_UI_REVAMP_CONTRACT.md)) · **R3a จดการออกกำลังกาย** (เซสชัน, 6 ชนิดการจด, ออฟไลน์ + sync, ตัวจับเวลาพัก, สถิติ PR) ตรวจผ่าน รอ merge → **v0.6.0** (branch `r3a-logging` · ดู [R3_LOGGING_CONTRACT.md](R3_LOGGING_CONTRACT.md)) · ถัดไป: **R3b** แท็บประวัติ + ตั้งค่าหน่วย/เวลาพัก (`v0.7.0`) · v0.5.0 (2026-11-24 · รอบ **CR3** ปักหมุด Google Maps + ลบสถานที่ ปิดแล้ว · boss ทดสอบ production ผ่าน · ดู [CR3_PLACE_MAP_DELETE_CONTRACT.md](CR3_PLACE_MAP_DELETE_CONTRACT.md)) · v0.4.0 (2026-11-24 · รอบ **R2 คลังท่าออกกำลังกาย** ปิดแล้ว · boss ทดสอบ production ผ่าน · pull request #18 · ดู [R2_CATALOG_CONTRACT.md](R2_CATALOG_CONTRACT.md)) · v0.3.1 (2026-11-23 · รอบ CR2 ปิดแล้ว) · v0.3.0 (2026-11-23 · รอบ R1.5 ปิดแล้ว) · v0.2.1 (2026-11-20 · Google select_account) · v0.2.0 (2026-11-19 · รอบ R1 บัญชี) · ดูรายการเปลี่ยนแปลงที่ [CHANGELOG.md](CHANGELOG.md)

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/prd/PRD.md](docs/prd/PRD.md) | ความต้องการและขอบเขตของ v1 |
| [docs/design/DESIGN.md](docs/design/DESIGN.md) | แนวทางออกแบบ |
| [docs/design/UX.md](docs/design/UX.md) | flow ของหน้าจอ |
| [docs/adr/](docs/adr/) | การตัดสินใจทางเทคนิค |
| [TEAM.md](TEAM.md) · [PROCESS.md](PROCESS.md) | วิธีทำงานของทีม |
| [CHANGELOG.md](CHANGELOG.md) · [docs/VERSIONING.md](docs/VERSIONING.md) | รุ่นและการเปลี่ยนแปลง · กติกาเลขรุ่น |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | ขั้นตอนตั้งค่าและดูแลระบบ (สำหรับ boss) |
| [docs/reports/](docs/reports/) | รายงานประจำวันของทีม |

## สิทธิ์ในผลงาน

repo นี้เปิดให้อ่านได้ แต่ **ยังไม่ได้กำหนดสัญญาอนุญาต (license)** จึงสงวนสิทธิ์ทั้งหมด ทั้งโค้ด เอกสาร และภาพประกอบแมวใน `assets/` และ `docs/design/` — ห้ามนำไปใช้ซ้ำ ดัดแปลง หรือเผยแพร่ต่อโดยไม่ได้รับอนุญาตจากเจ้าของ

## รายงานปัญหาความปลอดภัย

ดู [SECURITY.md](SECURITY.md) — กรุณาอย่าเปิด issue สาธารณะสำหรับช่องโหว่
