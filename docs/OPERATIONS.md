# OPERATIONS — ขั้นตอนตั้งค่าและดูแลระบบ (สำหรับ boss)

> เจ้าของ: ops-release · เขียน/ตรวจเอกสารทางการ: **2026-11-17** · แก้สถานะล่าสุด **2026-11-23** (ข้อ 8.ง ข สถานะ และ ค หมายเหตุ 2) · ก่อนหน้า 2026-11-22 (ข้อ 8.ง ข, ค หมายเหตุ 2 และ 8.ง ทางหลัก) · ก่อนหน้า 2026-11-20 (ข้อ 2.3, 8.ข, 8.จ) · ก่อนหน้า 2026-11-19 (ข้อ 1.6, 2.3, 3, 7, 8.ฉ) · เขียนให้คนที่ไม่ใช่วิศวกรทำตามได้ · repo นี้เป็นสาธารณะ จึง **ห้ามใส่** รหัสโปรเจกต์ ชื่อโปรเจกต์จริง URL หน้าจัดการที่มีรหัส หรืออีเมลลงในไฟล์นี้ — ที่ใดต้องใช้ค่าเหล่านั้น เขียนเป็น `<...>` ให้เปิดดูจากหน้าจอของ boss เอง
> สัญลักษณ์: **[ยืนยันไม่ได้]** = เอกสารทางการที่เปิดดูไม่ได้ระบุ หรือทดสอบไม่ได้จนกว่าจะ push/deploy จริง

## สารบัญ

