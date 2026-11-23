# กระบวนการทำงาน (แบบ software engineering ไม่ใช่ vibe code)

หลักการ: **เขียนข้อตกลงก่อนโค้ด · ทุกงานมีเกณฑ์ผ่านที่ตรวจได้ · คนทำกับคนตรวจเป็นคนละ agent · ไม่มีอะไรเข้าโดยไม่ผ่านเกต**
ทีม: [TEAM.md](TEAM.md) · ความต้องการ: [docs/prd/PRD.md](docs/prd/PRD.md) · ออกแบบ: [docs/design/DESIGN.md](docs/design/DESIGN.md)

## เฟสของโปรเจกต์

| เฟส | เนื้อหา | ผู้ทำ | จุดที่ boss ต้องอนุมัติ | สถานะ |
|---|---|---|---|---|
| 0 Discovery | วิจัยแอป/API/stack | Researcher | — | ✅ |
| 1 Requirements | PRD: user story, ขอบเขต, เกณฑ์รับงาน | Lead | **อนุมัติ PRD** | ✅ อนุมัติ 2026-11-15 |
| 2 Design | ADR + โมเดลข้อมูล · flow/wireframe · แบรนด์ | Architect, UX & Brand | **อนุมัติ wireframe และ ADR หลัก** | ✅ อนุมัติ 2026-11-16 |
| 3 Foundation (R0) | โครงโปรเจกต์, CI, migration, release, ธีม, TH/EN, PWA skeleton | ดูตารางรอบ | — | ✅ ปิดแล้ว v0.1.0 (2026-11-18) |
| 4 Build (R1–R5, CR1–CR2) | ตาม contract ของแต่ละรอบ | ดูตารางรอบ | อนุมัติ contract ก่อนเริ่มแต่ละรอบ | R1 ✅ v0.2.0 · v0.2.1 ✅ · R1.5 ✅ v0.3.0 · CR1 ✅ · CR2 ✅ v0.3.1 · R2–R5 ยังไม่เริ่ม · ประวัติ: contract ของแต่ละรอบ + [docs/reports/](docs/reports/) |
| 5 Review | ตรวจอิสระทุกรอบ | QA & Test, Security & Privacy | — | ทุกรอบที่ปิดแล้วผ่าน qa-test (และ security-privacy เมื่อแตะบัญชี/ข้อมูลสุขภาพ) ไม่มีข้อ high/medium ค้าง · CR2: qa-test ผ่าน ไม่ต้อง security-privacy (เฉพาะ UI) · ผลละเอียดอยู่ในบันทึกของแต่ละ contract |
| 6 Integrate | Lead รวม ทดสอบซ้ำ push และเปิด pull request เสนอเลขเวอร์ชัน | Lead | **กด merge เมื่อ CI เขียว** | ล่าสุด: pull request #13 merged 2026-11-23 (v0.3.1) · ทดสอบ Google บนมือถือจริงหลัง merge (boss) |
| 7 Report | รายงานประจำวัน | Secretary | — | ทำทุกวันที่มี commit · ดู [docs/reports/](docs/reports/) |

หลังเปิดใช้: ความต้องการใหม่ = change request สั้นๆ → contract รอบใหม่ → วนเฟส 4–7

## วงจรของหนึ่งรอบงาน

```
Lead เขียน <รอบ>_CONTRACT.md  →  boss อนุมัติ
   →  สร้าง branch ของรอบ (1 contract = 1 branch)
   →  งานที่ต้องมาก่อน (เช่น schema) ทำและ commit ก่อน
   →  agent ที่ขนานกันได้ทำพร้อมกัน แต่ละตัวแตะเฉพาะไฟล์ของตน + เขียน unit test ของตัวเอง
   →  Lead รันเกตทั้งหมด
   →  QA & Test ตรวจ (และ Security & Privacy ถ้ารอบนั้นแตะบัญชี/ข้อมูลสุขภาพ) — คนละ agent กับคนทำ
   →  แก้จนผ่าน  →  Lead รวม รันเกตซ้ำ push branch เปิด pull request (ระบุเลขเวอร์ชันที่เสนอ)  →  CI เขียว  →  boss กด merge
   →  Secretary เขียนรายงาน
```

