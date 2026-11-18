# R0_FOUNDATION_CONTRACT.md

> ร่าง 1 · 2026-11-16 · ผู้เขียน: Lead · สถานะ: **boss อนุมัติแล้ว 2026-11-16** · ฐานข้อมูล Neon ชุด `dev` สร้างแล้ว และ `.env.local` ชี้ไปที่ `dev`
> อ้างอิง: [PRD](docs/prd/PRD.md) · [ARCHITECTURE](docs/design/ARCHITECTURE.md) · ADR [0001](docs/adr/0001-database-and-hosting.md) [0002](docs/adr/0002-auth.md) [0003](docs/adr/0003-data-model.md) [0004](docs/adr/0004-offline-sync.md) · [DESIGN](docs/design/DESIGN.md) · [UX](docs/design/UX.md) · [PROCESS](PROCESS.md) · [TEAM](TEAM.md)
> branch: `r0-foundation`

## เป้าหมาย

วางฐานของโปรเจกต์ให้รอบ R1–R5 เขียนฟีเจอร์ได้โดยไม่ต้องกลับมารื้อ: โครงแอปที่ build และ deploy ได้ เกตอัตโนมัติครบ และคำตอบของคำถามทางเทคนิคที่ ADR ยังค้างไว้

R0 **ไม่มี user story ที่ผู้ใช้เห็น** — ผลลัพธ์คือแอปเปล่าที่ติดตั้งลงมือถือได้ มีแถบล่าง 4 แท็บ สลับสว่าง/มืด และ TH/EN ได้ มีแมวขยับ และเปิดได้ตอนไม่มีเน็ต

## ขอบเขต

| ทำ | ไม่ทำ (รอบอื่น) |
|---|---|
| โครง Next.js + TypeScript + Tailwind + ESLint | หน้าจอฟีเจอร์ใดๆ (R1 เป็นต้นไป) |
| ฐานข้อมูล: ตัวเชื่อมต่อ, migration แรก (ตารางของ Better Auth), เทสต์บน Postgres ชั่วคราว | การเข้าสู่ระบบ โค้ดเชิญ consent (R1) |
| `GET /api/health` | ตารางของแอป เช่น place, exercise, session (R1–R4) |
| design token, ฟอนต์, โหมดสว่าง/มืด, component พื้นฐาน, แถบล่าง 4 แท็บพร้อมหน้าว่าง | คิวออฟไลน์และ sync (R3) |
| TH/EN + เทสต์ key ครบ | แบนเนอร์สอนติดตั้งบน iOS (R6) |
| ภาพแมวเป็น React component | push แจ้งเตือน (หลัง v1) |
| manifest + service worker + เปิดแอปได้ตอนออฟไลน์ | |
| CI, security headers, `.env.example`, ระบบออกรุ่น, เอกสารตั้งค่า | |
| spike 6 เรื่อง (ดูด้านล่าง) + ADR 0005 | |

## Spike (ต้องมีคำตอบก่อนปิดรอบ)

| # | คำถาม | ใคร | เกณฑ์ / ผลที่ต้องส่ง |
|---|---|---|---|
| S1 | PGlite ใช้กับ Drizzle 0.45.x และ migration จริงได้ไหม | platform | ได้ → ใช้เป็นฐานข้อมูลของเทสต์ · ไม่ได้ → ใช้ Postgres container ใน CI และแจ้ง Lead |
| S2 | Better Auth CLI สร้าง `user.id` เป็น uuid และ schema ผ่านกติกาชนิดข้อมูลของ ADR 0001 ไหม | platform | migration แรกผ่านกติกา หรือรายการจุดที่ต้องยกเว้นพร้อมเหตุผล |
| S3 | เวลาตอบของ `/api/health` จาก Vercel `sin1` ไป Neon: ครั้งแรกหลังฐานข้อมูลหลับ และครั้งถัดไป เทียบ driver `node-postgres` กับ `neon-serverless` | platform (หลัง deploy) | ตารางตัวเลขที่วัดจริงอย่างน้อย 5 รอบต่อกรณี + driver ที่เลือก |
| S4 | next-intl แบบไม่มี locale ใน URL ทำงานกับ Next 16.4 ไหม | frontend | ได้ หรือทางเลือกที่เสนอ |
| S5 | เครื่องมือ service worker: ลองตามลำดับ A → B → C ใน ADR 0004 ข้อ 1 ใช้ตัวแรกที่ผ่านเกณฑ์ 5 ข้อ | pwa-offline | รายงานผลแต่ละทางเลือก → architect เขียน `docs/adr/0005-service-worker-tool.md` |
| S6 | รุ่น Node ที่ Vercel รองรับ และวิธีรัน migration ตอน deploy | ops-release | ระบุใน `docs/OPERATIONS.md` พร้อมลิงก์เอกสารทางการ |

