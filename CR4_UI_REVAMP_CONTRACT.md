# CR4: ปรับโฉม UI สไตล์ Studio Minimal + Dark Mode ยกชั้น + จุดเด้ง 3 จุด

> สถานะ: **ตรวจผ่าน · รอ merge** · boss อนุมัติ 2026-11-25 ("เริ่มทำเลยครับ ... design.md ตอนนี้ผมอนุมัติครับ ทำได้เลย แก้เลยครับ" และอนุมัติจุดเด้ง 3 จุด + แบบ 1 ให้ Antigravity ทำจบถึงเปิด PR) · branch: `ag/ui-revamp` (แตกจาก `origin/main` · ไม่แตะโฟลเดอร์หลักที่ `r3a-logging` อยู่) · รุ่นที่เสนอ: **0.5.1** (patch — ปรับโฉม UI/คอนทราสต์/ตัวบอกสถานะโหลด ไม่เปลี่ยน schema หรือพฤติกรรมข้อมูล ไม่ชนแผน R3a 0.6.0)

## ปัญหา (จากฟีดแบ็ก user tester + boss 2026-11-24–25)

1. **โหมดมืดดูแบนและใช้งานยาก:** พื้นหลังกับพื้นรองใกล้กันเกินไป ไม่มีลำดับชั้นพื้นผิว (Surface Elevation) ปุ่มหลักเป็นกรอบเส้นขาวหนาบนพื้นดำมองแยกไม่ออก
2. **เส้นหนา 2.5px + มุมเบี้ยว (`rounded-hand`) + เส้นยึกยือ (`wavy` / `Squiggle`) + กรอบสไตล์ดินสอ:** ทำให้หน้าตาแอปดูรกและไม่น่าใช้ ปุ่มรองที่เป็นเส้นหยักดูไม่ออกว่ากดได้ และซ้อนกับสระล่างภาษาไทย
3. **ขาดตัวบอกสถานะโหลดที่ดูเป็นมิตร:** ปุ่มกำลังโหลดและจังหวะเปลี่ยนหน้ายังนิ่ง · boss อนุมัติ **จุดเด้ง 3 จุด (Bouncing 3 Dots)** ให้ใช้เป็นตัวบอกสถานะโหลด

## ขอบเขต

| ทำ | ไม่ทำ (และกันชน `r3a-logging`) |
|---|---|
| อัปเดต [docs/design/DESIGN.md](docs/design/DESIGN.md) เป็นระบบ **Studio Minimal** (ตัดเส้นหนา/เส้นหยัก/กรอบเบี้ยวออกจาก UI · คงตัวละครแมว `<Cat>` 36 ท่า, สีส้ม `#F9A03A` ทำหน้าที่เดียวต่อจอ, และฟอนต์ `Noto Sans Thai`) | ไม่แตะไฟล์ที่ `r3a-logging` กำลังเปลี่ยน (`src/components/{log,sync}/**`, `src/components/catalog/**` ยกเว้น `me-sections.tsx`/`credits-screen.tsx`, `src/components/places/**`, `src/components/auth/{account-section,auth-gate}.tsx`, `src/components/ui/icon.tsx`, `src/app/(app)/{layout,page}.tsx`, `src/lib/**`, `src/pwa/**`, `src/db/**`, `drizzle/**`, `src/app/api/**`) |
| ปรับ token ใน `src/app/globals.css`: Neutral Graphite/Zinc 4 ระดับในโหมดมืด (`#0c0c0e` → `#17171a` → `#222227` → `#2a2a30`) + โหมดสว่าง (`#ffffff` / `#f4f4f5`) · ขอบ `1px` (`--line`/`--line-strong`) · คอนทราสต์ ≥ 4.5:1 ทุกคู่ · คง alias utility เดิม (`border-draw`, `rounded-hand`, `underline-hand`) ให้แมปไปสไตล์คลีนใหม่เพื่อให้โค้ดใน `r3a-logging` ได้โฉมใหม่ทันทีโดยไม่เกิด conflict | ไม่เพิ่ม `loading.tsx` หรือ `<Suspense>` ครอบ layout (คง ADR 0005 / ADR 0006 100%) |
| เพิ่ม `<LoadingDots />` (`src/components/ui/loading-dots.tsx` — จุดเด้ง 3 จุด Pure CSS ไม่ชน id และเคารพ `prefers-reduced-motion`) ใช้ใน `<Button loading>` และตัวบอกสถานะเปลี่ยนหน้าด้วย `useLinkStatus()` ใน `BottomTabs` | ไม่เปลี่ยนพฤติกรรม auth / ข้อมูลสุขภาพ / API / schema / dependency ใหม่ |
| ปรับ UI primitives ใน `src/components/ui/**` (`button`, `chip`, `choice-group`, `checkbox`, `text-field`, `number-input`, `sheet`, `tick-button`, `toast`, `squiggle`, `empty-state`, `status-screen`), `BottomTabs`, `ThemeSwitch`, `LocaleSwitch`, และหน้าจอที่ไม่ชน R3a (`me/page.tsx`, `me-sections`, `credits-screen`, `welcome-screen`, `otp-panel`, `consent-screen`, `onboarding-screen`, `offline-sign-in`, `admin/invites`, `privacy`, `styleguide`, `layout.tsx`) | ไม่เปลี่ยนเนื้อหาประกาศความเป็นส่วนตัว |
| อัปเดต unit test (`tokens.test.ts`, `ui.test.tsx`, `bottom-tabs.test.tsx`, `loading-dots.test.tsx`) และ e2e (`helpers.ts` ค่า `TOKENS`, `r1-design.spec.ts` ตัวชี้แท็บที่เลือกแบบไม่พึ่งเส้นหยัก) | ไม่ปิดเทสต์หรือลดเกณฑ์คอนทราสต์/touch target ใดๆ |