### ใครส่งงานให้ใคร

| จาก → ถึง | ส่งอะไร | ต้องพร้อมก่อนส่ง |
|---|---|---|
| boss → Lead | โจทย์ / change request | — |
| Lead → boss | contract ขออนุมัติ | ครบทุกหัวข้อตามแม่แบบท้ายไฟล์ |
| Lead → Researcher / Architect / UX & Brand | คำถามที่ต้องตอบ + ขอบเขต | เฉพาะเมื่อต้องตัดสินใจเชิงโครงสร้าง หรือต้องใช้ข้อมูลภายนอก |
| Lead → คนเขียนโค้ด (Platform, Front-end, PWA, Catalog, OPS) | งานตาม contract: ข้อไหน ไฟล์ที่แตะได้ อะไรต้องเสร็จก่อน เกณฑ์ผ่าน | boss อนุมัติ contract แล้ว · งานที่ต้องมาก่อนเสร็จแล้ว |
| คนเขียนโค้ด → Lead | รายงาน + รายการ commit | เกต lint / typecheck / unit ของตัวเองผ่านจริง |
| Lead → QA & Test (∥ Security & Privacy) | ขอให้ตรวจรอบนี้ | Lead รันเกตเองผ่านแล้ว |
| QA / Security → Lead | ผลตรวจทีละเกณฑ์ + คำตัดสิน | ตรวจครบทุกข้อ หรือบอกชัดว่าข้อไหนตรวจไม่ได้ |
| Lead → คนเขียนโค้ด | รายการที่ต้องแก้ | แยก "ต้องแก้" ออกจาก "ข้อเสนอแนะ" |
| Lead → boss | pull request + สรุป + ขั้นตอนทดสอบ | QA ผ่าน · Lead ลองใช้จริงแล้ว · ตรวจ diff แล้ว |
| Lead → Secretary | ขอรายงาน + ตรวจเอกสาร | หลังงานทุกชิ้น |

### งานที่ไม่ผ่านรอบปกติ

- **งานเล็กที่ไม่ใช่ฟีเจอร์** (แก้เอกสาร ตอบคำถาม แก้คำผิด): ทำได้เลยโดยไม่ต้องมี contract
- **บั๊กด่วน (hotfix)**: ใช้ contract สั้น (เป้าหมาย + เกณฑ์ผ่าน 1–3 ข้อ) ข้ามเฟสออกแบบได้ แต่ยังต้องผ่าน QA
- **agent ติดหรือต้องแก้ไฟล์นอกขอบเขต**: หยุดและรายงาน Lead ห้ามแก้เอง
- **agent เห็นไม่ตรงกัน**: Lead ตัดสิน ถ้าเป็นการตัดสินใจสำคัญให้บันทึกเป็น ADR

## กติกา