ผล spike ที่ทำให้ ADR ต้องเปลี่ยน: หยุดและรายงาน Lead ก่อนทำต่อ

## ความรับผิดชอบไฟล์

| บทบาท | งาน | ไฟล์ |
|---|---|---|
| **platform** | โครงโปรเจกต์และ `package.json` (ติดตั้ง dependency ของทุกบทบาทตาม ARCHITECTURE ข้อ 6 ในคราวเดียว) · script: `lint` `typecheck` `test` `test:e2e` `build` `db:generate` `db:migrate` · `src/db` (client, schema ของ Better Auth, sql-helpers) · migration แรก · ตั้ง Vitest + ฐานข้อมูลของเทสต์ · `GET /api/health` (query ฐานข้อมูล 1 ครั้ง) พร้อมเทสต์ · S1 S2 S3 | `package.json`, `tsconfig.json`, `drizzle.config.ts`, `vitest.config.ts`, `src/db/**`, `drizzle/**`, `src/app/api/health/**`, `scripts/db-*.ts` |
| **frontend** | layout หลัก + แถบล่าง 4 แท็บ (หน้าหลัก ประวัติ ความคืบหน้า ฉัน) เป็นหน้าว่างที่มีแมวและข้อความ · design token ใน Tailwind theme ตรงกับ DESIGN ข้อ 3 · ฟอนต์ Noto Sans Thai + Gaegu ผ่าน `next/font` · โหมดสว่าง/มืด (ตามระบบ + สลับเองได้ จำค่าไว้) · next-intl + `messages/th.json` `en.json` + เทสต์ key ครบ · component พื้นฐานตาม DESIGN ข้อ 7: ปุ่มหลัก ปุ่มรอง ชิป เส้นคั่นวาดมือ ปุ่ม ✓ ช่องตัวเลขพร้อม +/− · หน้า `/styleguide` แสดงทุก component ทั้งสองโหมด · S4 | `src/app/**` (ไม่รวม `api`), `src/components/**` (ไม่รวม `doodle`), `src/lib/i18n/**`, `messages/**` |
| **ux-brand** | ภาพแมวเป็น React component: SVG inline เส้นใช้ `currentColor` สีใช้ CSS variable โหมดมืดเป็นเส้นล้วน มี prop เปิด/ปิดดุ๊กดิ๊ก เคารพ reduced motion · อย่างน้อยทุกท่าที่ UX.md ข้อ 4 ใช้ · ไอคอนแอปทุกขนาดที่ manifest ต้องใช้ (รวม maskable และ apple-touch-icon) | `src/components/doodle/**`, `public/icons/**` |
| **pwa-offline** | S5 · manifest · service worker ตามกลยุทธ์ cache ใน ADR 0004 ข้อ 1 (`/api/**` ไม่ผ่าน cache) · การลงทะเบียน SW · เปิดแอปได้ตอนออฟไลน์หลังเคยเปิดออนไลน์ 1 ครั้ง · รุ่นใหม่มาถึงผู้ใช้ภายในการเปิดครั้งที่สอง | `src/pwa/**`, `public/manifest*`, `public/sw*`, `src/app/serwist/**` (ถ้าเลือกทาง A) |
| **ops-release** | CI: lint, typecheck, test, build, ตรวจ migration บนฐานข้อมูลว่าง, เทสต์ i18n — ตามกติกา repo สาธารณะใน CLAUDE.md · `vercel.json` ตั้ง `regions: ["sin1"]` · security headers · กฎ ESLint ขอบเขตโมดูลตาม ARCHITECTURE ข้อ 3 · `.env.example` · `CHANGELOG.md` + `docs/VERSIONING.md` + สคริปต์ release · `docs/OPERATIONS.md`: ขั้นตอนที่ boss ต้องทำเอง · S6 | `.github/**`, `vercel.json`, `next.config.ts`, `eslint.config.*`, `.env.example`, `CHANGELOG.md`, `docs/VERSIONING.md`, `docs/OPERATIONS.md`, `scripts/release*.ts` |
| **architect** | ADR 0005 จากผล S5 · ปรับ ADR 0001 ถ้า S1–S3 ให้ผลต่างจากที่คาด | `docs/adr/**` |
| **qa-test** | ตั้ง Playwright จอมือถือ + smoke test 1 ชุด (เปิดแอป สลับแท็บ สลับโหมด สลับภาษา) · รันเกตทุกข้อ · ตรวจเกณฑ์ผ่านทีละข้อ · เทียบ token และ component กับ DESIGN.md ทั้งสองโหมด | `tests/e2e/**`, `playwright.config.ts` |