## ไฟล์ที่รับผิดชอบ

- เอกสาร & สัญญา: `CR4_UI_REVAMP_CONTRACT.md`, `docs/design/DESIGN.md`, `CHANGELOG.md`, `PROCESS.md`, `README.md`, `docs/VERSIONING.md`, `docs/reports/2026-11-25.md`
- สไตล์ & UI กลาง: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/tokens.test.ts`, `src/components/ui/{divider,loading-dots,button,chip,choice-group,checkbox,text-field,number-input,sheet,tick-button,toast,squiggle,empty-state,status-screen}.tsx`, `src/components/ui/{ui,loading-dots}.test.tsx`
- แถบนำทาง & ธีม & หน้าจอ: `src/components/nav/bottom-tabs.tsx`, `src/components/nav/bottom-tabs.test.tsx`, `src/components/theme/{theme-switch,locale-switch}.tsx`, `src/app/(app)/me/page.tsx`, `src/components/catalog/{me-sections,credits-screen}.tsx`, `src/components/auth/{welcome-screen,otp-panel,consent-screen,onboarding-screen,offline-sign-in}.tsx`, `src/components/admin/{invites-screen,invite-form,invite-list,result-card}.tsx`, `src/app/privacy/page.tsx`, `src/components/styleguide/styleguide-body.tsx`, `messages/{th,en}.json` (เฉพาะ 2 บรรทัดข้อความตัวอย่างใน `styleguide` บรรทัด ~82 และ ~110 ไม่ชน R3a)
- เทสต์ e2e: `tests/e2e/helpers.ts`, `tests/e2e/r1-design.spec.ts`

## เกณฑ์ผ่าน

1. **โหมดสว่างและโหมดมืด 4 ชั้น:** token ใน `globals.css` ตรงกับ `DESIGN.md` ข้อ 3 · ทุกคู่สีข้อความ/พื้นหลังผ่านคอนทราสต์ WCAG AA ≥ 4.5:1 (`tokens.test.ts` + `design.spec.ts` + `r1-design.spec.ts` + `r2-catalog.spec.ts`)
2. **ไร้เส้นหนา/ยึกยือ/กรอบเบี้ยว:** ปุ่มหลักเป็นปุ่มทึบคมชัด (`bg-ink text-paper`, ปุ่มลบ/อันตรายมีขอบ+ตัวอักษร `--warn` คอนทราสต์ผ่าน) · ปุ่มรอง (`TextButton`) เป็น Tonal Surface ชัดเจน ไม่มี `wavy` underline · ขอบ UI เป็น `1px` มุมโค้งสม่ำเสมอ (`10px`/`12px`/`16px`) · แถบล่างไม่มีเส้นหยักและมีตัวชี้แท็บที่เลือกที่ไม่พึ่งสีอย่างเดียว
3. **จุดเด้ง 3 จุด (`LoadingDots`):** แสดงใน `<Button loading>` และตอนเปลี่ยนหน้าผ่าน `BottomTabs` (`useLinkStatus`) · Pure CSS ไม่ชน id · หยุดนิ่งเมื่อ `prefers-reduced-motion: reduce` · มี unit test ยืนยัน
4. **คงตัวตนและกติกาเดิม:** แมว `<Cat>` ทำงานครบ (โหมดสว่างลงสี · โหมดมืดเส้นล้วน · ขยับ 5 เฟรม · reduced motion นิ่ง) · ฟอนต์ `Noto Sans Thai` ≥ 14px ทุกข้อความ · ปุ่มแตะ ≥ 44×44px ทุกจอ · ส้ม `#F9A03A` ไม่เกิน 1 หน้าที่ต่อจอ (และ 0 นอกแมวในหน้าที่ห้ามส้ม) · TH/EN ครบ ไม่มีภาษาไทยหลุดบนหน้า EN
5. **ไม่พัง PWA ออฟไลน์:** ไม่มี `loading.tsx` / `<Suspense>` ครอบ layout · `tests/e2e/pwa.spec.ts` และ `auth-flow.spec.ts` ผ่านครบ
6. **ตรวจอิสระ + ตรวจหน้าจริง 360px:** subagent อิสระตรวจ diff + เปิดตรวจภาพหน้าจริงบนจอมือถือ 360px ทั้ง Light/Dark
7. **เกต CI ครบทุกตัวผ่านในเครื่อง:** `npm run lint` · `npm run typecheck` · `npm test -- --reporter=dot` · `npx drizzle-kit check` · `npm run build` · `npm run test:e2e` · `npx tsx scripts/docs-check.ts origin/main`