1. **ไม่มี contract ไม่มีโค้ด** — contract ระบุ: เป้าหมาย, user story ที่ครอบคลุม, API/ชนิดข้อมูล, ใครดูแลไฟล์ไหน, เกณฑ์ผ่านที่ตรวจได้ด้วยคำสั่ง/เทสต์
2. **เทสต์มาพร้อมโค้ด** — ทุกบทบาทที่เขียนโค้ดเขียน unit/integration test ของตัวเองใน commit ชุดเดียวกัน · เทสต์ end-to-end เป็นของ QA & Test
3. **ขอบเขตไฟล์** — ห้ามแก้ไฟล์นอกขอบเขตของตัวเอง ถ้าต้องแก้ให้รายงาน Lead (ยกเว้นผู้ตรวจอิสระ)
4. **การตัดสินใจสำคัญต้องมี ADR** (`docs/adr/NNNN-*.md`) เช่น auth, โครงสร้าง track_type, กลยุทธ์ออฟไลน์
5. **Schema เปลี่ยนด้วย migration แบบมีเวอร์ชันเท่านั้น** — CI ต้องรันทุก migration บนฐานข้อมูลว่างได้ · migration ที่ย้อนข้อมูลไม่ได้ต้องผ่าน Lead
6. **เซิร์ฟเวอร์คือต้นฉบับของข้อมูล** — ในเครื่องเป็นคิวพักเท่านั้น · ทุกการเขียนใช้ UUID จากไคลเอนต์ และเซิร์ฟเวอร์ upsert แบบส่งซ้ำได้ไม่เกิดแถวซ้ำ
7. **SemVer ตั้งแต่ v0.1.0** + CHANGELOG (`[Unreleased]`) · Lead เสนอเลขใน pull request ของรอบ (รวมการแก้ CHANGELOG) boss อนุมัติด้วยการ merge แล้ว CI สร้าง tag ให้ · ชื่อรอบงานไม่ใช่เลขเวอร์ชัน
8. **ความลับอยู่ใน env เท่านั้น** มี `.env.example` ห้าม commit ค่าจริง
9. **ข้อมูลของผู้ใช้เห็นได้เฉพาะเจ้าของ** — v1 ไม่มีฟีเจอร์สังคม ทุก query ผูกกับผู้ใช้ที่เข้าสู่ระบบ และมีเทสต์ยืนยันว่าอ่าน/แก้ข้อมูลคนอื่นไม่ได้
10. **ผู้ตรวจอิสระตรวจจากเกณฑ์ใน contract + ใช้งานจริงบนจอมือถือ** ไม่ใช่แค่อ่านโค้ด
11. **รายงานตามจริง** — เทสต์ไม่ผ่านให้บอกว่าไม่ผ่านพร้อมผลลัพธ์ · ข้ามขั้นไหนให้บอก · ห้ามปิดเทสต์หรือลดเกณฑ์เพื่อให้ผ่าน
12. **ข้อมูลภายนอกต้องยืนยันก่อนผูกมัด** — ราคา ลิมิต และพฤติกรรมของไลบรารี ให้ Researcher เช็กกับเอกสารทางการ ไม่ใช้ความจำของ agent
13. **เอกสารต้องเป็นปัจจุบันเสมอ** (boss สั่ง 2026-11-19) — หลังงานทุกชิ้น Lead เรียก Secretary ตรวจเอกสารล้าสมัย แล้วดู diff ก่อน push

## เกต (Definition of Done)

เกตเริ่มบังคับตั้งแต่รอบที่ระบุ และบังคับทุกรอบหลังจากนั้น

ใครรัน: คนเขียนโค้ดรัน lint / typecheck / unit ก่อนส่งงาน · QA & Test รัน e2e และเกตเฉพาะของรอบ · Lead รันทุกเกตซ้ำเองก่อน push

| เกต | วิธีตรวจ | บังคับตั้งแต่ |
|---|---|---|
| Lint + Typecheck | `npm run lint` · `npm run typecheck` | R0 |
| Unit/Integration | `npm test` (Postgres ชั่วคราวในโปรเซสด้วย PGlite หรือ container ตามผล spike R0 · รัน migration จริงทุกครั้ง) | R0 |
| Build | `npm run build` | R0 |
| Migration | `drizzle-kit check` + apply ทุก migration บนฐานข้อมูลว่าง | R0 |
| i18n | เทสต์ key ครบทั้ง TH/EN | R0 |
| E2E มือถือ | `npm run test:e2e` (Playwright, จอมือถือ) | R1 |
| A11y/UX | ปุ่มแตะ ≥ 44px · คอนทราสต์ทั้งสองโหมด | R1 |
| สิทธิ์ข้อมูล | เทสต์ว่าผู้ใช้ A อ่าน/แก้ข้อมูลของผู้ใช้ B ไม่ได้ ทุก endpoint ใหม่ | R1 |
| Consent + ลบบัญชี | consent บันทึก · ลบบัญชีแล้วไม่เหลือข้อมูล (ครอบคลุมตารางใหม่ของรอบนั้น) | R1 |
| E2E ออฟไลน์ | flow จดในโหมดออฟไลน์ แล้ว sync ไม่ซ้ำ | R3 |
| ใช้มือเดียวในหน้าจด | ตรวจโดย QA บนจอมือถือ | R3 |
| ส่งออกข้อมูล | CSV ครบทุกตารางของผู้ใช้ | R5 |
| ประสิทธิภาพ | งบขนาด bundle ของหน้าจด · Lighthouse PWA/Accessibility บน preview | R6 |

