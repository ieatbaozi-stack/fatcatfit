# วิจัย: โฮสต์ ฐานข้อมูล และเวอร์ชัน (Turso / Vercel Hobby / ทางเลือก)

วันที่เปิดดูทุกแหล่ง: 2026-11-15 · ผู้เขียน: researcher
ระดับ: **[ทางการ]** = ยืนยันจากเอกสารทางการ · **[รอง]** = แหล่งรอง · **[ไม่ได้]** = ยืนยันไม่ได้

## คำถาม
1. Turso แพ็กเกจฟรีตอนนี้เป็นอย่างไร (ลิมิต, pause, ภูมิภาคใกล้ไทย)
2. Vercel Hobby: เงื่อนไข non-commercial, ลิมิตหลัก, เลือกภูมิภาคได้ไหม
3. ถ้า Turso ไม่ผ่าน ทางเลือกฟรีคืออะไร
9. เวอร์ชันล่าสุดและความเข้ากันได้ของ Next.js / Drizzle / next-intl / Tailwind

## คำตอบสั้น
- Turso ฟรีมีโควตาเหลือเฟือสำหรับแอปนี้ (5 GB, 500M อ่าน, 10M เขียน) **แต่** ฐานข้อมูลถูก archive เมื่อไม่มีการใช้งาน 10 วัน, ยืนยันไม่ได้ว่าแพ็กเกจฟรีเลือกสิงคโปร์ได้ (เห็นโตเกียว/มุมไบในตัวอย่างเอกสาร) และ **Supabase ประกาศซื้อ Turso เมื่อ 2026-10-02** ยังไม่มีคำยืนยันเรื่องแพ็กเกจฟรีหลังดีล
- Vercel Hobby ใช้ได้เฉพาะ "personal or non-commercial" แอปนี้เข้าเงื่อนไขตามที่ boss ตัดสิน · function รันได้ภูมิภาคเดียว ตั้ง sin1/hnd1 ได้ (ค่าเริ่มต้นคือ iad1 สหรัฐ ต้องตั้งเอง) · cron ได้วันละครั้ง
- Neon เป็นทางเลือกฟรีที่ใกล้สุด (Postgres, มีสิงคโปร์) แต่ compute หลับหลังว่าง 5 นาที

## A1. Turso Free