1. [ตั้งโปรเจกต์บน Vercel ครั้งแรก](#1-ตั้งโปรเจกต์บน-vercel-ครั้งแรก)
2. [S6: รุ่น Node และวิธีรัน migration ตอน deploy](#2-s6-รุ่น-node-และวิธีรัน-migration-ตอน-deploy)
3. [Security headers และ CSP](#3-security-headers-และ-csp)
4. [CI และการออกรุ่น (ไม่มีอะไรให้ boss ทำ)](#4-ci-และการออกรุ่น)
5. [เมื่อความลับหลุด](#5-เมื่อความลับหลุด)
6. [วิธีปรับ repo กลับเป็น private](#6-วิธีปรับ-repo-กลับเป็น-private)
7. [ยังไม่ได้ทำในรอบนี้](#7-ยังไม่ได้ทำในรอบนี้)
8. [R1: Gmail ของแอป, Google, env บน Vercel, โค้ดเชิญ, cron, งานประจำรายเดือน](#8-r1-บัญชีผู้ใช้--gmail-ของแอป-google-env-บน-vercel-โค้ดเชิญ)

---

## 1. ตั้งโปรเจกต์บน Vercel ครั้งแรก

ทำครั้งเดียว ใช้เวลาประมาณ 15 นาที ต้องมี: บัญชี Vercel (แพ็กเกจ Hobby ฟรี) ที่ผูกกับบัญชี GitHub เจ้าของ repo · บัญชี Neon ที่มีข้อมูล 2 ชุด (`production` และ `dev`)

### 1.1 สร้างโปรเจกต์จาก GitHub

1. เปิด <https://vercel.com/new> (หรือที่หน้า Dashboard กดปุ่ม **Create New** แล้วเลือก **Project**) · ตรวจว่าเลือกทีม/บัญชีของตัวเองที่มุมซ้ายบนแล้ว
2. ในรายการ **Import Git Repository** เลือก repo `fatcatfit` กดปุ่ม **Import**
   - ถ้าไม่เห็น repo: กด **Adjust GitHub App Permissions** ใต้รายการ → ในหน้า GitHub ที่เปิดขึ้น ใต้ **Repository access** เพิ่ม repo นี้ → **Save** → กลับมารีเฟรชหน้า Vercel
3. หน้า **Configure Project**:
   - **Framework Preset**: ต้องขึ้นเป็น **Next.js** อัตโนมัติ (ถ้าไม่ขึ้นให้เลือกเอง)
   - **Root Directory**: ปล่อยว่าง (ค่าเดิม)
   - **Build Command / Install Command / Output Directory**: **อย่าแก้** — ค่าอยู่ในไฟล์ `vercel.json` ของ repo แล้ว (ตั้ง build ให้รัน `scripts/release-migrate.ts` ก่อน `npm run build` ซึ่งไม่ทำอะไรจนกว่าจะเปิดใช้ ดูข้อ 2.3)
   - **Environment Variables**: ใส่ตามข้อ 1.2 ได้เลยตรงนี้ (หรือข้ามไปใส่ทีหลังที่ **Settings → Environment Variables** ก็ได้)
4. กด **Deploy**

> **สิ่งที่จะเกิด และเป็นเรื่องปกติ**: Vercel จะ build branch `main` ทันทีที่ import ถ้า `main` ยังไม่มีโค้ดแอป (pull request ของรอบ R0 ยังไม่ถูก merge) การ deploy ครั้งแรกนี้จะ **ล้มเหลว** ไม่ต้องตกใจ ไม่มีอะไรเสียหาย — Vercel จะสร้าง Preview ให้ทุก pull request อยู่แล้ว ใช้ Preview ของ PR R0 ตรวจ และ Production จะขึ้นเองหลัง boss กด merge

### 1.2 ตัวแปร env ที่ต้องใส่

ที่: โปรเจกต์ → **Settings** → **Environment Variables** → ปุ่ม **Add** (ช่อง **Key** = ชื่อตัวแปร, ช่อง **Value** = ค่า, ติ๊กช่อง environment ตามตาราง)

| Key | Production | Preview | Development | ค่าคืออะไร |
|---|---|---|---|---|
| `DATABASE_URL` | Neon ชุด **production** แบบ **pooled** | Neon ชุด **dev** แบบ pooled | Neon ชุด dev แบบ pooled | ดูข้อ 1.3 |
| `DATABASE_URL_UNPOOLED` | Neon ชุด **production** แบบ **unpooled (direct)** | Neon ชุด dev แบบ unpooled | Neon ชุด dev แบบ unpooled | ดูข้อ 1.3 |
| `BETTER_AUTH_SECRET` | ค่าสุ่ม **A** | ค่าสุ่ม **B** | ค่าสุ่ม **B** | ดูข้อ 1.4 — A กับ B ต้องเป็นคนละค่า |

วิธีใส่ตัวแปรที่ค่าต่างกันตาม environment: เพิ่มตัวแปรชื่อเดียวกัน **สองครั้ง** — ครั้งแรกติ๊กเฉพาะ **Production** ใส่ค่าของ production · ครั้งที่สองติ๊กเฉพาะ **Preview** และ **Development** ใส่ค่าของ dev

กฎเหล็ก (ข้อมูลจริงของเพื่อนอยู่ที่ production):
- **Preview และ Development ต้องชี้ฐานข้อมูลชุด `dev` เท่านั้น** ห้ามใส่ connection string ของ production ในช่อง Preview/Development เด็ดขาด (Preview รันโค้ดจาก branch ที่ยังไม่ผ่านการตรวจ)
- ถ้าช่องประเภท (type) ให้เลือก **Secret** สำหรับตัวแปรทั้ง 3 ตัวนี้ ให้เลือก Secret (ค่าจะอ่านกลับไม่ได้หลังบันทึก — ต้องเก็บค่าไว้ในที่ปลอดภัยของตัวเอง เช่นโปรแกรมจัดการรหัสผ่าน) · ถ้า Development เลือก Secret ไม่ได้ ใช้ Config [ยืนยันไม่ได้ว่าตัวเลือกนี้มีใน Development — เอกสารบอกเพียงว่ามีสองชนิดคือ Config กับ Secret]
- หลังเพิ่ม/แก้ตัวแปร ต้อง **Redeploy** ถึงจะมีผล (ตัวแปรมีผลกับ deployment ใหม่เท่านั้น) · แหล่ง: [Environment variables](https://vercel.com/docs/environment-variables) (เปิดดู 2026-11-17)

ตัวแปรของ R1 (Google, อีเมล ฯลฯ) ดูข้อ 8

### 1.3 หา connection string ของ Neon (pooled กับ unpooled)

1. เปิด <https://console.neon.tech> เลือกโปรเจกต์ → เลือก **Branch** ที่ต้องการ (ชุด `production` หรือชุด `dev`)
2. กดปุ่ม **Connect** ที่แถบบนของหน้า → ในหน้าต่าง **Connect to your branch** เลือก Branch, Database และ Role
3. **Pooled**: เปิดสวิตช์ **Connection pooling** เป็น **เปิด** → คัดลอกข้อความ (hostname จะมี `-pooler` อยู่ในชื่อ เช่น `ep-xxxx-pooler.…`) → ใส่ในตัวแปร `DATABASE_URL`
4. **Unpooled (direct)**: ปิดสวิตช์ **Connection pooling** → คัดลอกข้อความ (hostname **ไม่มี** `-pooler`) → ใส่ในตัวแปร `DATABASE_URL_UNPOOLED`
5. ทำซ้ำกับอีกชุด (production/dev) ให้ครบ 4 ค่า แล้วเทียบกับตารางข้อ 1.2 อย่าให้สลับชุดกัน

เหตุผล: สวิตช์นี้เปลี่ยนแค่ชื่อ host ในข้อความที่แสดง · การ migrate ต้องใช้ direct เพราะ pooler ของ Neon ทำงานแบบ transaction pooling ซึ่งเครื่องมือ migration อาจใช้ไม่ได้ · แอปตอนรันใช้ pooled · แหล่ง: [Neon — Connection pooling](https://neon.com/docs/connect/connection-pooling) (เปิดดู 2026-11-17)

### 1.4 สร้างค่า `BETTER_AUTH_SECRET`

ต้องเป็นข้อความสุ่มยาวอย่างน้อย 32 ตัวอักษร ([Better Auth — Installation](https://www.better-auth.com/docs/installation), เปิดดู 2026-11-17) · ต้องสร้าง **2 ค่า** (A สำหรับ production, B สำหรับ preview/development) · ห้ามพิมพ์เอง ห้ามใช้ซ้ำกับที่อื่น

วิธีที่ 1 (Windows PowerShell — ไม่ต้องติดตั้งอะไร): เปิด PowerShell แล้ววางทีละบรรทัด

```powershell
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

ข้อความที่พิมพ์ออกมา (ประมาณ 44 ตัวอักษร) คือค่าที่ใช้ · รัน 3 บรรทัดนี้ซ้ำอีกครั้งเพื่อได้ค่าที่สอง

วิธีที่ 2 (ถ้ามี Node.js ในเครื่อง): `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

เก็บทั้งสองค่าในโปรแกรมจัดการรหัสผ่าน อย่าส่งในแชทหรืออีเมล

### 1.5 ตรวจหลัง deploy

1. เปิดหน้า deployment ใน Vercel รอจนสถานะเป็น **Ready**
2. เปิด `https://<โดเมนของ deployment>/api/health` ต้องขึ้น `{"ok":true}` · ถ้าขึ้น `{"ok":false}` (HTTP 503) แปลว่าต่อฐานข้อมูลไม่ได้ → ตรวจค่า `DATABASE_URL` ว่าใส่ถูกชุด ไม่มีช่องว่างปนมา และกด **Redeploy** อีกครั้ง
   - ฐานข้อมูล Neon ฟรีหลับหลังไม่มีคนใช้ 5 นาที การเรียกครั้งแรกอาจช้าไม่กี่วินาที — ลองใหม่ได้
3. **ภูมิภาคของ function ต้องเป็น Singapore (`sin1`)**: ค่านี้ตั้งใน `vercel.json` (`"regions": ["sin1"]`) แล้ว · ตรวจจริงโดยเปิด PowerShell รัน `curl.exe -I https://<โดเมนของ deployment>/api/health` แล้วดูบรรทัด `x-vercel-id:` ต้องมี `sin1` อยู่ในข้อความ (เอกสารบอกว่า header นี้แสดงภูมิภาคที่ function รัน) · แหล่ง: [Response headers](https://vercel.com/docs/headers/response-headers), [Function regions](https://vercel.com/docs/functions/configuring-functions/region) (เปิดดู 2026-11-17) · อีกทางหนึ่ง: **Settings → Functions → Function Regions** ต้องเห็น Singapore · แพ็กเกจ Hobby เลือกได้ภูมิภาคเดียว (ตรงกับที่เราใช้)
   - **[ยืนยันไม่ได้จนกว่า deploy จริง]** ว่า `x-vercel-id` ของโปรเจกต์นี้ขึ้น `sin1` จริงและตำแหน่งปุ่มบนหน้าจอตรงกับเอกสาร

### 1.6 ตั้งค่าความปลอดภัยของ Vercel (ตรวจครั้งเดียว)

- **Settings → Deployment Protection**: แนะนำใช้ **Standard Protection** (ปกป้อง URL ของ Preview ให้เข้าได้เฉพาะคนที่ล็อกอิน Vercel — ไม่ปกป้องโดเมน production) · เอกสารบอกว่ามีให้ทุกแพ็กเกจรวม Hobby · **[ยืนยันไม่ได้]** ว่าโปรเจกต์ใหม่เปิดไว้เป็นค่าเริ่มต้นหรือไม่ ให้เปิดดูแล้วตั้งเอง · แหล่ง: [Deployment Protection](https://vercel.com/docs/deployment-protection)
- **ถ้าปิด Deployment Protection ชั่วคราวเพื่อทดสอบ preview** (เช่นให้ทดสอบได้โดยไม่ต้องล็อกอิน Vercel) ต้อง **เปิดคืน** หลังทดสอบเสร็จ · ห้ามปล่อยปิดค้างไว้
- **Settings → Security → Git Fork Protection**: เปิดไว้ (ค่าเริ่มต้นตามเอกสาร) — pull request จากคนนอกจะไม่ถูก deploy จนกว่า boss จะอนุมัติ เพื่อกันไม่ให้ตัวแปร env รั่ว · แหล่ง: [Vercel for GitHub — Deployment Authorizations for Forks](https://vercel.com/docs/git/vercel-for-github)
- ถ้าเห็น pull request จากคนที่ไม่รู้จักและมีปุ่มขออนุมัติ deploy ให้ **ไม่อนุมัติ** จนกว่าจะปรึกษา Lead

---

## 2. S6: รุ่น Node และวิธีรัน migration ตอน deploy

### 2.1 รุ่น Node

ข้อเท็จจริง ([Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), หน้าอัปเดต 2026-02-27; [ประกาศ Node.js 26 LTS](https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel) 2026-10-29; [Node.js 20 deprecation](https://vercel.com/changelog/node-js-20-is-being-deprecated) — เปิดดู 2026-11-17):

- Vercel รองรับ **26.x (ค่าเริ่มต้นของโปรเจกต์ใหม่), 24.x, 22.x** · เลือกได้เฉพาะเลขหลัก (minor/patch Vercel อัปให้เอง)
- Node.js 20 ถูกประกาศเลิกรองรับ 1 ตุลาคม 2026 (ผ่านไปแล้ว) · `engines.node` ของโปรเจกต์ตอนนี้ปักเป็น `26.x` แล้ว (เดิมเป็น `>=20.9` ซึ่ง Vercel จะตีความเป็น "รุ่นล่าสุดที่รองรับ" และประกาศ Node 26 บอกว่าโปรเจกต์ที่ engines เปิดกว้างจะถูกอัปเป็น 26 เองตอน deploy ครั้งถัดไป จึงปักไว้เพื่อให้การเปลี่ยนรุ่นเป็นการตัดสินใจของเรา)
- ตั้งได้สองที่: `package.json` → `engines.node` (มีผลเหนือการตั้งในหน้าเว็บ) หรือ Settings → Build and Deployment → Node.js Version

**สถานะ: ปักเป็น `26.x` ครบทุกจุดที่ใช้จริง**: เครื่องพัฒนา (Node 26), CI (`node-version: 26.x` ใน workflow) และ Vercel (ตาม `engines`) · ถ้าเปลี่ยนรุ่นภายหลัง ต้องแก้ `package.json`, `ci.yml` และ `release.yml` พร้อมกัน (ค้นหา `26.x`)

หมายเหตุจากประกาศ Node 26: `fetch` ในตัวใช้ HTTP/2 เป็นค่าเริ่มต้น — แอปนี้ยังไม่ใช้ `fetch` ไปเรียกบริการภายนอก (ฐานข้อมูลใช้ `pg`) ถ้าใน R1 พบปัญหาตอนเรียก API ภายนอก ให้ลองตั้งตัวแปร `VERCEL_FETCH_DISABLE_H2=1` ตามที่ประกาศระบุ

### 2.2 เทียบวิธีรัน migration ตอน deploy

เงื่อนไขจาก ADR 0001 ข้อ 6: ใช้ `drizzle-kit generate` → ไฟล์ SQL ใน `drizzle/` → รันด้วย migrator · **ห้าม `push` กับ production** · **ห้ามรันตอน cold start ของ function** · และ boss ต้องทำมือน้อยที่สุด

| | **A. ใน build command ของ Vercel (เฉพาะ Production)** ← แนะนำ | B. GitHub Actions หลัง merge | C. boss รันเองจากเครื่อง |
|---|---|---|---|
| boss ต้องทำ | ครั้งเดียว: เพิ่มตัวแปร `MIGRATE_ON_DEPLOY=1` (Production เท่านั้น) | ใส่ secret ของฐานข้อมูล production ใน GitHub ครั้งหนึ่ง | ทุกครั้งที่มี migration |
| ลำดับเวลา | migration รัน **ก่อน** build · ถ้าล้ม build ล้ม Vercel **ไม่สลับ** ไปรุ่นใหม่ (รุ่นเดิมยังให้บริการ) | แยกจาก deploy ของ Vercel → โค้ดใหม่อาจขึ้นก่อนหรือหลัง migration (race) ต้องมีกลไกประสานเพิ่ม | ลืมได้ → โค้ดใหม่ขึ้นแต่ตารางยังเก่า |
| ความลับ | ใช้ connection string ที่อยู่ใน Vercel Production อยู่แล้ว **ไม่เพิ่มที่เก็บความลับใหม่** | ความลับของ production ไปอยู่ใน GitHub อีกที่ (repo สาธารณะ — ต้องจำกัดให้ job ที่รันหลัง merge เท่านั้น) | connection string production อยู่ในเครื่องส่วนตัว |
| Preview แตะ production ได้ไหม | ไม่ได้: สคริปต์ตรวจ `VERCEL_ENV=production` และต้องมี `MIGRATE_ON_DEPLOY=1`; ตัวแปรสองตัวนี้ไม่มีใน Preview | ไม่ได้ ถ้า workflow รันเฉพาะ push เข้า `main` | ไม่เกี่ยว |
| migration ล้มกลางทาง | migrator ของ drizzle ครอบทั้งชุดที่ค้างอยู่ใน **transaction เดียว** (ยืนยันจากซอร์สของ drizzle-orm 0.45.4 ที่ติดตั้ง `pg-core/dialect.js` ไม่ใช่จากเอกสารทางการ) → ล้มแล้ว rollback ทั้งชุด · ยกเว้นคำสั่งที่รันใน transaction ไม่ได้ (เช่น `CREATE INDEX CONCURRENTLY`) | เหมือนกัน แต่ต้องมีคนเห็นว่า workflow แดง | เหมือนกัน |
| build สองตัวรันพร้อมกัน | สคริปต์ใช้ advisory lock ของ Postgres กันไว้ | ต้องตั้ง `concurrency` | — |
| ความเสี่ยงที่เหลือ | ดูข้อ 2.4 | ต้องดูแล 2 ระบบ | มนุษย์พลาด |

**แนะนำวิธี A** — ตัวสคริปต์ `scripts/release-migrate.ts` และ `vercel.json` (`buildCommand`) อยู่ใน repo แล้ว มีเทสต์ และ **ไม่ทำงานเลยจนกว่า boss จะตั้ง `MIGRATE_ON_DEPLOY=1` ใน Production** (สคริปต์พิมพ์ "ข้าม" แล้วจบ) ฐานข้อมูลที่ใช้คือ `DATABASE_URL_UNPOOLED` เท่านั้น (ไม่ถอยไปใช้ pooled)

### 2.3 วิธีเปิดใช้ (ใช้แล้วกับ v0.2.0 ตอน deploy 2026-11-19 — ตั้งตัวแปร**ก่อน** merge pull request ที่มี migration)

migration บน production รันแล้วตอน deploy v0.2.0 (2026-11-19 · Lead ตรวจ `/api/health` และ migration แล้ว) · ฐาน dev รัน `0001` แล้วเมื่อ 2026-11-19 · **v0.3.0 (`0002` ตาราง `app_admin`):** `MIGRATE_ON_DEPLOY` = `1` บน Production ตั้งไว้แล้วก่อน merge (Lead ยืนยัน 2026-11-22) — ต้องคงไว้ให้ deploy ของ merge นี้รัน `0002` · ไม่ต้องตั้งซ้ำ · ฐาน dev ไม่รันอัตโนมัติ · มี 3 ไฟล์ใน `drizzle/`: `0000_auth_init.sql` (R0 ตารางของ Better Auth), `0001_r1_invite_consent_profile.sql` (R1 ตารางบัญชี โค้ดเชิญ ความยินยอม แบบสอบถาม) และ `0002_r1_5_app_admin.sql` (R1.5 ตารางแอดมิน — ยังไม่รันบน production จนกว่าจะ merge) · ขั้นตอนด้านล่างใช้กับ migration ครั้งถัดไป (`0002` ของ R1.5 — ก่อน merge PR ของ R1.5 ให้ boss ตรวจว่า `MIGRATE_ON_DEPLOY` = `1` ยังอยู่บน Production: Vercel → Settings → Environment Variables ต้องเห็นแถวนี้ติ๊ก Production ถ้าไม่มีให้เพิ่มตามขั้นตอนด้านล่าง)

เมื่อ Lead แจ้งว่าถึงเวลา (migration ครั้งถัดไป):
1. Vercel → โปรเจกต์ → **Settings → Environment Variables → Add**
2. **Key** = `MIGRATE_ON_DEPLOY` · **Value** = `1` · ติ๊ก **เฉพาะ Production** (ห้ามติ๊ก Preview/Development) → **Save**
3. กด merge pull request ที่มี migration → Vercel build production ใหม่เองพร้อมตัวแปรนี้ (ไม่ต้อง Redeploy) · ถ้าตั้งตัวแปร**หลัง** merge ให้ไปที่ **Deployments** → deployment ล่าสุดของ Production → เมนู (จุดสามจุด) → **Redeploy**
4. เปิด Build Logs ของ deployment นั้น ต้องเห็นบรรทัด `release-migrate: migration เสร็จ` ก่อนขั้น `next build` (ถ้าเห็น `ข้าม (...)` แปลว่าตัวแปรยังไม่มีผล)
5. เปิด `/api/health` ต้องได้ `{"ok":true}`

วิธีปิด: ลบตัวแปร `MIGRATE_ON_DEPLOY` ออก (ไม่ต้องแก้โค้ด)

ฐานข้อมูลชุด `dev` (Preview/ในเครื่อง) ไม่รันอัตโนมัติ — Lead รัน `npm run db:migrate` กับชุด dev ก่อนทดสอบ Preview ของ PR ที่มี migration ใหม่ (boss ไม่ต้องทำ)

### 2.4 ข้อควรระวังของวิธี A (ให้ architect/platform รู้)

- **migration ต้องเขียนแบบเข้ากันได้ย้อนหลัง (expand → contract)**: ระหว่าง build โค้ดรุ่นเก่ายังให้บริการอยู่และเห็นตารางใหม่ → ห้ามลบ/เปลี่ยนชื่อคอลัมน์ในรุ่นเดียวกับที่เริ่มเลิกใช้ ให้ทำแยก 2 รุ่น (PROCESS.md ข้อ 5: migration ที่ย้อนข้อมูลไม่ได้ต้องผ่าน Lead)
- **migration ผ่านแต่ build ล้ม** = ฐานข้อมูลใหม่กว่าโค้ดที่ให้บริการอยู่ → ปลอดภัยถ้าทำตามข้อบนข้อ
- **Instant Rollback ของ Vercel ย้อนแต่โค้ด ไม่ย้อน schema** · ย้อน schema ต้องเขียน migration ใหม่ หรือกู้ข้อมูลจาก backup (ขั้นตอน backup/restore อยู่ใน R6 — ดูข้อ 7)
- build บน Vercel ต้องต่อฐานข้อมูล production ได้ (เครือข่ายขาออกของ build) **[ยืนยันไม่ได้จนกว่าจะรันจริงครั้งแรก]** — ถ้าล้ม ให้ใช้ค่า `DATABASE_URL_UNPOOLED` ตรวจก่อนเป็นอันดับแรก
- build command ใช้ `npx tsx` ซึ่งต้องมี devDependencies ตอน install (ค่าเริ่มต้นของ Vercel ติดตั้งครบ) **[ยืนยันไม่ได้จนกว่า build จริงบน Vercel]**

แหล่งข้อมูลของข้อ 2: [vercel.json (`buildCommand`, `regions`)](https://vercel.com/docs/project-configuration/vercel-json) · [System environment variables (`VERCEL_ENV` มีทั้งตอน build และ runtime)](https://vercel.com/docs/environment-variables/system-environment-variables) · [Conditional build commands](https://vercel.com/kb/guide/dynamic-build-commands) · [Neon — Connection pooling](https://neon.com/docs/connect/connection-pooling) — เปิดดู 2026-11-17

---

## 3. Security headers และ CSP

ตั้งใน `next.config.ts` (ทุกหน้าและทุก API) · เทสต์: `scripts/security-headers.test.ts` · ตรวจกับเซิร์ฟเวอร์จริง (`next start`) แล้วใน R0

| Header | ค่า | ทำไม |
|---|---|---|
| `Content-Security-Policy` | ดูด้านล่าง | จำกัดว่าหน้าเว็บโหลดอะไรจากที่ไหนได้ |
| `X-Content-Type-Options` | `nosniff` | กันเบราว์เซอร์เดาชนิดไฟล์ |
| `X-Frame-Options` | `DENY` (คู่กับ `frame-ancestors 'none'`) | กันถูกเอาไปฝังในเว็บอื่น (clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ไม่ส่งเส้นทางเต็มไปเว็บอื่น |
| `Permissions-Policy` | ปิดกล้อง ไมค์ ตำแหน่ง payment usb bluetooth serial | แอปไม่ใช้ · **ไม่ปิด** wake lock/vibrate เผื่อตัวจับเวลาพักใน R3 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (production เท่านั้น) | บังคับ https · ไม่ใส่ `preload` โดยตั้งใจ (ถอนออกจากรายการ preload ยาก) · Vercel ใส่ค่าเริ่มต้น `max-age=63072000` ให้อยู่แล้ว |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | แยกหน้าต่างจากเว็บอื่น แต่ไม่ขวาง popup ของ Google sign-in ใน R1 |

**CSP ที่เลือก** (production):
`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
(ตอน `next dev` เพิ่ม `'unsafe-eval'` ให้ React และตัด `upgrade-insecure-requests` เพราะทำให้ `http://localhost` พัง)

**เรื่อง nonce (สถานะจริง)**: ตอนนี้ยังไม่ใช้ nonce · เหตุผลเดิมที่เคยเขียนว่า "เพื่อคงหน้า static" **ใช้ไม่ได้แล้ว** เพราะทุกหน้าเป็น dynamic อยู่แล้ว (next-intl อ่านภาษาจาก cookie ผ่าน `cookies()` ใน `src/lib/i18n/request.ts` ทำให้ทุกหน้า render ทุก request) การเสียหน้า static จึงไม่ใช่ต้นทุนของ nonce อีกต่อไป · ต้นทุนที่ยังเหลือตามเอกสารของ Next ([CSP guide](https://nextjs.org/docs/app/guides/content-security-policy), เปิดดู 2026-11-17) คือใช้ร่วมกับ Partial Prerendering ไม่ได้ และต้องมี middleware/proxy สร้าง nonce ทุก request · **การตัดสินว่าจะเปลี่ยนไปใช้ CSP แบบ nonce (เอา `'unsafe-inline'` ออกจาก `script-src`) หรือไม่: boss ตัดสิน 2026-11-18 (D4) เลื่อนไปรอบ R3** — R1 คง CSP เดิม · ทำคู่กับงานออฟไลน์ของ R3 เพราะ HTML ที่ service worker เก็บต้องทดสอบด้วยกัน · ก่อนถึงตอนนั้นยอมรับความเสี่ยงตามรายการด้านล่าง

**ห้ามเอา header ของ `/serwist/*` ออก**: `next.config.ts` ตั้ง `Cache-Control: no-cache, no-store, must-revalidate` ให้ `/serwist/:path*` (ไฟล์ service worker) แยกจาก header ความปลอดภัยของทุกหน้า · ถ้าเอาออก เบราว์เซอร์/CDN อาจแคช service worker เก่าไว้ ผู้ใช้จะไม่ได้รุ่นใหม่และออกจากรุ่นที่มีบั๊กไม่ได้ · เทสต์ e2e `tests/e2e/pwa.spec.ts` ตรวจ header นี้ — ถ้าต้องแก้ให้แจ้ง Lead

**สิ่งที่ยังเปิดอยู่ (ความเสี่ยงที่ยอมรับ)**:
1. `script-src 'unsafe-inline'` และ `style-src 'unsafe-inline'` — ถ้ามีช่องโหว่ XSS สคริปต์ที่ฉีดเข้ามารันได้ CSP ไม่ช่วยกันส่วนนี้ (ยังกัน: โหลดสคริปต์จากโดเมนอื่น, ส่งข้อมูลไปโดเมนอื่นผ่าน `connect-src 'self'`, ฝังเว็บ, plugin) · Next ต้องใช้ inline script บางส่วนสำหรับ hydration
2. ทางปิดช่องนี้ในอนาคต: Subresource Integrity แบบ hash (`experimental.sri` ของ Next — ยังเป็น experimental, เอกสารเดียวกัน) ที่คง static ได้ · ให้ประเมินใหม่ใน R6 (เกต performance)
3. `connect-src 'self'` — ถ้าเพิ่มบริการภายนอกที่เบราว์เซอร์เรียกตรง (เช่นสถิติ แผนที่ รูปจากโดเมนอื่น) ต้องเพิ่มโดเมนที่ `next.config.ts` · Google sign-in ของ Better Auth เป็นการ redirect ทั้งหน้า ไม่กระทบ (ยืนยันจริงใน R1)
4. ตรวจกับ Chromium ในเบราว์เซอร์ของเครื่องพัฒนาแล้วว่าหน้าแรกโหลดโดยไม่มี error CSP ใน console · **[ยืนยันไม่ได้ยังจนกว่า service worker (pwa-offline) และหน้าจอของ frontend ถูกรวม]** ว่า CSP นี้ไม่ขวางงานของทั้งสอง — ถ้าเจอ error ให้แจ้ง Lead เพื่อให้ ops ปรับ (ผู้อื่นห้ามแก้เอง)
5. ไม่ได้ตั้ง `Cross-Origin-Embedder-Policy`/`Cross-Origin-Resource-Policy` (ไม่จำเป็นกับแอปนี้)

---

## 4. CI และการออกรุ่น

**boss ไม่ต้องทำอะไร** นอกจากกด merge เมื่อ CI เขียว

- `ci.yml` รันทุก pull request และทุก push เข้า `main`: lint → typecheck → test (รวมเทสต์ migration บนฐานข้อมูลว่าง, i18n, ขอบเขตโมดูล, `.env.example`, release) → `drizzle-kit check` → build · job `e2e` รัน Playwright (Chromium) กับแอปที่ build จริง ทั้งจอมือถือและจอเดสก์ท็อป · **ไม่มีการข้าม**: ถ้าไม่มีเทสต์หรือเทสต์ล้ม job แดง · เมื่อล้มจะเก็บ report และ trace เป็น artifact 7 วัน (เปิดจากหน้ารอบนั้นในแท็บ Actions หัวข้อ Artifacts)
- ความปลอดภัยของ CI ใน repo สาธารณะ: ไม่ใช้ `pull_request_target` · ไม่มี secret ในงานที่รันจาก PR · token อ่านอย่างเดียว · action ปักด้วย commit SHA · workflow จากคนนอกต้องรอ boss อนุมัติ (ตั้งไว้แล้วที่ repo)
- `release.yml` รันเมื่อ merge เข้า `main`: ถ้า `version` ใน `package.json` ยังไม่มี release จะสร้าง tag `vX.Y.Z` และ GitHub release จาก CHANGELOG · กติกาเลขรุ่น: [VERSIONING.md](VERSIONING.md)
- ถ้า CI แดง: เปิดแท็บ **Actions** ของ repo → คลิกรอบที่แดง → ดูขั้นที่มีกากบาทสีแดง แล้วส่งข้อความผิดพลาดให้ Lead (log ของ repo สาธารณะใครก็อ่านได้ — workflow จึงไม่พิมพ์ค่า env)
- **ถ้าทำหลายเซสชันพร้อมกัน** (หลาย branch/หลาย worktree): ก่อนเปิด pull request ต้องรวม `main` ล่าสุดเข้า branch ตัวเองก่อน แล้วรันเกตในเครื่อง (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, และ `npm run test:e2e` ถ้าแตะหน้าจอหรือ PWA) · เหตุผล: เคยมี PR ของอีกเซสชันถูก merge เข้า `main` ก่อนที่ `main` จะมี CI ทำให้ `main` แดง และ e2e เคยเขียวเพราะยังไม่มีเทสต์ · `main` ตั้งให้ต้องผ่าน check `gates` (และ `e2e`) และ branch ต้องเป็นรุ่นล่าสุดของ `main` ก่อน merge
- Dependabot ของ GitHub Actions เปิด pull request เดือนละครั้งเมื่อ action ที่ปักไว้มีรุ่นใหม่ — ส่งต่อให้ Lead ตรวจ ไม่ต้อง merge เอง

---

## 5. เมื่อความลับหลุด

**ถือว่าหลุดแล้วทันที** ถ้ามีค่าใดค่าหนึ่งต่อไปนี้ไปอยู่ในที่ที่คนอื่นเห็น: commit/PR/issue ของ repo สาธารณะ, log ของ CI, ภาพหน้าจอ, แชท/อีเมล ฯลฯ · การลบออกจากไฟล์หรือจากประวัติ git **ไม่พอ** (คนอื่น clone หรือ fork ไปแล้วได้ และระบบสแกนอัตโนมัติจับความลับใน repo สาธารณะได้ภายในไม่กี่นาที)

ลำดับ: **หมุนค่าที่ต้นทางก่อน แล้วค่อยกำจัดร่องรอย**

1. **แจ้ง Lead ทันที** บอกว่า "ค่าอะไร หลุดที่ไหน เมื่อไร" (อย่าส่งค่าที่หลุดซ้ำ)
2. หมุนค่าตามตาราง:

| ค่าที่หลุด | ทำที่ไหน | ขั้นตอน | หลังหมุน |
|---|---|---|---|
| **รหัสผ่านฐานข้อมูล** (ใน `DATABASE_URL*`) | Neon Console | เลือกโปรเจกต์ → เลือก **Branch** ที่หลุด → เมนูซ้าย **Roles** → เมนูของ role → **Reset password** → กด **Reset** → คัดลอกรหัสใหม่ (แล้วทำซ้ำในทุก branch ที่ใช้ role นั้น — การรีเซ็ตผูกกับ branch) · [Neon — Roles](https://neon.com/docs/manage/roles), เปิดดู 2026-11-17 | หา connection string ใหม่ตามข้อ 1.3 → แก้ในตัวแปร `DATABASE_URL` และ `DATABASE_URL_UNPOOLED` ของ environment นั้นบน Vercel (และ `.env.local` ของ Lead) → **Redeploy** · รหัสเก่าใช้ไม่ได้ในการเชื่อมต่อครั้งถัดไป |
| **`BETTER_AUTH_SECRET`** | เครื่องของ boss | สร้างค่าใหม่ตามข้อ 1.4 | แก้ตัวแปรบน Vercel → Redeploy · ผลต่อผู้ใช้ที่ล็อกอินอยู่: **[ยืนยันไม่ได้]** เอกสารไม่ระบุตรงๆ ว่า session เดิมใช้ต่อได้ไหม — เตรียมใจว่าทุกคนอาจต้องล็อกอินใหม่ · Better Auth มี `BETTER_AUTH_SECRETS` (พหูพจน์) สำหรับหมุนค่าโดยไม่ทำให้ข้อมูลเดิมใช้ไม่ได้ — ให้ Lead/security-privacy ศึกษาก่อนใช้ในรอบ R1 |
| **Google OAuth client secret** (R1) | Google Cloud Console → APIs & Services → Credentials → OAuth client ของแอป | สร้าง/รีเซ็ต secret ใหม่ (ชื่อปุ่มตามหน้าจอ Google ณ ตอนนั้น) | แก้ `GOOGLE_CLIENT_SECRET` บน Vercel → Redeploy |
| **รหัสผ่านแอป Gmail** (`SMTP_PASS`, R1) | บัญชี Google ของแอป → Security → App passwords | ลบรหัสผ่านแอปเก่า สร้างใหม่ | แก้ `SMTP_PASS` บน Vercel → Redeploy |
| **`CRON_SECRET`** (R1) | เครื่องของ boss | สร้างค่าสุ่มใหม่ตามข้อ 8.ซ | แก้บน Vercel (Production) → **Redeploy** (เอกสาร Vercel ระบุว่าต้อง redeploy ให้ค่าใหม่มีผล) |
| **token ของ GitHub / Vercel** | GitHub: Settings → Developer settings → Personal access tokens · Vercel: Account Settings → Tokens | ลบ (revoke) token ที่หลุด | — |

3. **ตรวจว่ามีใครใช้ค่าที่หลุดไปแล้วหรือยัง**: Neon Console ดูกิจกรรม/การเชื่อมต่อผิดปกติ · Vercel → โปรเจกต์ → **Logs** ดูคำขอแปลก · บอก Lead ผลที่เห็น
4. ถ้าค่าอยู่ใน commit ของ repo: Lead ตัดสินว่าจะเขียนประวัติ git ใหม่หรือไม่ (ทำได้เฉพาะ branch ที่ยังไม่ merge — `main` ห้าม force push) · ถ้าค่าถูกหมุนแล้ว ค่าเก่าในประวัติไม่มีอันตราย
5. GitHub **push protection** อาจบล็อกการ push ที่มีความลับ — **ห้ามกด bypass** ให้ลบความลับออกจาก commit (ไม่ใช่แค่จากไฟล์ล่าสุด) หรือบอก Lead
6. ถ้าสงสัยว่า **ข้อมูลส่วนตัวของสมาชิก** (น้ำหนัก อีเมล) รั่วด้วย ไม่ใช่แค่ความลับ: ทำข้อ 1–3 แล้วเพิ่ม: ปรับ repo เป็น private ตามข้อ 6 ถ้าข้อมูลอยู่ใน repo · ให้ security-privacy ประเมินเรื่องการแจ้งเจ้าของข้อมูล/หน่วยงานตาม PDPA (เอกสารนี้ไม่ได้ยืนยันเงื่อนไขทางกฎหมายหรือกรอบเวลาจากแหล่งทางการ — ห้ามอ้างตัวเลขจากเอกสารนี้) · แผนรับมือข้อมูลรั่วฉบับเต็มทำใน R6 (ข้อ 7)

---

## 6. วิธีปรับ repo กลับเป็น private

ทำเมื่อไร: ไม่อยากเปิดสาธารณะอีกต่อไป หรือมีข้อมูลที่ไม่ควรเปิดหลุดเข้าไป (แต่ **ต้องหมุนความลับตามข้อ 5 ก่อนเสมอ** เพราะคนที่ clone/fork ไปแล้วยังมีสำเนา)

ขั้นตอน (GitHub — [Setting repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility), เปิดดู 2026-11-17):
1. เปิดหน้า repo → แท็บ **Settings** (ถ้าไม่เห็น กดเมนูจุดสามจุดข้างแท็บ)
2. เลื่อนลงล่างสุดถึงกรอบ **Danger Zone** → แถว **Change repository visibility** → ปุ่ม **Change visibility**
3. เลือก **Private** → พิมพ์ชื่อ repo เพื่อยืนยัน → อ่านข้อความผลกระทบแล้วกดยอมรับ → **Make this repository private**

ผลที่เอกสาร GitHub ระบุ: ดาวและผู้ติดตามหายหมด · **fork สาธารณะที่มีอยู่ยังเป็นสาธารณะและถูกแยกออกจาก repo** · Dependabot alerts และ dependency graph ยังอยู่ แต่กฎ alert แบบกำหนดเองจะปิดถ้าไม่มี GitHub Code Security · code scanning ใช้ไม่ได้ถ้าไม่มี Code Security · GitHub Pages ถูกยกเลิกการเผยแพร่บนแพ็กเกจ Free

สิ่งที่เปลี่ยนสำหรับโปรเจกต์นี้ และ **เอกสารที่เปิดดูไม่ได้ยืนยัน**:
- **GitHub Actions**: repo private บนแพ็กเกจ Free ใช้ได้ประมาณ 2,000 นาทีต่อเดือน (เอกสารบอกเป็นวงเงิน 12 ดอลลาร์สหรัฐต่อเดือน อัตรา 0.006 ดอลลาร์ต่อนาทีสำหรับ runner Linux 2 คอร์ — ตัวเลข 2,000 นาทีเป็นผลคำนวณของผู้เขียน) · repo สาธารณะใช้ฟรีไม่จำกัด ([About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)) · CI ของเรา 1 รอบใช้เวลาประมาณไม่กี่นาที
- **การป้องกัน branch `main` และ required status checks บน repo private ของบัญชี Free**: **[ยืนยันไม่ได้]** หน้าเอกสารที่เปิดไม่ได้ระบุ — หลังปรับเป็น private ให้เปิด **Settings → Branches** ตรวจว่ากฎยังอยู่และบังคับได้ ถ้าไม่ ให้แจ้ง Lead (ต้องหาทางอื่นหรือใช้แพ็กเกจที่มีฟีเจอร์นี้)
- **secret scanning / push protection บน repo private**: **[ยืนยันไม่ได้]** ว่ายังใช้ได้ฟรีหรือไม่
- **Vercel ยังเชื่อมกับ repo private ได้ไหมบนแพ็กเกจ Hobby**: **[ยืนยันไม่ได้]** จากเอกสารที่เปิด (เอกสารกล่าวถึงว่า import ได้เมื่อเป็นเจ้าของ repo ส่วนตัว) — ตรวจหลังปรับว่า deployment ยังทำงาน
- **การเปลี่ยน workflow สำหรับ private**: ไม่ต้องแก้ไฟล์ — แต่ข้อกำหนด "ห้าม `pull_request_target`/ห้าม secret ใน PR" ควรคงไว้

หลังปรับแล้ว: ให้ Lead รันเกต/ push ทดสอบ 1 รอบว่า CI และ Vercel ยังทำงาน

---

## 7. ยังไม่ได้ทำในรอบนี้

| เรื่อง | รอบ | หมายเหตุ |
|---|---|---|
| ~~การส่งอีเมล OTP ผ่าน Gmail~~ | R1 | ทำแล้ว — ข้อ 8 · spike A4 ทำแล้ว 2026-11-19 (ข้อ 8.ฉ) |
| ~~cron (`/api/cron/daily`) และ `CRON_SECRET`~~ | R1 | ทำแล้ว — `vercel.json` มี `crons` วันละครั้ง · Vercel ส่ง `Authorization: Bearer <CRON_SECRET>` · boss ตั้งค่าตามข้อ 8.ซ |
| backup/restore ที่ลองทำจริง + แผนรับมือข้อมูลรั่วฉบับเต็ม + health check เชิงลึก + นโยบาย log ไม่มีข้อมูลส่วนตัว | R6 | ตอนนี้ `/api/health` ตอบแค่ ok/ไม่ ok และ log ของแอปไม่พิมพ์ connection string หรือ error object ของฐานข้อมูล |
| ~~ตั้ง required status check บน `main`~~ | — | ตั้งแล้ว: กฎ `protect-main` (ใช้งานอยู่) บังคับ `gates` และ `e2e` · ตรวจ 2026-11-19 |

---

## 8. R1: บัญชีผู้ใช้ — Gmail ของแอป, Google, env บน Vercel, โค้ดเชิญ

> เขียน: 2026-11-18 · ทำตามลำดับ ก ข ค ง · ทุกขั้นในข้อนี้ boss ต้องทำเอง (สร้างบัญชีและใส่ความลับ agent ทำแทนไม่ได้) · ชื่อปุ่มของ Google/Vercel เปลี่ยนได้ ถ้าหน้าจอไม่ตรง ให้ถ่ายภาพ (บังค่าความลับ) ส่ง Lead · สิ่งที่ไม่ได้เปิดเอกสารยืนยันในรอบนี้ทำเครื่องหมาย **[ยืนยันไม่ได้]**

### ก. สร้าง Gmail ของแอป และ app password (สำหรับส่งรหัส OTP)

ใช้บัญชี Gmail **ใหม่เฉพาะของแอป** ไม่ใช่อีเมลส่วนตัวของ boss (ผู้ใช้เห็นชื่อผู้ส่ง และต้องหมุนความลับของบัญชีนี้ได้โดยไม่กระทบชีวิตส่วนตัว)

1. เปิด <https://accounts.google.com/signup> สร้างบัญชี Gmail ใหม่ (ตั้งชื่อให้ดูเป็นแอป) · เก็บรหัสผ่านไว้ในโปรแกรมจัดการรหัสผ่าน
2. ล็อกอินบัญชีนั้น → <https://myaccount.google.com/security> → หัวข้อ **How you sign in to Google** → **2-Step Verification** → **Get started** → ทำตามขั้นตอนจนเปิดสำเร็จ
3. เปิด <https://myaccount.google.com/apppasswords> (ถ้าไม่เห็นหน้านี้ แปลว่า 2-Step ยังไม่เปิดสมบูรณ์ — กลับไปทำข้อ 2) · ช่อง **App name** พิมพ์ `fatcatfit` → กด **Create**
4. Google แสดงรหัส 16 ตัวอักษร (แสดง **ครั้งเดียว**) → คัดลอกเก็บในโปรแกรมจัดการรหัสผ่านทันที (ใส่แบบไม่มีช่องว่าง) → นี่คือ `SMTP_PASS` · อย่าส่งในแชท อย่า commit
5. ค่าอื่น: `SMTP_USER` = ที่อยู่ Gmail ของแอปทั้งหมด · `SMTP_HOST` = `smtp.gmail.com` · `SMTP_PORT` = `465` · `EMAIL_FROM` = `Fat Cat Fit <ที่อยู่ Gmail ของแอป>` (Gmail เขียนทับที่อยู่ผู้ส่งเป็นบัญชีที่ล็อกอินเสมอ **[ยืนยันไม่ได้จากเอกสาร — เป็นพฤติกรรมที่ทราบทั่วไป]** จึงอย่าตั้งเป็นที่อยู่อื่นจนกว่าจะย้ายไปโดเมนของเรา)

**ลิมิตและข้อควรรู้ (จากเอกสาร Google ที่ researcher เปิดดู 2026-11-18):**
- host/port: `smtp.gmail.com` พอร์ต 465 (SSL) หรือ 587 (STARTTLS) ([Workspace: ส่งอีเมลจากเครื่องพิมพ์ สแกนเนอร์ หรือแอป](https://knowledge.workspace.google.com/admin/gmail/send-email-from-a-printer-scanner-or-app))
- จำนวนต่อวัน: **เอกสาร Google ขัดกันเอง** — หน้า Gmail ช่วยเหลือ ([answer 22839](https://support.google.com/mail/answer/22839)) บอก 500 ฉบับ/วัน · หน้า Workspace บอก 2,000 ฉบับ/วัน → ยึด **500** เป็นฐาน · เพดานในแอป `OTP_DAILY_CAP` ค่าเริ่ม 400 (เต็มแล้วผู้ใช้ขอรหัสไม่ได้ถึงวันถัดไป แอปไม่ล่ม) · ถ้าเกินจริง Google แจ้ง "You have reached a limit" ส่งได้อีกใน 1–24 ชั่วโมง
- app password: Google เขียนว่า "ไม่แนะนำ" และบัญชี Workspace ต้องใช้ OAuth แทนตั้งแต่ 2025-05-01 · **ยังไม่รู้ว่าบัญชี Gmail ส่วนตัวจะถูกบังคับเมื่อไร**
- เปลี่ยนรหัสผ่านบัญชี Gmail = app password ทุกตัวถูกยกเลิก (อาการ: ผู้ใช้ไม่ได้รับรหัส และ log ของ Vercel ขึ้น `[email] send failed: EAUTH`) → สร้างใหม่ แก้ `SMTP_PASS` บน Vercel → Redeploy
- เมลอาจเข้า spam: ทดสอบก่อนชวนเพื่อน (ข้อ ฉ)
- **ทางหนีเมื่อ Google บังคับหรือบล็อก:** ซื้อโดเมน แล้วใช้ผู้ส่งแบบ HTTP API (เช่น Resend) — ต้องเพิ่มตัวส่งในโค้ดชั้นอีเมล (`EMAIL_TRANSPORT=http` ยังไม่มี) ไม่ต้องแตะ auth · ถ้าแค่ย้ายผู้ส่ง SMTP ไปโดเมนของเราเอง แก้เฉพาะ `EMAIL_FROM` และ `SMTP_*` ใน Vercel

### ข. Google OAuth client (ปุ่ม "เข้าด้วย Google")

ใช้โหมด **Testing** (ไม่ต้องส่งให้ Google ตรวจแอป) ใช้ได้เฉพาะอีเมลที่ boss เพิ่มเป็น test user · จำนวนสูงสุดของ test user และอายุ token ในโหมด Testing **[ยืนยันไม่ได้ในรอบนี้ — ดูหน้า Google ตอนตั้งค่า]**

1. เปิด <https://console.cloud.google.com> ล็อกอินด้วยบัญชี Google ของ boss → แถบบนซ้าย **Select a project** → **New project** → ชื่อ `fatcatfit` → **Create** → เลือกโปรเจกต์นั้น
2. เมนูซ้าย **APIs & Services** → **OAuth consent screen** (ถ้าเป็นหน้าใหม่ชื่อ **Google Auth Platform** กด **Get started**) · **App name** = `Fat Cat Fit` · **User support email** = อีเมลของ boss · **Audience / User type** = **External** · **Contact email** = อีเมลของ boss → ยอมรับนโยบาย → **Create**
3. **Audience** (หรือ **Publishing status**): ตรวจว่าเป็น **Testing** **ห้ามกด Publish app** · ใต้ **Test users** กด **Add users** → ใส่อีเมล Google ของทุกคนที่จะใช้ Google login (รวมของ boss) → **Save**
4. **Data Access** (หรือ **Scopes**) → **Add or remove scopes** → ติ๊ก **openid**, **.../auth/userinfo.email**, **.../auth/userinfo.profile** เท่านั้น → **Update** → **Save**
5. **Clients** (หรือ **Credentials** → **Create credentials** → **OAuth client ID**) → **Create client** → **Application type** = **Web application** · ชื่อ `fatcatfit-web`
6. **Authorized redirect URIs** → **Add URI** ทีละบรรทัด (รูปแบบ `<BETTER_AUTH_URL>/api/auth/callback/google`):
   - production: `https://<โดเมน production บน Vercel>/api/auth/callback/google`
   - เครื่อง dev: `http://localhost:3000/api/auth/callback/google`
   - preview ของ branch ที่ต้องการทดสอบ Google: `https://<โดเมนของ branch นั้น>/api/auth/callback/google` — ดูโดเมนที่ Vercel → **Deployments** → deployment ของ branch → ช่อง **Domains** (เลือกโดเมนแบบคงที่ของ branch ไม่ใช่ของแต่ละ commit) · เพิ่มทีละ branch (ไม่แน่ใจว่า Google รับ wildcard **[ยืนยันไม่ได้]**) · ไม่ทดสอบ Google บน preview ก็ข้ามได้ (ล็อกอินด้วยรหัสอีเมลใช้ได้ทุกที่)
7. **Create** → ได้ **Client ID** กับ **Client secret** → คัดลอกเก็บในโปรแกรมจัดการรหัสผ่าน → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

**พฤติกรรมตั้งใจตั้งแต่ v0.2.1 (2026-11-20):** ปุ่ม "เข้าด้วย Google" ขอให้ Google แสดงหน้าเลือกบัญชี**ทุกครั้ง** (`prompt=select_account`) แม้เครื่องนี้เคยล็อกอินบัญชี Google ไว้แล้ว — ไม่ใช่อาการผิดปกติ เลือกบัญชีที่ต้องการได้เลย เหตุผลคือแอปที่ติดตั้งบนมือถือต้องสลับบัญชีได้

### ค. ใส่ env ใน Vercel

ที่: โปรเจกต์ → **Settings** → **Environment Variables** → **Add** · วิธีใส่ค่าที่ต่างกันตาม environment ดูข้อ 1.2 · ช่อง "ลับ" = เลือกชนิด **Secret/Sensitive** ถ้าหน้าจอมีให้เลือก

| ตัวแปร | Production | Preview | ลับ | ค่า |
|---|---|---|---|---|
| `DATABASE_URL` | ชุด production | ชุด **dev** | ใช่ | ข้อ 1.3 (ใส่แล้วจาก R0) |
| `DATABASE_URL_UNPOOLED` | ชุด production | ชุด **dev** | ใช่ | ข้อ 1.3 (ใส่แล้ว) |
| `BETTER_AUTH_SECRET` | ค่า A | ค่า B (คนละค่า) | ใช่ | ข้อ 1.4 (ใส่แล้ว) |
| `BETTER_AUTH_URL` | `https://<โดเมน production>` | **ไม่ต้องใส่** (หมายเหตุ 2) | ไม่ | URL เต็ม ไม่มี `/` ท้าย |
| `GOOGLE_CLIENT_ID` | ใส่ | ใส่ถ้าจะทดสอบ Google บน preview | ไม่ | ข้อ ข.7 |
| `GOOGLE_CLIENT_SECRET` | ใส่ | ใส่ถ้าจะทดสอบ Google บน preview | **ใช่** | ข้อ ข.7 |
| `EMAIL_TRANSPORT` | `smtp` | `log` (ไม่ส่งจริง) หรือ `smtp` เมื่อต้องทดสอบเมลจริง | ไม่ | `smtp` / `log` · **production ไม่ตั้ง = ส่งไม่ได้และ log ขึ้นว่าไม่ได้ตั้ง** |
| `EMAIL_FROM` | `Fat Cat Fit <gmail ของแอป>` | ใส่เมื่อใช้ `smtp` | ไม่ | ข้อ ก.5 |
| `SMTP_HOST` | `smtp.gmail.com` | ใส่เมื่อใช้ `smtp` | ไม่ | |
| `SMTP_PORT` | `465` | ใส่เมื่อใช้ `smtp` | ไม่ | |
| `SMTP_USER` | ใส่ | ใส่เมื่อใช้ `smtp` | ใช่ (เป็นที่อยู่อีเมล) | ข้อ ก.5 |
| `SMTP_PASS` | ใส่ | ใส่เมื่อใช้ `smtp` | **ใช่** | app password ข้อ ก.4 |
| `OTP_DAILY_CAP` | ไม่ต้องใส่ (ค่าเริ่ม 400) | ไม่ต้องใส่ | ไม่ | ใส่เมื่อจะเปลี่ยนเพดาน (ไม่เกิน 500) |
| `CRON_SECRET` | ใส่ (**Production เท่านั้น**) | ไม่ต้องใส่ | **ใช่** | ข้อ 8.ซ · ไม่ใส่หรือสั้นกว่า 32 ตัว = cron ได้ 500 และไม่ล้างข้อมูลหมดอายุ |
| `PRIVACY_CONTROLLER_NAME` | ใส่ | ใส่ | ไม่ (แต่**ห้ามลง repo**) | ชื่อผู้ควบคุมข้อมูลที่แสดงในประกาศความเป็นส่วนตัว |
| `PRIVACY_CONTACT_EMAIL` | ใส่ | ใส่ | ไม่ (แต่**ห้ามลง repo**) | อีเมลติดต่อเรื่องข้อมูลส่วนบุคคลที่แสดงในประกาศ |
| `MIGRATE_ON_DEPLOY` | `1` เมื่อ Lead แจ้ง (ข้อ 2.3) | **ห้ามใส่** | ไม่ | |

หมายเหตุ:
1. **Preview ต้องใช้ฐานข้อมูล dev เท่านั้น** (กฎเหล็กข้อ 1.2) · Preview ใช้ `EMAIL_TRANSPORT=log` เป็นปกติ: Vercel รันโค้ดแบบ production จึง **ไม่แสดงรหัส** ใน log (เจตนา ไม่ให้ log ที่ใครอ่านได้มีรหัส) → ถ้าต้องล็อกอินด้วยรหัสบน preview ให้ตั้ง `smtp` (ส่งเมลจริงจาก Gmail ของแอป นับรวมเพดานรายวัน) หรือให้ Lead ทดสอบในเครื่อง
2. **ตัวแปรของ Preview ทุกตัวตั้งแบบ "All Preview Branches" ห้ามผูกกับ branch ใด branch หนึ่ง** — ตั้งครั้งเดียวแล้วทุก branch ใหม่ใช้ได้ทันที (บทเรียน 2026-11-22: เคยผูกตัวแปรส่งเมลไว้กับ `r1-auth` ทำให้ preview ของ `r1-5-admin-invites` ขึ้น "ส่งรหัสไม่สำเร็จ") · **สถานะ 2026-11-23: ยังไม่แก้** (ตัวแปรส่งเมลของ Preview ยังผูกกับ `r1-auth` · OTP บน preview ใช้ไม่ได้ · เป็นงานของ Lead ไม่ใช่ของ boss) · **Preview ไม่ใส่ `BETTER_AUTH_URL`**: Better Auth 1.7 ใช้ origin ของคำขอเองเมื่อไม่ได้ตั้ง (ตรวจจากโค้ดใน `node_modules/better-auth/dist/context/create-context.mjs` 2026-11-22) จึงใช้ได้ทุกโดเมน preview · ข้อจำกัด: ปุ่ม Google บน preview ต้องลงทะเบียน redirect URI ทีละโดเมน → preview ทดสอบด้วยรหัสทางอีเมล ส่วน Google ทดสอบบน production · ถ้าเปลี่ยนโดเมน production ต้องแก้ `BETTER_AUTH_URL` ของ Production และ redirect URI ใน Google
3. หลังเพิ่ม/แก้ต้อง **Redeploy** (ข้อ 1.2)
4. เครื่อง dev (`.env.local`): คัดลอกจาก `.env.example` ตั้ง `EMAIL_TRANSPORT=log` — รหัสพิมพ์ลงหน้าต่างที่รัน `npm run dev` (เฉพาะนอก production)

### ง. ออกโค้ดเชิญให้เพื่อน (R1.5 — ออกจากมือถือได้)

**ทางหลัก (ตั้งแต่ v0.3.0): หน้าแอดมินในแอป** — ไม่ต้องใช้คอมพิวเตอร์ ไม่ต้องแตะเทอร์มินัล

1. เปิดแอปบนมือถือ (ต้องต่ออินเทอร์เน็ต — หน้านี้ไม่ทำงานออฟไลน์) → แท็บ **ฉัน** → แถว **ออกโค้ดเชิญ ›** (แถวนี้เห็นเฉพาะบัญชีที่เป็นแอดมิน)
2. ใส่ป้าย (ชื่อเล่นของเพื่อน เห็นเฉพาะคุณ ไม่ต้องใส่ชื่อจริง) เลือกอายุโค้ด (1 / 3 / 7 / 14 วัน) และจำนวนครั้งที่ใช้ได้ (1–10) → กดออกโค้ด
3. แอปแสดงโค้ดกับลิงก์เชิญ **ครั้งเดียว** (ฐานข้อมูลเก็บเฉพาะ hash กู้กลับไม่ได้ — ปิดหน้าหรือโหลดใหม่แล้วจะไม่เห็นอีก ถ้าลืมให้เพิกถอนแล้วออกใหม่) → กด **แชร์** (เปิดแอปแชร์ของเครื่อง เช่น LINE) หรือ **คัดลอกลิงก์** แล้วส่งทางแชทส่วนตัว
4. รายการด้านล่างแสดงสถานะของแต่ละโค้ด (ใช้ได้ / ใช้ครบแล้ว / หมดอายุ / เพิกถอน) และใช้ไปกี่ครั้งจากกี่ครั้ง · แอปไม่แสดงว่าใครใช้โค้ดไหน · กด **เพิกถอน** แล้วยืนยัน ถ้าส่งผิดคนหรือโค้ดหลุด
5. ถ้าไม่เห็นแถว "ออกโค้ดเชิญ" ทั้งที่ควรเป็นแอดมิน = บัญชีนั้นยังไม่ได้ถูกเพิ่มเป็นแอดมิน → ทำตามหัวข้อ "เพิ่มแอดมิน" ด้านล่าง แล้วเปิดแอปใหม่ (ปิดแล้วเปิด หรือดึงหน้า "ฉัน" ลง)

#### เพิ่ม / ถอนแอดมิน (SQL ใน Neon — ทำครั้งเดียวต่อบัญชี)

สิทธิ์แอดมินอยู่ในตาราง `app_admin` และ **แก้ได้ด้วย SQL เท่านั้น** (แอปไม่มีหน้าหรือ API ที่เขียนตารางนี้ — ตั้งใจเพื่อไม่ให้มีช่องโหว่ยกสิทธิ์ตัวเอง) · ตารางนี้สร้างโดย migration `0002` ต้องมีในฐานข้อมูลนั้นก่อน (production: ขึ้นตอน deploy รุ่น v0.3.0 ตามข้อ 2.3 · dev: Lead รัน `npm run db:migrate` ให้ก่อนทดสอบ preview)

**ข. ฐาน production** — **สถานะ 2026-11-23: ทำแล้ว** (boss ทดสอบ production ผ่านเกณฑ์ 17) · ขั้นตอนด้านล่างเก็บไว้เป็นอ้างอิงเมื่อต้องเพิ่มหรือถอนแอดมิน · ทำหลัง merge และ deploy v0.3.0 (เห็น `/api/health` เป็น `{"ok":true}`):

1. **ลำดับนี้ต้องทำก่อนข้อ 5** (แถว "ออกโค้ดเชิญ" จะไม่ขึ้นจนกว่าข้อ 5–6 สำเร็จ): บนมือถือ เปิดแอป production แล้วเข้าสู่ระบบ — ถ้ามีหน้า "ประกาศความเป็นส่วนตัวฉบับ 2026-11-20" ให้กดยินยอม 1 ครั้ง (ผู้ใช้ทุกคนต้องทำ) · ถ้ายังไม่เคยมีบัญชีบน production ให้สมัครด้วยโค้ดเชิญจากสคริปต์ก่อน (ทางสำรองด้านล่าง) · ต้องมีบัญชีในฐานก่อน ข้อ 5 ถึงจะเพิ่มแถวแอดมินได้
2. เปิด Neon Console → เลือกโปรเจกต์ของแอป
3. เมนูซ้าย **Postgres database → SQL Editor** (ชื่อเมนูตามเอกสาร Neon ตรวจ 2026-11-20 — ถ้าหน้าจอจริงต่างไป ให้ส่งภาพหน้าจอ (ปิดข้อมูลส่วนตัวแล้ว) ให้ Lead แก้เอกสาร)
4. ในหน้า SQL Editor เลือก **branch** (และฐานข้อมูล) ให้เป็น **production** ที่มุมของตัวแก้ไข — ตรวจให้ชัวร์ก่อนกด Run ทุกครั้ง ว่าไม่ได้เลือก dev (เอกสาร Neon บอกแค่ให้ "เลือก branch และฐานข้อมูล" ไม่ได้ระบุชื่อช่องเลือก — ให้ดูชื่อ branch ที่แสดงบนหน้าจอ)
5. วางคำสั่งนี้ แล้วแก้ `<อีเมลของคุณ>` เป็นอีเมลที่ใช้เข้าแอป (อยู่ในเครื่องหมาย `'` เท่านั้น · **อย่าบันทึกคำสั่งที่ใส่อีเมลแล้วลงไฟล์ใดใน repo หรือแชร์ลงที่สาธารณะ**):
   ```sql
   INSERT INTO app_admin (user_id, created_at)
   SELECT id, now() FROM "user" WHERE lower(email) = lower('<อีเมลของคุณ>')
   ON CONFLICT (user_id) DO NOTHING;
   ```
6. กด **Run** → ผลต้องเป็น 1 แถวที่เพิ่ม (`INSERT 0 1`) · ถ้าได้ 0 แถว = อีเมลไม่ตรงกับบัญชี (ลองอีเมลของ Google ที่ใช้เข้า) หรือเป็นแอดมินอยู่แล้ว
7. ตรวจ: รัน `SELECT count(*) FROM app_admin;` → ต้องได้ `1`
8. บนมือถือ: ปิดแอปแล้วเปิดใหม่ → แท็บ "ฉัน" → ต้องเห็นแถว "ออกโค้ดเชิญ ›" (ถ้าไม่เห็น ดูข้อ 8.ง.5 ด้านบน)
9. ออกโค้ด 1 อัน (ป้าย "ทดสอบ" · 1 วัน · 1 ครั้ง) → กด **แชร์** ส่งให้เพื่อน 1 คนที่ยังไม่มีบัญชีทางแชท (LINE ก็ได้) → เพื่อนเปิดลิงก์บนมือถือของเพื่อนเอง (iPhone หรือ Android อย่างน้อยฝั่งละ 1 คน ตามเกณฑ์ 17) และสมัครสำเร็จ → ยืนยันกับ Lead (โค้ดนี้จะถูกใช้ไป 1/1)
10. ออกโค้ดอีก 1 อัน (ป้าย "ทดสอบเพิกถอน" · 1 วัน · 1 ครั้ง) → กด **เพิกถอน** แล้วยืนยัน → สถานะเป็น "เพิกถอน" → เปิดลิงก์ของโค้ดนั้นบนมือถือ ต้องขึ้นว่าโค้ดนี้ใช้ไม่ได้ (ไม่ส่งรหัสไปที่อีเมล)
11. แจ้ง Lead ว่าข้อ 1–10 ผ่านทั้งหมด (พร้อมระบุเครื่องที่ใช้ทดสอบ)

**ข้อควรรู้:** โค้ดที่ออกบน production และบัญชีของเพื่อนเป็นข้อมูลจริง · ทดสอบเสร็จแล้วให้เพิกถอนโค้ดที่เหลือ

**ก. ฐาน dev (สำหรับทดสอบ preview ก่อน merge)** — ขั้นตอนเดียวกับข้างบนทุกข้อ **ต่างกันแค่ข้อ 1 และข้อ 4**: ข้อ 4 เลือก branch **dev** แทน production · ข้อ 1 ใช้บัญชีที่ใช้ทดสอบบน preview (สมัครบน preview ด้วยโค้ดเชิญจากฐาน dev) · ฐาน dev ต้องผ่าน `npm run db:migrate` แล้ว (Lead ทำ) · หรือให้ Lead ทำแทนได้

**ถอนสิทธิ์แอดมิน** (เช่นเปลี่ยนบัญชี) — ขั้นตอนเดียวกัน เปลี่ยนเฉพาะคำสั่งในข้อ 5 เป็น (แก้ `<อีเมลของคุณ>` เช่นเดิม):

```sql
DELETE FROM app_admin
WHERE user_id IN (SELECT id FROM "user" WHERE lower(email) = lower('<อีเมลของคุณ>'));
```

- สิทธิ์มีผลทันทีในคำขอถัดไป (แอปเช็กตารางนี้ทุกครั้ง ไม่เก็บสิทธิ์ไว้ในเครื่อง)
- ลบบัญชีในแอป = แถวแอดมินหายเอง · สมัครใหม่แล้วต้องเพิ่มใหม่
- แหล่งข้อมูล: [Neon — Query with Neon SQL Editor](https://neon.com/docs/get-started/query-with-neon-sql-editor) เปิดดู 2026-11-20 (หน้าระบุปรับปรุง 2026-11-08)

#### ทางสำรอง: สคริปต์ `npm run invite` (ใช้เมื่อยังไม่มีแอดมิน หรือเปิดหน้าแอดมินไม่ได้)

ใช้เมื่อสมัครบัญชีแรกก่อนจะมีแอดมิน หรือหน้าแอดมินมีปัญหา · boss รันคำสั่งในเครื่อง ต้องมี Node.js, โค้ดของ repo และรัน `npm ci` แล้ว (ถ้ายังไม่มี ให้ Lead ตั้งให้ครั้งแรก)

**connection string ของ production มาจากไหน:** Neon Console → โปรเจกต์ → Branch **production** → **Connect** → ปิดสวิตช์ **Connection pooling** → คัดลอกข้อความ (ข้อ 1.3) · Vercel ไม่ให้อ่านค่า Secret กลับ จึงต้องเอาจาก Neon · **ห้ามใส่ในไฟล์ใดๆ รวมถึง `.env.local`** — ตั้งเป็นตัวแปรชั่วคราวในหน้าต่างเทอร์มินัล แล้วปิดหน้าต่างเมื่อเสร็จ (ตัวแปรในเทอร์มินัลชนะ `.env.local`)

PowerShell ในโฟลเดอร์ของ repo:

```powershell
# 1) วางค่าเมื่อถูกถาม (ไม่ติดประวัติคำสั่ง)
$env:DATABASE_URL_UNPOOLED = Read-Host "paste production connection string"

# 2) ออกโค้ด: 1 โค้ดต่อ 1 คน ใช้ได้ 1 ครั้ง อายุสั้น (เช่น 3 วัน)
npm run invite -- create --uses 1 --days 3 --label "friend-1" --base https://<โดเมน production>

# 3) ดูรายการ / เพิกถอน
npm run invite -- list
npm run invite -- revoke --id <id จากผลของ list>

# 4) ล้างค่า แล้วปิดหน้าต่าง
Remove-Item Env:DATABASE_URL_UNPOOLED
```

- **ใช้ `--uses 1` ต่อคน และ `--days` สั้น** เพื่อให้โค้ดที่ส่งไปแล้วหมดอายุเร็วถ้าไม่มีใครใช้ · **เพิกถอนด้วย `--id` ไม่ใช่ `--code`** เพราะโค้ดที่พิมพ์ในคำสั่งจะค้างในประวัติคำสั่งของเทอร์มินัล (shell history) — ถ้าเผลอพิมพ์โค้ดจริงลงคำสั่ง ให้ถือว่าโค้ดนั้นรั่วและเพิกถอนทันที
- `create` พิมพ์ **โค้ดและลิงก์เชิญครั้งเดียว** (ฐานข้อมูลเก็บเฉพาะ hash กู้กลับไม่ได้ — ลืมให้ `revoke` แล้วออกใหม่) · ส่งลิงก์ให้เพื่อนทางแชทส่วนตัว
- โค้ดที่ออกจากสคริปต์กับจากหน้าแอดมินอยู่ในตารางเดียวกัน — เห็นและเพิกถอนได้ทั้งสองทาง
- คำสั่งไม่พิมพ์ connection string · ถ้าขึ้น `invite failed (...)` ส่งข้อความนั้นให้ Lead (ไม่มีรหัสผ่านในข้อความ)

### จ. ปัญหาที่น่าจะเจอ

| อาการ | สาเหตุที่น่าจะเป็น | แก้ |
|---|---|---|
| ไม่ได้รับรหัส OTP | spam · เพดานรายวันเต็ม · app password ถูกยกเลิก | ดูกล่อง spam · ดู Vercel Runtime Logs หา `[email] send failed:` (บอกแค่ชนิด เช่น `EAUTH` = รหัสผ่านแอปใช้ไม่ได้ ไม่มีที่อยู่/รหัส) · แก้ตามข้อ ก |
| ขอรหัสแล้วแอปตอบ 503 `email_unavailable` | `OTP_DAILY_CAP` เต็ม | รอวันถัดไป หรือเพิ่มค่า (ไม่เกิน 500) |
| Google ขึ้น `redirect_uri_mismatch` | `BETTER_AUTH_URL` หรือ redirect URI ไม่ตรงโดเมนที่เปิดจริง | ข้อ ข.6 และ ค |
| Google ขึ้น `access_denied` / app not verified | ผู้ใช้ไม่อยู่ใน Test users | ข้อ ข.3 |
| หน้า Google ให้เลือกบัญชีทุกครั้ง ทั้งที่ล็อกอินอยู่แล้ว | พฤติกรรมตั้งใจตั้งแต่ v0.2.1 (`prompt=select_account`) | ไม่ต้องแก้ · เลือกบัญชีที่ต้องการ (ข้อ ข) |

### ฉ. spike A4: `after()` + SMTP ส่งถึง 20 จาก 20 (ทำหลังข้อ ก และมี preview) — **ทำแล้ว 2026-11-19**

> **ผล:** ยิง 20 ครั้งไปอีเมลทดสอบของ boss บน preview ของ branch r1-auth · เซิร์ฟเวอร์ตอบ 200 = 12 ครั้ง · 429 = 8 ครั้ง (จาก limiter ต่อ IP ของ Better Auth) · boss นับเมลได้ **12 จาก 12** ฉบับที่รับไว้ → `after()` + SMTP ไม่ทำให้เมลหาย · ยังไม่ได้ครบ 20 เพราะ limiter ไม่ใช่เพราะเมลหาย
>
> **ข้อควรรู้เมื่อรันซ้ำ:** limiter ต่อ IP ผ่านได้ 5 ครั้ง แล้วต้องเว้น 10 นาทีนับจากครั้งที่ผ่านล่าสุด (คำขอที่ถูกบล็อกไม่ต่อเวลา) → ต้องเว้น **อย่างน้อย 10 นาทีทุกๆ 5 ครั้ง** ไม่ใช่ 125 วินาทีทุกครั้ง · ค่าเริ่ม `SPIKE_GAP_MS` ในสคริปต์ยังเป็น 125 วินาที (รอแก้โค้ด) · ล้างตัวนับต่ออีเมลในฐาน dev ก่อนทุกครั้ง (ตามบันทึกใน R1 contract)

ทดสอบความเสี่ยงที่ว่า Vercel อาจตัดฟังก์ชันก่อนส่งเมลเสร็จเมื่อส่งหลังตอบด้วย `after()` (ADR 0002 ข้อ 4) · `scripts/spike-a4.ts` ยิงขอ OTP 20 ครั้งไปที่ preview แล้วให้คนนับเมลในกล่องจดหมาย

เตรียม:
1. อีเมลทดสอบ 1 กล่องที่ boss ควบคุม · จุดกั้น OTP ไม่ส่งเมลให้อีเมลที่ไม่มีบัญชีและไม่มีโค้ดเชิญ (ADR 0002 ข้อ 2) → ออกโค้ดเชิญกับฐานข้อมูล **dev** (preview ใช้ dev): ตั้ง `DATABASE_URL_UNPOOLED` เป็นของ dev แล้วรัน `npm run invite -- create ...` · แล้วเปิดลิงก์เชิญกับอีเมลทดสอบก่อน 1 ครั้ง หรือให้ Lead เพิ่มบัญชีทดสอบในฐานข้อมูล dev
2. Preview ของ branch R1 ตั้ง `EMAIL_TRANSPORT=smtp` + `EMAIL_FROM` + `SMTP_*` (ข้อ ค · ไม่ใส่ `BETTER_AUTH_URL`) แล้ว Redeploy

รัน (PowerShell):

```powershell
$env:SPIKE_BASE_URL = "https://<โดเมนของ preview>"
$env:SPIKE_EMAIL = "<อีเมลทดสอบ>"
npx tsx scripts/spike-a4.ts
```

- สคริปต์เว้น `SPIKE_GAP_MS` ระหว่างครั้ง (ค่าเริ่ม 125 วินาที — ค่านี้ชนเพดาน limiter ดูข้อควรรู้ข้างบน) · ใช้โควต้ารายวัน 20 ฉบับ · พิมพ์ `n/20 status=<HTTP> ms=<เวลา>` (ไม่พิมพ์อีเมลเต็มหรือรหัส)
- **ผ่าน:** HTTP 200 ทุกครั้ง **และ** กล่องจดหมายได้ 20 ฉบับภายใน 2 นาทีหลังครั้งสุดท้าย (ตรวจ inbox และ spam บันทึกจำนวนที่เข้า spam)
- ได้ไม่ครบ: ดู Runtime Logs หา `[email] send failed` · ถ้าไม่มี error แต่เมลหาย = `after()` ถูกตัดก่อนส่งเสร็จ → แจ้ง Lead เปลี่ยนเป็น await การส่งก่อนตอบ
- ไม่รันใน CI (ต้องใช้ preview จริงกับ Gmail จริง)

### ช. ช่องโหว่ของ dependency (ตรวจ 2026-11-18)

Dependabot แจ้ง 3 รายการ — ทั้งหมดเป็น dependency ทางอ้อมของเครื่องมือตอน build/dev ไม่ถูกรวมในโค้ดที่รันบน production:

| แพ็กเกจ | มาจาก | กระทบ production ไหม | ที่ทำ |
|---|---|---|---|
| `esbuild` ต่ำกว่า 0.25.0 (moderate) | `drizzle-kit` → `@esbuild-kit/*` (รุ่น 0.18.20) | ไม่ — เซิร์ฟเวอร์ dev ของ esbuild ไม่ได้รันใน production | `overrides: esbuild ~0.28.2` ทั้งโปรเจกต์ (เกตผ่าน) |
| `minimatch` ต่ำกว่า 11.0.1 (moderate) | `eslint`, `typescript-eslint`, `@serwist/build` (ตอน build) | ไม่ — ใช้กับไฟล์ของเราเองตอน lint/build | `overrides: minimatch ^11.0.1` (เกตผ่าน) |
| `picomatch` ≤ 4.0.7 (high, ReDoS) | `vitest`/`vite`, `next-intl` (`@parcel/watcher`), `eslint-config-next` (`micromatch`) | ไม่ — รันกับ glob ที่เราเขียนเองใน dev/CI ไม่รับ input จากผู้ใช้ | **ยังไม่มีรุ่นแก้** (รุ่นล่าสุด 4.0.7 ยังอยู่ในช่วงที่โดน) · ไม่ override · รอรุ่นแก้แล้วอัปเดต |

(`npm audit` ยังรายงาน high อยู่ ที่เกี่ยวกับ `picomatch` ล้วนๆ จนกว่าจะมีรุ่นแก้)

### ซ. `CRON_SECRET` และงาน cron รายวัน

cron `/api/cron/daily` (ตั้งใน `vercel.json` รันวันละครั้ง 03:00 UTC) ล้างแถวหมดอายุของระบบบัญชี · ปกป้องด้วยค่า `CRON_SECRET` — Vercel ส่งค่านี้ในหัว `Authorization: Bearer ...` ให้เอง ([Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)) · ถ้าไม่ตั้งหรือสั้นกว่า 32 ตัว แอปตอบ 500 และ log `[cron:daily] CRON_SECRET missing or too short` · ค่าตรงแต่หัวคำขอผิด = 401

**สร้างค่า** (ยาวอย่างน้อย 32 ตัวอักษร เป็นตัวอักษรหรือตัวเลขล้วน ไม่มีช่องว่าง) — เลือกวิธีใดวิธีหนึ่ง:
- Bitwarden (แนะนำ ตัวสุ่มระดับเข้ารหัส): Generator → Password → ความยาว 40 → เปิดเฉพาะ A-Z, a-z, 0-9 → ปิดอักขระพิเศษ → คัดลอก
- PowerShell: วางทั้งบล็อกแล้วกด Enter — ค่าอยู่ในคลิปบอร์ด ไม่พิมพ์บนจอ

```powershell
$b = [byte[]]::new(30); [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b).Replace("+","A").Replace("/","B").TrimEnd("=") | Set-Clipboard
```

ใช้ตัวสุ่มระดับเข้ารหัสของ Windows ได้ค่าตัวอักษร/ตัวเลขยาว 40 ตัว

**ใส่บน Vercel:** Settings → Environment Variables → **Add** → ชื่อ `CRON_SECRET` → วางค่า → environment **Production เท่านั้น** → ติ๊ก Sensitive → **Save** → **Redeploy** (Deployments → deployment ล่าสุด → เมนูจุดสามจุด → Redeploy) · **ห้าม** ลงใน repo หรือแชท · เปลี่ยนค่าภายหลังทำแบบเดียวกัน (ต้อง Redeploy ทุกครั้ง)

**ดูว่า cron รันผ่าน:** Vercel → โปรเจกต์ → **Settings** → **Cron Jobs** → **View Logs** (ต้องมี deploy production ที่มี `vercel.json` นี้แล้ว) · ควรเห็นสถานะ 200 และข้อความ `[cron:daily] deleted ...` (จำนวนแถวเท่านั้น ไม่มีข้อมูลส่วนตัว) · **[ยืนยันไม่ได้]** ชื่อเมนูและปุ่มตามหน้าจอ Vercel ณ ตอนนั้น ผู้เขียนไม่ได้เปิดหน้านี้ · เห็น 500 = ยังไม่ได้ตั้ง `CRON_SECRET` ใน Production (หรือสั้นกว่า 32 ตัว) หรือยังไม่ Redeploy · เห็น 401 = ค่าที่ Vercel ส่งไม่ตรงกับค่าที่แอปอ่าน (Redeploy หลังเปลี่ยนค่า) · Runtime Logs แผน Hobby เก็บ 1 ชั่วโมง (งานวิจัย 2026-11-18) จึงควรดูหลังเวลารันไม่นาน

### ญ. งานประจำของ boss: ลบกล่อง "ส่งแล้ว" ของ Gmail แอป (เดือนละครั้ง)

เหตุผล: Gmail เก็บสำเนาเมลที่ส่งผ่าน SMTP ไว้ในกล่อง "ส่งแล้ว" อัตโนมัติ และปิดไม่ได้ (งานวิจัย `docs/research/2026-11-18-r1-auth.md`) — ในเมลมีรหัส OTP และอีเมลผู้ใช้ · ประกาศความเป็นส่วนตัวของแอประบุว่าผู้ดูแลลบเป็นระยะ จึงต้องทำจริง

ขั้นตอน:
1. เข้า Gmail ของแอป (บัญชีที่ใช้ส่ง OTP)
2. เมนูซ้าย **ส่งแล้ว** (Sent)
3. ติ๊กช่องสี่เหลี่ยมมุมบนซ้ายเพื่อเลือกทั้งหน้า → ถ้ามีข้อความ "เลือกการสนทนาทั้งหมดใน ส่งแล้ว" ให้กดข้อความนั้น (เลือกทุกหน้า)
4. กดไอคอนถังขยะ (ลบ)
5. เมนูซ้าย **ถังขยะ** (ถ้าไม่เห็นกด "เพิ่มเติม") → กด **ล้างถังขยะตอนนี้** → ยืนยัน = ลบถาวร
6. ถ้าไม่ทำข้อ 5 Google ลบถังขยะเองหลัง 30 วัน (งานวิจัยภาคผนวก 2026-11-19)

ชื่อปุ่มตามหน้าจอ Gmail ภาษาของ boss · ตั้งเตือนในปฏิทินวันที่ 1 ของทุกเดือน