ไม่แตะระบบบัญชีฝั่งเซิร์ฟเวอร์ API หรือข้อมูลสุขภาพ (เปลี่ยนเฉพาะชั้นแสดงผล UI) จึงไม่ต้องเปลี่ยนความปลอดภัยฝั่งเซิร์ฟเวอร์ (ยังตรวจ diff ว่าไม่มีความลับ/PII และใช้อีเมล noreply)

## การทดสอบของ boss (หลัง merge บน production · มือถือ ~3 นาที)

1. สลับโหมด **มืด** และ **สว่าง** ในหน้า "ฉัน" — ดูความชัดของพื้นผิว ปุ่ม แถวเมนู แถบล่าง และคอนทราสต์
2. ลองกดปุ่มต่างๆ (เช่น ออกจากระบบ → ดูแผ่นล่าง · เปิดคลังท่า / สถานที่ / แผ่นเลือกสถานที่) — ตรวจว่าปุ่มรองดูออกชัดเจนว่ากดได้ ไม่มีเส้นยึกยือหรือขอบเบี้ยวแล้ว
3. ลองกดปุ่มที่ต้องโหลด (เช่น ล็อกอินหรือบันทึก) — ดูจุดเด้ง 3 จุดในปุ่ม loading

## บันทึกระหว่างรอบ

| วันที่ | เรื่อง | ผล |
|---|---|---|
| 2026-11-25 | boss อนุมัติทิศทาง Studio Minimal v3 + จุดเด้ง 3 จุด + ให้ Antigravity ทำจบถึงเปิด PR | สร้าง worktree แยก `ag/ui-revamp` จาก `origin/main` · เริ่มทำ CR4 (เสนอ v0.5.1) |
| 2026-11-25 | ตรวจอิสระ (subagent QA & Security/Privacy) + ตรวจภาพจริง 360px Light/Dark | รอบแรกพบ 3 จุดต้องแก้ (นับสีส้มซ้ำใน `Checkbox`/`ChoiceGroup`/`TickButton` · `--radius-underline: 0` กันขอบล่างงอในฟอร์ม R2 · ซิงก์ `DESIGN.md` และรายการไฟล์ใน contract) + เก็บงานเส้นคั่นซ้อนใน `me-sections.tsx` และจัดระดับไอคอน `BottomTabs` → แก้ครบและผู้ตรวจอิสระยืนยัน **PASS ครบ 7 หมวด** |
| 2026-11-25 | รันเกตเต็มทุกตัวในเครื่อง (พอร์ต E2E ว่างครบ) | รอบแรกพบ E2E ตก 3 เคสใน `/me` จาก `transition-colors` บน `Chip` ระหว่าง hydrate → แก้ใน `Chip`/`ChoiceGroup` เป็นสลับสีทันทีพร้อม tactile scale → รันซ้ำครบทุกเกต: `lint` ✅ · `typecheck` ✅ · unit **70/70 ไฟล์ (993/993 เทสต์)** ✅ · `drizzle-kit check` ✅ · `build` ✅ · `test:e2e` **542 ผ่าน 0 ล้ม** (ข้าม 16 = จอมือถือบน desktop) ✅ |
| 2026-11-25 | PR #22 merged → v0.5.1 · boss ทดสอบจริงและให้ปรับโหมดมืดให้อ่อนลงเป็น Soft Charcoal (โทน A) + การ์ดจัดกลุ่ม (`v0.5.2`) | แตก branch `ag/soft-dark` จาก `origin/main` · ปรับโหมดมืดเป็น Soft Charcoal 4 ชั้น (`#1c1d21` → `#24252b` → `#2d2f36` → `#353740`, `--ink: #ececf0`, คอนทราสต์ ~14.3:1 ลดอาการแสบตาและผ่าน ≥ 4.5:1 ทุกพื้นผิว) + การ์ดพื้นรองใน `/me` และ `EmptyState` + `Chip surface="card"` (ไม่แตะไฟล์ R3a) · ผู้ตรวจอิสระ (subagent QA/Security) ยืนยัน **PASS ครบ 4 หมวด** · ภาพจริง 360px Light/Dark ✅ · เกตครบ: `lint` ✅ · `typecheck` ✅ · unit **70/70 (994/994)** ✅ · `drizzle-kit check` ✅ · `build` ✅ · `test:e2e` **542 ผ่าน 0 ล้ม** ✅ |