## แผนรอบงานและลำดับความสำคัญ

| รอบ | ลำดับ | เนื้อหา | ต้องเสร็จก่อน | agent (ตัวหนา = ทำก่อน ที่เหลือขนานได้) |
|---|---|---|---|---|
| เฟส 2 | — | ADR: auth, track_type + โมเดลข้อมูล, ออฟไลน์ · wireframe หน้าหลัก | PRD อนุมัติ | **researcher** (ยืนยันลิมิต/ไลบรารี) → architect ∥ ux-brand |
| R0 Foundation | P0 | โครงโปรเจกต์ · CI · migration แรก (ตารางของ Better Auth) · release · design token + ฟอนต์ + โหมดสว่าง/มืด · TH/EN · PWA skeleton · component ภาพแมว · **spike ทางเทคนิคตาม ADR 0001/0004 (ผลของ service worker เขียนเป็น ADR 0005 ก่อนปิดรอบ)** | เฟส 2 | **platform** (โครง + db) → frontend ∥ ops-release ∥ pwa-offline ∥ ux-brand → qa-test |
| R1 บัญชี | P0 | โค้ดเชิญ · Google + อีเมล OTP · session · consent · แบบสอบถาม (รวมตาราง `place` และ `body_entry` เฉพาะน้ำหนัก · ต้องออนไลน์ เพราะคิวออฟไลน์มาใน R3) · ลบบัญชี · ทดสอบ Google/OTP บน iPhone จริง | R0 | **platform** → frontend ∥ ops-release (ส่งอีเมล) → qa-test ∥ security-privacy · ✅ ปิดแล้ว v0.2.0 (2026-11-19) |
| R1.5 หน้าแอดมินออกโค้ดเชิญ (แทรกหลัง R1) | P0 | `/admin/invites` บนมือถือ: ออก/แชร์/ดู/เพิกถอนโค้ด · ตาราง `app_admin` (migration `0002`) · `requireAdmin()` · ดู [R1_5_ADMIN_INVITES_CONTRACT.md](R1_5_ADMIN_INVITES_CONTRACT.md) (**boss อนุมัติ D0–D6 2026-11-20** · **ปิดแล้ว 2026-11-23** · v0.3.0 ออกแล้ว · pull request #12 merged · boss ทดสอบ production ผ่านเกณฑ์ 17) | R1 merged + production มี `0001` | architect ∥ ux-brand ∥ researcher → platform ∥ pwa-offline → frontend ∥ ops-release → qa-test ∥ security-privacy |
| CR2 ยืนยันก่อนออกจากระบบ + คำวันหมดอายุโค้ดเชิญ (แทรกหลัง R1.5) | P0 | หน้า "ฉัน" กดออกจากระบบต้องมีหน้าต่างยืนยันก่อน · หน้าออกโค้ดเชิญใช้คำ "ต้องสมัครภายใน" / "สมัครได้ถึง" แทน "ใช้ได้กี่วัน" (boss ขอ 2026-11-23 · รุ่น v0.3.1 แบบ patch · ✅ ปิดแล้ว (production ผ่าน) · ดู [CR2_SIGNOUT_CONFIRM_CONTRACT.md](CR2_SIGNOUT_CONFIRM_CONTRACT.md)) | R1.5 ✅ | frontend → qa-test (ไม่ต้อง security-privacy: เฉพาะ UI) |
| Backlog ท้ายสุดของแผน (boss ตัดสิน 2026-11-20) | P2 | ฟีเจอร์ LINE: LINE OA ประชาสัมพันธ์ · วิธีใช้ · แจ้งเตือน · สรุป progress (ยังไม่มี contract · ไม่อยู่ใน R1.5) | R6 | ยังไม่กำหนด |
| R2 คลังท่า | P0 | คลังท่า TH/EN · ค้นหา · ท่า custom · สถานที่ของผู้ใช้ | R1 | **catalog** ∥ **platform** → frontend → qa-test |
| R3 จดการออกกำลังกาย | P0 | เซสชัน · ฟอร์มตาม track_type · ออฟไลน์ + sync · ตัวจับเวลาพัก · สถิติ (PR) | R2 | **platform** (API แบบส่งซ้ำได้) → frontend ∥ pwa-offline → qa-test ∥ security-privacy |
| R4 เทมเพลต + ร่างกาย | P1 | เทมเพลต/ทำซ้ำครั้งก่อน · หน้าจดน้ำหนักตัว + สัดส่วน (`body_measurement`) | R3 | **platform** → frontend → qa-test ∥ security-privacy |
| R5 ความคืบหน้า | P1 | สรุปสัปดาห์/เดือน · กราฟรายท่า · กราฟน้ำหนัก · ส่งออก CSV | R4 | **platform** → frontend → qa-test ∥ security-privacy |
| R6 พร้อมเปิดใช้ | P1 | ทดสอบเครื่องจริง · backup/restore · แบนเนอร์ติดตั้ง iOS · หน้าเครดิต · ประสิทธิภาพ | R5 | qa-test ∥ ops-release ∥ security-privacy → แก้ตามที่พบ |

เปลี่ยนจากร่างก่อนเริ่มโปรเจกต์: ตัด feed/อันดับ (boss ตัดสิน: ไม่มี social) · ย้ายตาราง `place` และการลบบัญชีมา R1 · ย้ายเทมเพลตขึ้นมาก่อน dashboard เพราะเป็นส่วนของการจดให้เร็ว · เกตระบุรอบที่เริ่มบังคับ

## ธรรมเนียม git

- `git -c user.name=<ชื่อบทบาท> commit` · ข้อความแบบ conventional (`feat:` `fix:` `qa:` `docs:` `chore:`)
- 1 contract = 1 branch = 1 pull request · แต่ละบทบาท commit แยก · Lead รวม ตรวจ แล้ว **Lead เป็นคน push และเปิด pull request** (agent ตัวอื่นไม่ push) · boss กด merge · ไม่ push เข้า `main` ตรงๆ ไม่ force push
- งานเอกสารระหว่างรอบ: รวมไปกับ pull request ของรอบถัดไป หรือเปิด pull request เอกสารแยกเมื่อ boss ต้องเห็นก่อน
- เอกสารล้วนไม่ต้องออกรุ่น

## โครงโฟลเดอร์

```
/                *_CONTRACT.md · TEAM.md · PROCESS.md · CLAUDE.md · CHANGELOG.md
.claude/agents/  นิยาม agent ของแต่ละบทบาท
docs/            prd/ adr/ design/ research/ content/ reports/ VERSIONING.md OPERATIONS.md
assets/stickers/ ภาพแมว (สร้างจากสคริปต์)
src/             app/ components/ db/ lib/ pwa/
content/exercises/ · messages/ · drizzle/ · scripts/ · tests/ · .github/
```

## แม่แบบ CONTRACT

```markdown
# <ชื่อรอบ>_CONTRACT.md
## เป้าหมาย / user story ที่ครอบคลุม (อ้างเลขจาก PRD)
## ขอบเขต (ทำ / ไม่ทำ)
## API & ชนิดข้อมูล
## ความรับผิดชอบไฟล์ (บทบาท → ไฟล์)
## ลำดับ/ความขึ้นต่อกัน (อะไรต้องมาก่อน อะไรขนานได้)
## เกณฑ์ผ่าน (คำสั่ง + ผลที่คาดหวัง)
## ความเสี่ยง / สิ่งที่ boss ต้องตัดสินใจ
## สถานะ (Lead อัปเดตระหว่างรอบ): draft → boss อนุมัติ → กำลังทำ → ตรวจ → รอ merge → ปิด
```
