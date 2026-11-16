# Changelog

รูปแบบตาม [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) และเลขรุ่นตาม [SemVer](https://semver.org/spec/v2.0.0.html) — กติกาของโปรเจกต์นี้อยู่ใน [docs/VERSIONING.md](docs/VERSIONING.md)

## [Unreleased]

### Added

- โครงโปรเจกต์ Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS 4 + ESLint + Vitest (รอบ R0 Foundation)
- ฐานข้อมูล: ตัวเชื่อมต่อ Postgres แบบ lazy (`node-postgres`), schema ของ Better Auth, migration แรก, ฐานข้อมูลเทสต์ด้วย PGlite ที่รัน migration จริงทุกครั้ง
- `GET /api/health` ตรวจแอปและ query ฐานข้อมูล 1 ครั้ง (200 เมื่อใช้ได้ 503 เมื่อใช้ไม่ได้)
- CI บน GitHub Actions: lint, typecheck, test, `drizzle-kit check`, build ทุก pull request และทุก push เข้า `main`
- ระบบออกรุ่นอัตโนมัติ: เมื่อ merge เข้า `main` และเลขรุ่นใน `package.json` ยังไม่มี tag จะสร้าง tag และ GitHub release จาก CHANGELOG
- Security headers ทุกหน้า (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`)
- กฎ ESLint บังคับขอบเขตโมดูลตาม ARCHITECTURE ข้อ 3 (หน้าจอ import โค้ดฝั่งเซิร์ฟเวอร์ไม่ได้)
- `vercel.json` (function ภูมิภาค `sin1`) และสคริปต์ migration ตอน deploy ที่ไม่ทำงานจนกว่าจะตั้ง `MIGRATE_ON_DEPLOY=1` บน Production
- `.env.example` และเทสต์ที่ตรวจว่าทุกตัวแปรที่โค้ดอ่านมีในไฟล์ตัวอย่าง
- เอกสาร: `docs/OPERATIONS.md` (ขั้นตอนตั้งค่าสำหรับ boss), `docs/VERSIONING.md`
