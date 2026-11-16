# ทีม AI ของ แมวอ้วนจะผอม (Fat Cat Fit)

> เจ้าของงาน: **boss** · ทีมเป็น **บทบาท** ไม่ใช่คน — Lead เรียก agent ตามงานแต่ละรอบ
> นิยาม agent ที่ใช้งานจริงอยู่ใน [.claude/agents/](.claude/agents/) (ไฟล์ละบทบาท กำหนด model ไว้ในไฟล์) · กระบวนการ: [PROCESS.md](PROCESS.md) · ความต้องการ: [docs/prd/PRD.md](docs/prd/PRD.md)
> ปรับจากร่างก่อนเริ่มโปรเจกต์: 15 บทบาท → **12 บทบาท** (ยุบ 3 ที่หน้าที่ซ้ำ)

## สิ่งที่ยุบและเหตุผล

| บทบาทเดิม | ไปอยู่ที่ | เหตุผล |
|---|---|---|
| Full-stack | Platform / Front-end ตามไฟล์ที่แตะ | ไม่มีขอบเขตไฟล์ของตัวเอง ทำให้กติกา "แตะเฉพาะไฟล์ของตน" ใช้ไม่ได้ |
| Release engineer | รวมกับ OPS → **OPS & Release** | งานออกรุ่นมีน้อย และผูกกับ CI อยู่แล้ว |
| TEST | รวมกับ QA → **QA & Test** | คนเขียนโค้ดเขียน unit test ของตัวเองอยู่แล้ว (กติกาข้อ 2) ส่วนเทสต์ end-to-end ให้คนตรวจอิสระเขียนจากเกณฑ์ใน contract จะจับของหลุดได้ดีกว่า |

## บทบาท

ลำดับความสำคัญ: **แกน** = ใช้ทุกรอบที่มีโค้ด · **เฉพาะทาง** = เรียกตามรอบ · **สนับสนุน** = เรียกเมื่อมีเหตุ

| # | บทบาท | agent | model | หน้าที่ | ไฟล์ที่ดูแล | ใช้เมื่อ |
|---|---|---|---|---|---|---|
| 1 | หัวหน้าทีม / Lead | (เซสชันหลัก) | **Fable** | รับโจทย์จาก boss, เขียน PRD + contract, แบ่งงาน, รวมงาน, ทดสอบซ้ำ, เสนอเลขเวอร์ชัน · **ไม่เขียนโค้ดฟีเจอร์เอง** | `*_CONTRACT.md`, `docs/prd/**`, `TEAM.md`, `PROCESS.md`, `CLAUDE.md` | แกน |
| 2 | หลังบ้าน / Platform | `platform` | Sonnet | schema, migration, API, data layer, สถิติ/PR, auth | `src/db/**`, `drizzle/**`, `src/lib/{data,stats,auth}/**`, `src/app/api/**` | แกน |
| 3 | หน้าบ้าน / Front-end | `frontend` | Sonnet | หน้าจอ, ฟอร์มจดตาม track_type, กราฟ, TH/EN, นำภาพแมวไปใช้ | `src/app/**` (ไม่รวม `api`), `src/components/**` (ไม่รวม `doodle`), `src/lib/i18n/**`, `messages/**` | แกน |
| 4 | ตรวจอิสระ & ทดสอบ / QA & Test | `qa-test` | **Opus** | ตรวจงานจากเกณฑ์ใน contract, ใช้งานจริงบนจอมือถือ, เขียนเทสต์ end-to-end, แก้บั๊กที่เจอ (commit `qa:`) | `tests/e2e/**`, `playwright.config.ts` + แก้ได้ทุกไฟล์ที่พบปัญหา | แกน (ท้ายทุกรอบ) |
| 5 | สถาปนิก / Architect | `architect` | **Opus** | โมเดลข้อมูล, ADR, กลยุทธ์ออฟไลน์, แผนเฟส | `docs/adr/**`, `docs/design/ARCHITECTURE.md` | เฉพาะทาง: ก่อนเขียนโค้ด และก่อนรื้อใหญ่ |
| 6 | ออกแบบ / UX & Brand | `ux-brand` | **Opus** | flow บนมือถือ, wireframe, design token, ชุดภาพแมว | `docs/design/**`, `src/components/doodle/**`, `assets/stickers/**`, `scripts/export-stickers.mjs`, `scripts/sprites/**` | เฉพาะทาง: ก่อนงานหน้าจอ |
| 7 | PWA & ออฟไลน์ | `pwa-offline` | **Opus** | manifest, service worker, คิวเขียนออฟไลน์, sync แบบไม่ซ้ำ, ตัวจับเวลาที่ทนจอดับ | `src/pwa/**`, `src/lib/offline/**`, `public/sw*`, `public/manifest*` | เฉพาะทาง: R0 (โครง), R3 |
| 8 | ความปลอดภัย & ความเป็นส่วนตัว | `security-privacy` | **Opus** | ตรวจ auth/OTP/session, rate limit, สิทธิ์เข้าถึงข้อมูล, consent/ลบ/ส่งออก (PDPA) | แก้ได้ในไฟล์ auth/privacy + เทสต์ที่เกี่ยว | เฉพาะทาง: ทุกรอบที่แตะบัญชีหรือข้อมูลสุขภาพ |
| 9 | คลังท่า & ภาษา / Catalog | `catalog` | Sonnet | นำเข้า/จัดรูปชุดข้อมูลท่า, ใบอนุญาต/เครดิต, ชื่อไทย, ค่า MET | `content/exercises/**`, `scripts/seed*.ts`, `docs/content/**` | เฉพาะทาง: R2 |
| 10 | ระบบดูแล & ออกรุ่น / OPS & Release | `ops-release` | Sonnet | CI, health check, security headers, อีเมล OTP, backup, SemVer + CHANGELOG + สคริปต์ release | `.github/**`, `next.config.ts`, `docs/OPERATIONS.md`, `docs/VERSIONING.md`, `CHANGELOG.md`, `scripts/release*.ts` | เฉพาะทาง: R0, R1, R6 และเมื่อออกรุ่น |
| 11 | นักค้นคว้า / Researcher | `researcher` | Sonnet | ค้นข้อมูลภายนอก: ลิมิต/ราคาผู้ให้บริการ, เอกสารไลบรารี, ใบอนุญาต | `docs/research/**` | สนับสนุน: ก่อนตัดสินใจที่ต้องพึ่งข้อมูลภายนอก |
| 12 | เลขา / Secretary | `secretary` | Haiku | รายงานประจำวัน · **ไม่เขียนโค้ด** | `docs/reports/**` | สนับสนุน: หลังงานใหญ่ และวันละครั้งที่มี commit |