| ข้อเท็จจริง | ค่า | แหล่ง | ความมั่นใจ |
|---|---|---|---|
| จำนวนฐานข้อมูล | 100 | [turso.tech/pricing](https://turso.tech/pricing) | ทางการ |
| พื้นที่ | 5 GB | เดียวกัน | ทางการ |
| rows read / เดือน | 500 ล้าน | เดียวกัน | ทางการ |
| rows written / เดือน | 10 ล้าน | เดียวกัน | ทางการ |
| syncs / เดือน | 3 GB · PITR 1 วัน | เดียวกัน | ทางการ |
| พฤติกรรมเมื่อไม่ใช้งาน | "Databases get archived after 10 days of inactivity for users on a free plan" · กู้ด้วย `turso group unarchive` หรือ API | [docs.turso.tech/cli/group/unarchive](https://docs.turso.tech/cli/group/unarchive) | ทางการ |
| (ขัดแย้ง) หน้าเก่า "scale to zero" ใช้ชื่อแพ็กเกจ Starter ว่าหลับหลังว่าง 1 ชม. แล้วตื่นเองเมื่อมี request | [docs.turso.tech/features/scale-to-zero](https://docs.turso.tech/features/scale-to-zero) (เห็นผ่านผลค้นหา ไม่ได้เปิดเต็มหน้า) | รอง |
| ภูมิภาค | ตัวอย่างใน API docs มี `aws-ap-northeast-1` (โตเกียว), `aws-ap-south-1` (มุมไบ) ไม่เห็นสิงคโปร์ · ไม่มีข้อความว่าฟรีจำกัดภูมิภาคหรือไม่ · รายการจริงต้องเรียก `GET /v1/locations` ด้วยโทเค็น (ได้ 401 เมื่อไม่ล็อกอิน) | [API locations](https://docs.turso.tech/api-reference/locations/list.md) | ไม่ได้ (สิงคโปร์ / ข้อจำกัดภูมิภาคของฟรี) |
| เกินโควตาแล้วเกิดอะไร | หน้า usage ระบุว่าแพ็กเกจ Starter/Scaler ที่เกินจะ query ล้มเหลวด้วย `BLOCKED` · ไม่ได้ระบุถึงแพ็กเกจฟรี | [usage-and-billing](https://docs.turso.tech/help/usage-and-billing.md) | ไม่ได้ (สำหรับฟรี) |
| Supabase ซื้อ Turso | ประกาศ 2026-10-02 · Turso "will continue operating" · ผู้ใช้เดิมไม่เปลี่ยน · บทความเดียวกันไม่พูดถึงราคา/แพ็กเกจฟรี | [supabase.com/blog](https://supabase.com/blog/supabase-is-acquiring-turso.md) | ทางการ (ตัวดีล) · ไม่ได้ (อนาคตของแพ็กเกจฟรี) |
| หมายเหตุแหล่งรอง | บทความรายงานว่าไม่มีใครยืนยันว่าแพ็กเกจฟรี 100 DB จะคงอยู่ | [beri.net](https://www.beri.net/article/supabase-turso-acquisition-database-per-agent-sqlite-postgres-pricing-continuity) | รอง |

หมายเหตุ: ตัวเลข 1B/25M/500 DB ที่เห็นใน API spec เป็นค่าตัวอย่างของ schema ไม่ใช่ลิมิตฟรี ไม่ควรใช้

## A2. Vercel Hobby

| ข้อเท็จจริง | ค่า | แหล่ง | ความมั่นใจ |
|---|---|---|---|
| เงื่อนไขการใช้ | "only use the Services under a Hobby plan for your personal or non-commercial use" · เอกสารไม่นิยามคำว่า commercial · Vercel เปลี่ยนเงื่อนไข/ปิดโปรเจกต์ได้โดยไม่แจ้ง | [Terms §4](https://vercel.com/legal/terms) | ทางการ |
| Function duration | 300 วิ (ค่าเริ่มต้นและสูงสุด, Fluid compute) · memory 2 GB/1 vCPU · body 4.5 MB | [functions/limitations](https://vercel.com/docs/functions/limitations) | ทางการ |
| โควตา Hobby ต่อเดือน | Fast Data Transfer 100 GB · Function invocations 1,000,000 · Active CPU 4 ชม. · Memory 360 GB-hrs · Fast Origin Transfer 10 GB · deploy 100/วัน | [plans/hobby](https://vercel.com/docs/plans/hobby) | ทางการ |
| เกินโควตา | "ส่วนใหญ่" ต้องรอ 30 วันก่อนใช้ฟีเจอร์นั้นได้อีก (ไม่ใช่การเก็บเงิน) | เดียวกัน | ทางการ |
| Cron | ได้วันละครั้งเท่านั้น (นิพจน์ถี่กว่านี้ deploy ล้ม) · เวลาคลาดได้ภายในชั่วโมงนั้น (±59 นาที) · หน้านี้บอกว่า Cron Jobs เป็น legacy กำลังย้ายไป "Schedules" (ยังไม่ได้อ่านหน้า Schedules) | [cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing) | ทางการ |
| ภูมิภาค function | Hobby เลือกได้ **ภูมิภาคเดียว** · ค่าเริ่มต้นโปรเจกต์ใหม่ `iad1` (Washington) · ตั้งใน `vercel.json` `regions` หรือ dashboard · มี `sin1` (สิงคโปร์) `hnd1` (โตเกียว) `bom1` `hkg1` `icn1` `kix1` | [region](https://vercel.com/docs/functions/configuring-functions/region), [regions](https://vercel.com/docs/regions) | ทางการ |
| ส่งอีเมลจาก function | บล็อกพอร์ต 25 เท่านั้น (465/587 เปิด) ดูไฟล์ auth | [KB](https://vercel.com/kb/guide/sending-emails-from-an-application-on-vercel) | ทางการ |

## A3. ทางเลือก: Neon Free (Postgres)

| ข้อเท็จจริง | ค่า | แหล่ง | ความมั่นใจ |
|---|---|---|---|
| พื้นที่ | 1 GB/โปรเจกต์ (รวม 20 GB ทุกโปรเจกต์ฟรี) | [neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans) | ทางการ |
| Compute | 100 CU-hr/เดือน/โปรเจกต์ · หลับหลังว่าง 5 นาที ปิดไม่ได้บนฟรี · เกินแล้ว compute ถูก suspend ข้อมูลไม่หาย | เดียวกัน | ทางการ |
| ภูมิภาค | มี Singapore `aws-ap-southeast-1` · หน้าไม่ได้บอกว่าฟรีจำกัดภูมิภาคหรือไม่ | [regions](https://neon.com/docs/introduction/regions) | ทางการ (มีภูมิภาค) · ไม่ได้ (ฟรีเลือกได้ไหม) |
| ข้อจำกัดหลัก | cold start หลังหลับ · ต้องเปลี่ยนเป็น Postgres (Drizzle `pg-core`, Better Auth provider `pg`) · เปลี่ยน schema/migration ทั้งชุด | อนุมานจากข้างต้น | อนุมาน |

## D9. เวอร์ชัน (npm registry ณ 2026-11-15)

| แพ็กเกจ | stable (`latest`) | หมายเหตุ | แหล่ง |
|---|---|---|---|
| Next.js | 16.4.6 | Node >=20.9 · Turbopack เป็น bundler เริ่มต้นตั้งแต่ 16.0 | [registry](https://registry.npmjs.org/next/latest), [Turbopack docs](https://nextjs.org/docs/app/api-reference/turbopack) |
| Drizzle ORM | 0.45.4 | 1.0 ยังเป็น rc (`rc` = 1.0.0-rc.5) · เอกสาร Turso ของ Drizzle สั่งติดตั้ง `drizzle-orm@rc` | [dist-tags](https://registry.npmjs.org/-/package/drizzle-orm/dist-tags), [connect-turso](https://orm.drizzle.team/docs/connect-turso) |
| next-intl | 4.15.1 | peer รองรับ Next 12–16, React 16.8–19 | [registry](https://registry.npmjs.org/next-intl/latest) |
| Tailwind CSS | 4.3.5 | Turbopack รองรับ PostCSS (ใช้กับ Tailwind) | [registry](https://registry.npmjs.org/tailwindcss/latest) |
| Better Auth | 1.7.25 | peer: next ^14–16 · drizzle-orm ^0.45.2 หรือ >=1.0.0-rc.1 | [registry](https://registry.npmjs.org/better-auth/latest) |
| @serwist/next | 9.5.13 | peer next >=14 · เขียนไว้สำหรับ webpack | [registry](https://registry.npmjs.org/@serwist/next/latest) |

ความเข้ากันได้ที่ควรรู้ (ทั้งหมดความมั่นใจ ทางการ ยกเว้นที่ระบุ)
- Next 16 ใช้ Turbopack เป็นค่าเริ่มต้น ส่วน `webpack()` ใน next.config ไม่ถูกรับรู้ ปลั๊กอิน webpack ใช้ไม่ได้ → ผลต่อ Serwist ดูไฟล์ pwa-offline
- Better Auth + Drizzle: ทั้ง 0.45.x และ 1.0 rc อยู่ใน peer range ทางเลือกไหนก็ไม่ชน
- ไม่พบข้อขัดแย้งระหว่าง next-intl 4.15, Next 16.4 และ Tailwind 4 ในเอกสารที่เปิด (ไม่ได้ทดสอบจริง)

## ผลต่อโปรเจกต์
- PRD ข้อ 5/6 "โฮสต์ฐานข้อมูลใกล้ไทย": ต้องรู้ก่อนว่าฟรีเลือกสิงคโปร์/โตเกียวได้ ให้ boss/Architect ตรวจด้วย `turso db locations` หลังมีบัญชี ถ้าได้เฉพาะโตเกียวก็ยังใกล้ไทย
- ต้องตั้ง `regions` ของ function ให้ตรงกับ DB (sin1 หรือ hnd1) ไม่งั้นค่าเริ่มต้น iad1 ทำให้ทุก query ข้ามทวีป
- ความเสี่ยงใหม่สำหรับ PRD ข้อ 8: Turso archive หลังว่าง 10 วัน และเจ้าของบริษัทเปลี่ยน Architect ควรเขียนแผนสำรอง (Drizzle ทำให้สลับไป Postgres/Neon ได้แต่ต้องเขียน schema ใหม่) และพิจารณา cron วันละครั้งเพื่อกันหลับ (ข้อเสนอของ researcher ยังไม่ได้ทดสอบว่านับเป็น "activity")
- Cron วันละครั้งเท่านั้น ใช้งานที่ต้องถี่กว่านั้นไม่ได้

## ยังไม่รู้
- Turso ฟรีเลือกสิงคโปร์ได้ไหม · ข้อมูลใน DB ที่ถูก archive ยังอยู่ครบหรือไม่ และ unarchive ใช้เวลาเท่าไร
- เงื่อนไขแพ็กเกจฟรีหลัง Supabase ปิดดีล · พฤติกรรมเมื่อเกินโควตาของแพ็กเกจฟรี
- Vercel นิยามคำว่า "commercial" ว่าอย่างไรกรณีโปรเจกต์ไม่แสวงกำไรที่รับบริจาค (ไม่มีในเอกสาร)
- Neon ฟรีเลือกสิงคโปร์ได้จริงหรือไม่