## ลำดับ

```
0. boss: อนุมัติ contract · Lead: สร้าง branch r0-foundation + สร้างฐานข้อมูล Neon ชุด dev (ต้องได้รับอนุญาตจาก boss ก่อนสร้าง)
1. platform        โครง + ฐานข้อมูล + S1 S2            ← ต้องเสร็จและผ่าน lint/typecheck/test/build ก่อนแตกงาน
2. ขนานกัน         frontend (S4) ∥ ux-brand ∥ pwa-offline (S5) ∥ ops-release (S6)
                   แต่ละ agent ทำใน worktree ของตัวเอง (กัน build และ node_modules ชนกัน) Lead รวมเข้า r0-foundation
3. Lead push + เปิด pull request · boss ตั้ง Vercel ตาม docs/OPERATIONS.md   ← ต้องมีก่อน S3 และก่อนตรวจการติดตั้งบนมือถือ
4. platform S3 · architect ADR 0005
5. qa-test         ตรวจทั้งรอบ
6. Lead            รวม รันเกตซ้ำ เสนอ v0.1.0 ใน pull request → CI เขียว → boss กด merge → secretary รายงาน
```

ช่วงขนาน: ห้ามเพิ่ม dependency เอง ยกเว้น pwa-offline สำหรับ S5 — ถ้าขาดอะไรให้แจ้ง Lead

## เกณฑ์ผ่าน

