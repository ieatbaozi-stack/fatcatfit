# HANDOFF — งานที่แบ่งให้เครื่องมืออื่น (Antigravity ฯลฯ)

> boss ตัดสิน 2026-11-24: แบ่งงานเล็กไปทำใน Antigravity เพื่อลดภาระ usage ของ Claude Code · Claude Code (Lead) ยังเป็นคนตรวจและเปิด PR ทุกงาน · กติกาการทำงานอยู่ใน [AGENTS.md](../AGENTS.md)

## สถานะตอนนี้ (Lead อัปเดตเมื่อสถานะเปลี่ยน)

- รุ่นล่าสุดบน production: **v0.5.0** (R2 คลังท่า · CR3 ลิงก์ Google Maps + ลบสถานที่)
- **กำลังทำ: R3a จดการออกกำลังกาย** บน branch `r3a-logging` ใน Claude Code (contract: [R3_LOGGING_CONTRACT.md](../R3_LOGGING_CONTRACT.md)) — **ห้ามแตะ branch นี้และไฟล์ที่ R3a กำลังเปลี่ยน** (ดูรายการ "ห้ามแตะ")
- ถัดไป: R3b (ประวัติ แก้ย้อนหลัง ตั้งหน่วย/เวลาพัก) → R4 เทมเพลต/ร่างกาย → R5 ความคืบหน้า → R6 พร้อมเปิดใช้

## งานที่ทำใน Antigravity ได้

- แก้บั๊กเล็กที่ทำซ้ำได้ชัด ในหน้าจอที่ **merge เข้า main แล้ว** (welcome/สมัคร/OTP, หน้าฉัน, ออกโค้ดเชิญ, คลังท่า, สถานที่, เครดิต)
- ปรับ UI เล็ก: ระยะห่าง สี ขนาดตัวอักษร การจัดวาง คำในปุ่ม/ข้อความ TH/EN — **ต้องตรง [DESIGN.md](design/DESIGN.md)** (ส้ม `#F9A03A` ใช้ไม่เกิน 1 จุดต่อจอ · ปุ่มแตะ ≥ 44px · คอนทราสต์ ≥ 4.5:1 · ฟอนต์ Noto Sans Thai / Gaegu เฉพาะอังกฤษ · ข้อความต้องมีทั้ง `messages/th.json` และ `messages/en.json`)
- แก้คำผิด/ชื่อไทยของท่าใน `content/exercises/*.json` (ช่อง `name_th`, `search_terms` เท่านั้น · รัน `npm run catalog:check` ด้วย)
- เอกสาร: แก้คำ อธิบายโค้ด ตอบคำถาม

## ห้ามแตะ (ส่งกลับให้ Claude Code)

- ฟีเจอร์ใหม่ทุกชนิด (ต้องมี contract ที่ boss อนุมัติก่อน)
- **ระหว่าง R3a ยังไม่ merge:** `src/lib/offline/**` · `src/pwa/**` · `src/lib/stats/**` · `src/lib/data/**` · `src/app/(app)/log/**` · `src/components/{log,sync,catalog,places}/**` · `src/app/(app)/me/exercises/**` · `drizzle/**` · `src/db/**` — งานในพื้นที่นี้จะชนกับ R3a
- บัญชี การเข้าสู่ระบบ ข้อมูลสุขภาพ สิทธิ์ข้อมูล (`src/lib/auth/**`, API ทั้งหมดใน `src/app/api/**`) — ต้องผ่าน security-privacy
- schema/migration · dependency ใหม่ (`package.json`) · CI (`.github/**`) · ค่าตั้ง service worker
- `CLAUDE.md` `TEAM.md` `PROCESS.md` contract ADR (เป็นของ Lead/architect)

## ส่งงานกลับ

1. งานอยู่บน branch `ag/<หัวข้อ>` ในโฟลเดอร์ worktree ของตัวเอง (วิธีสร้างใน AGENTS.md) · commit แล้ว ไม่ push
2. boss บอก Lead ในแชต Claude Code: "มีงาน antigravity ที่ branch ag/<หัวข้อ>"
3. Lead ตรวจ diff + รันเกตเอง (รวม e2e) → push + เปิด PR → boss กด merge
