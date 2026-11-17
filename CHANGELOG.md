# Changelog

รูปแบบตาม [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) และเลขรุ่นตาม [SemVer](https://semver.org/spec/v2.0.0.html) — กติกาของโปรเจกต์นี้อยู่ใน [docs/VERSIONING.md](docs/VERSIONING.md)

## [Unreleased]

### Added

- e2e ด้วย Playwright บนจอมือถือและจอคอม (smoke, design, PWA ออฟไลน์, ทางผิด) และ CI รัน e2e ทุก pull request โดยไม่ข้าม
- หน้า 404 และหน้า error ของแอปเองทั้งสองภาษา พร้อมแมวท่างง
- ADR 0005 เครื่องมือ service worker

- โครงโปรเจกต์ Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS 4 + ESLint + Vitest (รอบ R0 Foundation)
- ฐานข้อมูล: ตัวเชื่อมต่อ Postgres แบบ lazy (`node-postgres`), schema ของ Better Auth, migration แรก, ฐานข้อมูลเทสต์ด้วย PGlite ที่รัน migration จริงทุกครั้ง
- `GET /api/health` ตรวจแอปและ query ฐานข้อมูล 1 ครั้ง (200 เมื่อใช้ได้ 503 เมื่อใช้ไม่ได้)
- หน้าจอ: แถบล่าง 4 แท็บ (หน้าหลัก ประวัติ ความคืบหน้า ฉัน) พร้อมหน้าว่าง, design token ตาม DESIGN.md, ฟอนต์ Noto Sans Thai + Gaegu แบบ self-host, โหมดสว่าง/มืด/ตามระบบ, component พื้นฐาน และหน้า `/styleguide`
- ภาษา TH/EN ด้วย next-intl แบบไม่มีภาษาใน URL (เก็บใน cookie) พร้อมเทสต์ว่า key ครบทั้งสองภาษาและไม่มีข้อความฝังในโค้ด
- ภาพแมว 36 ท่าเป็น component `<Cat>` สร้างจากต้นฉบับ `docs/design/samples.html` (ดุ๊กดิ๊กได้ หยุดเมื่อตั้ง reduced motion โหมดมืดเป็นเส้นล้วน) และไอคอนแอป
- PWA: manifest, service worker ด้วย `@serwist/turbopack` (asset cache-first, หน้าเว็บ network-first ถอยไปของที่เก็บไว้, ไม่แคช `/api/**`), เปิดแอปได้ตอนออฟไลน์หลังเคยเปิดออนไลน์ 1 ครั้ง
- CI บน GitHub Actions: lint, typecheck, test, `drizzle-kit check`, build ทุก pull request และทุก push เข้า `main`
- ระบบออกรุ่นอัตโนมัติ: เมื่อ merge เข้า `main` และเลขรุ่นใน `package.json` ยังไม่มี tag จะสร้าง tag และ GitHub release จาก CHANGELOG
- Security headers ทุกหน้า (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`)
- กฎ ESLint บังคับขอบเขตโมดูลตาม ARCHITECTURE ข้อ 3 (หน้าจอ import โค้ดฝั่งเซิร์ฟเวอร์ไม่ได้)
- `vercel.json` (function ภูมิภาค `sin1`) และสคริปต์ migration ตอน deploy ที่ไม่ทำงานจนกว่าจะตั้ง `MIGRATE_ON_DEPLOY=1` บน Production
- `.env.example` และเทสต์ที่ตรวจว่าทุกตัวแปรที่โค้ดอ่านมีในไฟล์ตัวอย่าง
- เอกสาร: `docs/OPERATIONS.md` (ขั้นตอนตั้งค่าสำหรับ boss), `docs/VERSIONING.md`

### Fixed

- กดสลับภาษารัวๆ แล้วภาษาสุดท้ายไม่ตรงกับปุ่มที่กดล่าสุด
- แตะแท็บที่ยังไม่เคยเปิดตอนออฟไลน์แล้วได้หน้าหลักแทน — service worker เก็บทั้ง 4 แท็บตั้งแต่ติดตั้ง
- สลับภาษาตอนออฟไลน์ไม่มีผลและไม่บอกผู้ใช้ — ปุ่มปิดพร้อมข้อความ
- กฎขอบเขตโมดูลหลุดได้ด้วย relative import และ import() แบบไดนามิก
- เส้นใต้แถบล่างยาวเกินขอบขวา