## หลักการเลือก model

| model | ใช้กับ | เหตุผล |
|---|---|---|
| **Fable** | Lead | ตัดสินใจข้ามทั้งระบบ แตกงาน และรวมงาน — ผิดตรงนี้ทุกบทบาทผิดตาม |
| **Opus** | Architect, UX & Brand, PWA & ออฟไลน์, QA & Test, Security & Privacy | งานออกแบบที่แก้ทีหลังแพง · โค้ดที่เสี่ยงข้อมูลหาย/ซ้ำ · งานตรวจ ซึ่งต้องจับสิ่งที่คนเขียนมองไม่เห็น จึงไม่ควรใช้ model ที่อ่อนกว่าคนเขียน |
| **Sonnet** | Platform, Front-end, Catalog, OPS & Release, Researcher | งานเขียนโค้ดตามสัญญาที่ชัดเจน มีเทสต์และคนตรวจรองรับ — เร็วและคุ้มกว่า |
| **Haiku** | Secretary | สรุปจาก git log และผลเทสต์ ไม่ต้องตัดสินใจ |

ปรับได้: ถ้างานของ Sonnet ถูก QA ตีกลับ 2 รอบติดในเรื่องเดียวกัน ให้ Lead ยกงานนั้นให้ Opus แทนการวนซ้ำ

## ข้อตกลงเรื่องไฟล์ที่ใช้ร่วม

- เจ้าของไฟล์ที่เพิ่มตาม ARCHITECTURE.md: `src/lib/email/**` และ `vercel.json` → OPS & Release · `scripts/invite.ts`, `scripts/db-*.ts`, `drizzle.config.ts` → Platform · `src/app/serwist/**` → PWA & ออฟไลน์ (มีเฉพาะถ้า spike เลือกทางนั้น)
- `src/lib/data/shared/**` และ `src/lib/stats/**` — เจ้าของคือ Platform · Front-end และ PWA import ได้ แก้ไม่ได้
- `next.config.ts` — เจ้าของคือ OPS & Release · PWA และ Front-end ขอแก้ผ่าน Lead (ระบุใน contract ของรอบ)
- `src/components/doodle/**` — เจ้าของคือ UX & Brand · Front-end นำไปใช้ได้ แก้ไม่ได้
- `package.json` / lockfile — ใครเพิ่ม dependency ต้องระบุใน contract และให้ Lead เป็นคนรวม
- ภาพแมว: ต้นฉบับอยู่ที่ `docs/design/samples.html` ที่เดียว → รัน `node scripts/export-stickers.mjs` เพื่อสร้าง `assets/stickers/` ใหม่

ถ้าต้องมีบทบาทใหม่ Lead เพิ่มแถวในตารางนี้และสร้างไฟล์ใน `.claude/agents/` ก่อนเริ่มงาน