| # | เกณฑ์ | วิธีตรวจ |
|---|---|---|
| 1 | เกตของ R0 ผ่านทั้งหมด | `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `drizzle-kit check` + apply migration บนฐานข้อมูลว่าง — ไม่มี error และไม่มีเทสต์ที่ถูกข้าม |
| 2 | CI รันเกตข้อ 1 ครบ และล้มเมื่อเกตล้ม | workflow เขียวบน GitHub · ทดลอง commit ที่ทำให้ lint ล้มแล้ว CI แดง |
| 3 | `/api/health` ตอบ 200 เมื่อฐานข้อมูลใช้ได้ และ 503 เมื่อใช้ไม่ได้ | เทสต์อัตโนมัติ + เรียกบน Vercel |
| 4 | migration แรกผ่านกติกาชนิดข้อมูลของ ADR 0001 | QA ตรวจไฟล์ SQL เทียบตาราง (หรือมีรายการยกเว้นจาก S2 ที่ Lead รับ) |
| 5 | ไม่มีข้อความฝังในโค้ด และ key ของ TH/EN ครบตรงกัน | เทสต์ i18n ผ่าน |
| 6 | token สี ฟอนต์ ระยะห่าง ตรงกับ DESIGN.md · ไม่มีค่าสีตรงๆ ใน component | QA เทียบ `/styleguide` ทั้งสองโหมด + ค้นหาค่าสีในโค้ด |
| 7 | โหมดมืดแมวเป็นเส้นล้วน · ส้มมีบทบาทเดียวต่อจอ · ปุ่มแตะ ≥ 44px · คอนทราสต์ ≥ 4.5:1 | QA ตรวจบนจอมือถือ |
| 8 | ภาพแมวหยุดขยับเมื่อระบบตั้ง reduced motion | เทสต์หรือ QA ตรวจ |
| 9 | ติดตั้งลงหน้าจอหลักได้ทั้ง Android และ iPhone | boss ลองบนเครื่องจริง |
| 10 | เปิดออนไลน์ 1 ครั้ง → โหมดเครื่องบิน → ปิดแล้วเปิดแอป → เห็นหน้าหลัก | QA ในเบราว์เซอร์ + boss บนเครื่องจริง |
| 11 | deploy รุ่นใหม่แล้วแอปที่ติดตั้งได้รุ่นใหม่ภายในการเปิดครั้งที่สอง | QA + boss |
| 12 | service worker ไม่แคช `/api/**` | เทสต์ หรือ QA ตรวจใน devtools |
| 13 | โค้ดฝั่งหน้าจอ import โค้ดฝั่งเซิร์ฟเวอร์ไม่ได้ | ทดลอง import แล้ว lint ล้ม |
| 14 | spike S1–S6 มีคำตอบเป็นลายลักษณ์อักษร และ ADR 0005 เขียนแล้ว | ไฟล์ใน `docs/adr/` และ `docs/OPERATIONS.md` |
| 15 | ใช้บนเบราว์เซอร์คอมได้: เปิดที่ความกว้าง 1280px แล้วเนื้อหาเป็นคอลัมน์กลางจอ ไม่มีแถบเลื่อนแนวนอน ใช้เมาส์และคีย์บอร์ดได้ทุกปุ่ม (Tab ไปถึง มีกรอบ focus) | smoke test ของ QA รันทั้งจอมือถือและจอคอม |
| 16 | ไม่มีความลับใน repo · `.env.example` ครบทุกตัวแปรที่โค้ดอ่าน | QA ค้นหา + เทียบรายการ |

เกณฑ์ 9–11 ต้องใช้เครื่องจริงของ boss ถ้ายังไม่ได้ลอง รอบนี้ถือว่ายังไม่ปิด

## ความเสี่ยง / สิ่งที่ boss ต้องทำ

| เรื่อง | รายละเอียด |
|---|---|
| ฐานข้อมูล | มี 2 ชุดแล้ว: `production` และ `dev` · งานพัฒนาและ preview ใช้ `dev` เท่านั้น · ห้ามรัน migration บน `production` ในรอบนี้ |
| ต้องตั้ง Vercel | spike S3 กับเกณฑ์ 9–11 ทำไม่ได้จนกว่า boss จะสร้างโปรเจกต์บน Vercel (ops เขียนขั้นตอนให้ใน `docs/OPERATIONS.md`) · การ push และเปิด pull request Lead ทำเอง |
| S5 อาจไม่มีทางเลือกไหนผ่านครบ | ถ้า A และ B ไม่ผ่าน ใช้ทาง C (เขียน service worker เอง) ซึ่งทำงานได้แน่นอนแต่ต้องดูแลเอง |
| S3 ตัวเลขออกมาช้าเกินรับได้ | กลับไปแผนสำรองใน ADR 0001 (Turso โตเกียว) ตอนนี้ยังไม่มีข้อมูลจริง ต้นทุนการเปลี่ยนคือ schema ของ Better Auth ชุดเดียว |
| เวอร์ชันของไลบรารีขยับระหว่างรอบ | ปักรุ่นตาม ARCHITECTURE ข้อ 6 ตอน platform ติดตั้ง |

## ผล S3 (วัดเมื่อ 2026-11-18 โดย Lead)

วัดจากเครื่องของ boss ในไทย ไปที่ production `https://fatcatfit.vercel.app/api/health` (function อยู่ `sin1` ยืนยันจาก header `x-vercel-id`) · แต่ละรอบรอให้ไม่มีการเรียกเกิน 5 นาทีก่อน เพื่อให้ฐานข้อมูล Neon หลับ แล้วเรียก 1 ครั้ง (ครั้งแรก) ตามด้วย 2 ครั้งติดกัน

| รอบ | เวลา | ครั้งแรกหลังว่าง | ครั้งที่ 2 | ครั้งที่ 3 |
|---|---|---|---|---|
| 1 | 05:37 | 1.99 วิ | 0.15 วิ | 0.14 วิ |
| 2 | 05:44 | 1.39 วิ | 0.16 วิ | 0.14 วิ |
| 3 | 05:51 | 1.57 วิ | 0.14 วิ | 0.14 วิ |
| 4 | 05:57 | 1.91 วิ | 0.16 วิ | 0.13 วิ |
| 5 | 06:04 | 1.97 วิ | 0.17 วิ | 0.14 วิ |

- ทุกครั้งตอบ 200 `{"ok":true}`
- ครั้งแรกหลังว่าง **1.4–2.0 วิ** (ค่ากลาง 1.9 วิ) · เมื่อตื่นแล้ว **0.13–0.17 วิ** ซึ่งรวมเวลาเชื่อมต่อจากไทยไปสิงคโปร์ราว 0.08–0.10 วิ
- ตัวเลขครั้งแรกรวมทั้งเวลาที่ function ของ Vercel ตื่นและเวลาที่ Neon ตื่น แยกสองส่วนไม่ได้จากภายนอก
- driver: ใช้ `node-postgres` ต่อไป ไม่ได้วัดเทียบ `neon-serverless` เพราะเวลาเมื่อตื่นแล้วต่ำพออยู่แล้ว
- **สรุปของ Lead**: ยอมรับได้ ไม่ต้องใช้แผนสำรอง (Turso) — ผู้ใช้รอราว 2 วิเฉพาะตอนเปิดแอปหลังไม่มีใครใช้ ส่วนการจดตั้งแต่ R3 ไม่รอเซิร์ฟเวอร์ (คิวออฟไลน์) · ทบทวนเมื่อมีการเข้าสู่ระบบจริงใน R1 ซึ่งมี query หลายครั้งต่อคำขอ

## ปิดรอบ (2026-11-18)

- เกณฑ์ 9–10 (ติดตั้งบนมือถือ, ออฟไลน์ทุกแท็บ, ปุ่มภาษาตอนออฟไลน์, ภาษาอังกฤษทุกแท็บตอนออฟไลน์): **boss ลองบนมือถือจริงและรายงานว่าผ่านทุกข้อ** ตามขั้นตอนที่ Lead ส่งในแชท (ไม่ได้ระบุรุ่นเครื่อง)
- เกณฑ์ 11 (รุ่นใหม่มาถึงผู้ใช้ภายในการเปิดครั้งที่ 2): ผ่านใน Chrome ด้วย e2e · บนมือถือจริงจะเห็นตอน v0.1.0 deploy
- เกณฑ์ 14: S1–S6 ครบ และ ADR 0005 เขียนแล้ว
- เกตบน main ล่าสุด (รวม CR1) ที่ Lead รันเอง 2026-11-18: lint, typecheck, unit 334 ผ่าน, drizzle-kit check, build, e2e 216 ผ่าน
- ออกรุ่น **v0.1.0**
