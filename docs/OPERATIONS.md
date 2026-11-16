# OPERATIONS — ขั้นตอนตั้งค่าและดูแลระบบ (สำหรับ boss)

> เจ้าของ: ops-release · เขียน/ตรวจเอกสารทางการ: **2026-11-17** · เขียนให้คนที่ไม่ใช่วิศวกรทำตามได้ · repo นี้เป็นสาธารณะ จึง **ห้ามใส่** รหัสโปรเจกต์ ชื่อโปรเจกต์จริง URL หน้าจัดการที่มีรหัส หรืออีเมลลงในไฟล์นี้ — ที่ใดต้องใช้ค่าเหล่านั้น เขียนเป็น `<...>` ให้เปิดดูจากหน้าจอของ boss เอง
> สัญลักษณ์: **[ยืนยันไม่ได้]** = เอกสารทางการที่เปิดดูไม่ได้ระบุ หรือทดสอบไม่ได้จนกว่าจะ push/deploy จริง

## สารบัญ

1. [ตั้งโปรเจกต์บน Vercel ครั้งแรก](#1-ตั้งโปรเจกต์บน-vercel-ครั้งแรก)
2. [S6: รุ่น Node และวิธีรัน migration ตอน deploy](#2-s6-รุ่น-node-และวิธีรัน-migration-ตอน-deploy)
3. [Security headers และ CSP](#3-security-headers-และ-csp)
4. [CI และการออกรุ่น (ไม่มีอะไรให้ boss ทำ)](#4-ci-และการออกรุ่น)
5. [เมื่อความลับหลุด](#5-เมื่อความลับหลุด)
6. [วิธีปรับ repo กลับเป็น private](#6-วิธีปรับ-repo-กลับเป็น-private)
7. [ยังไม่ได้ทำในรอบนี้](#7-ยังไม่ได้ทำในรอบนี้)

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

ตัวแปรอื่นใน `.env.example` (Google, อีเมล, cron ฯลฯ) **ยังไม่ต้องใส่** — ใช้ตั้งแต่ R1 และจะมีขั้นตอนแยกตอนนั้น

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
- **Settings → Security → Git Fork Protection**: เปิดไว้ (ค่าเริ่มต้นตามเอกสาร) — pull request จากคนนอกจะไม่ถูก deploy จนกว่า boss จะอนุมัติ เพื่อกันไม่ให้ตัวแปร env รั่ว · แหล่ง: [Vercel for GitHub — Deployment Authorizations for Forks](https://vercel.com/docs/git/vercel-for-github)
- ถ้าเห็น pull request จากคนที่ไม่รู้จักและมีปุ่มขออนุมัติ deploy ให้ **ไม่อนุมัติ** จนกว่าจะปรึกษา Lead

---

## 2. S6: รุ่น Node และวิธีรัน migration ตอน deploy

### 2.1 รุ่น Node

ข้อเท็จจริง ([Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), หน้าอัปเดต 2026-02-27; [ประกาศ Node.js 26 LTS](https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel) 2026-10-29; [Node.js 20 deprecation](https://vercel.com/changelog/node-js-20-is-being-deprecated) — เปิดดู 2026-11-17):

- Vercel รองรับ **26.x (ค่าเริ่มต้นของโปรเจกต์ใหม่), 24.x, 22.x** · เลือกได้เฉพาะเลขหลัก (minor/patch Vercel อัปให้เอง)
- Node.js 20 ถูกประกาศเลิกรองรับ 1 ตุลาคม 2026 (ผ่านไปแล้ว) · `engines.node` ปัจจุบันของโปรเจกต์คือ `>=20.9` ซึ่ง Vercel จะตีความเป็น "รุ่นล่าสุดที่รองรับ" = 26.x (ตามตารางในเอกสาร `>=22.0.0` → 26.x) และประกาศ Node 26 บอกว่าโปรเจกต์เดิมที่ engines เปิดกว้างจะถูกอัปเป็น 26 เองตอน deploy ครั้งถัดไป
- ตั้งได้สองที่: `package.json` → `engines.node` (มีผลเหนือการตั้งในหน้าเว็บ) หรือ Settings → Build and Deployment → Node.js Version

**ข้อเสนอ: ปักเป็น `26.x`** ให้ตรงกับที่ทุกจุดใช้จริง: เครื่องพัฒนา (Node 26.13), CI (`node-version: 26.x` ใน workflow) และ Vercel · build/test/lint ผ่านบน 26 แล้วในรอบ R0 · ปักเลขหลักไว้เพื่อให้การเปลี่ยนรุ่นเป็นการตัดสินใจของเรา ไม่ใช่เกิดเอง

สิ่งที่ต้องแก้ใน `package.json` (ไม่ใช่ไฟล์ของ ops — Lead แก้): `"engines": { "node": "26.x" }` (จากเดิม `">=20.9"`) · ต้องแก้ใน `ci.yml`/`release.yml` พร้อมกันถ้าเปลี่ยนรุ่นภายหลัง (ค้นหา `26.x`)

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

### 2.3 วิธีเปิดใช้ (ยังไม่ต้องทำในรอบ R0 — รอ Lead แจ้งเมื่อมี migration ที่จะขึ้น production)

R0 มีแค่ migration แรก (ตารางของ Better Auth) ซึ่งจะรันครั้งแรกเมื่อเปิดใช้ R1 · ห้ามรัน migration บน production ในรอบ R0 ตาม contract

เมื่อ Lead แจ้งว่าถึงเวลา:
1. Vercel → โปรเจกต์ → **Settings → Environment Variables → Add**
2. **Key** = `MIGRATE_ON_DEPLOY` · **Value** = `1` · ติ๊ก **เฉพาะ Production** (ห้ามติ๊ก Preview/Development) → **Save**
3. ไปที่ **Deployments** → เลือก deployment ล่าสุดของ Production → เมนู (จุดสามจุด) → **Redeploy**
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

**ทำไมไม่ใช้ nonce**: ตามเอกสารของ Next ([CSP guide](https://nextjs.org/docs/app/guides/content-security-policy), เปิดดู 2026-11-17) nonce ต้อง render ทุก request แบบ dynamic ทุกหน้า → เสียหน้า static ที่ CDN แคชได้ ช้าลงและกิน function มากขึ้น และใช้ร่วมกับ Partial Prerendering ไม่ได้ · แอปนี้มีผู้ใช้หลักสิบคน ข้อมูลสุขภาพอยู่หลังการล็อกอิน และไม่ render HTML จากผู้ใช้ — เลือกรักษา static ไว้ก่อน

**สิ่งที่ยังเปิดอยู่ (ความเสี่ยงที่ยอมรับ)**:
1. `script-src 'unsafe-inline'` และ `style-src 'unsafe-inline'` — ถ้ามีช่องโหว่ XSS สคริปต์ที่ฉีดเข้ามารันได้ CSP ไม่ช่วยกันส่วนนี้ (ยังกัน: โหลดสคริปต์จากโดเมนอื่น, ส่งข้อมูลไปโดเมนอื่นผ่าน `connect-src 'self'`, ฝังเว็บ, plugin) · Next ต้องใช้ inline script บางส่วนสำหรับ hydration
2. ทางปิดช่องนี้ในอนาคต: Subresource Integrity แบบ hash (`experimental.sri` ของ Next — ยังเป็น experimental, เอกสารเดียวกัน) ที่คง static ได้ · ให้ประเมินใหม่ใน R6 (เกต performance)
3. `connect-src 'self'` — ถ้าเพิ่มบริการภายนอกที่เบราว์เซอร์เรียกตรง (เช่นสถิติ แผนที่ รูปจากโดเมนอื่น) ต้องเพิ่มโดเมนที่ `next.config.ts` · Google sign-in ของ Better Auth เป็นการ redirect ทั้งหน้า ไม่กระทบ (ยืนยันจริงใน R1)
4. ตรวจกับ Chromium ในเบราว์เซอร์ของเครื่องพัฒนาแล้วว่าหน้าแรกโหลดโดยไม่มี error CSP ใน console · **[ยืนยันไม่ได้ยังจนกว่า service worker (pwa-offline) และหน้าจอของ frontend ถูกรวม]** ว่า CSP นี้ไม่ขวางงานของทั้งสอง — ถ้าเจอ error ให้แจ้ง Lead เพื่อให้ ops ปรับ (ผู้อื่นห้ามแก้เอง)
5. ไม่ได้ตั้ง `Cross-Origin-Embedder-Policy`/`Cross-Origin-Resource-Policy` (ไม่จำเป็นกับแอปนี้)

---

## 4. CI และการออกรุ่น

**boss ไม่ต้องทำอะไร** นอกจากกด merge เมื่อ CI เขียว

- `ci.yml` รันทุก pull request และทุก push เข้า `main`: lint → typecheck → test (รวมเทสต์ migration บนฐานข้อมูลว่าง, i18n, ขอบเขตโมดูล, `.env.example`, release) → `drizzle-kit check` → build · job `e2e` เตรียมไว้ให้ QA (ไม่มีเทสต์ = ข้าม)
- ความปลอดภัยของ CI ใน repo สาธารณะ: ไม่ใช้ `pull_request_target` · ไม่มี secret ในงานที่รันจาก PR · token อ่านอย่างเดียว · action ปักด้วย commit SHA · workflow จากคนนอกต้องรอ boss อนุมัติ (ตั้งไว้แล้วที่ repo)
- `release.yml` รันเมื่อ merge เข้า `main`: ถ้า `version` ใน `package.json` ยังไม่มี release จะสร้าง tag `vX.Y.Z` และ GitHub release จาก CHANGELOG · กติกาเลขรุ่น: [VERSIONING.md](VERSIONING.md)
- ถ้า CI แดง: เปิดแท็บ **Actions** ของ repo → คลิกรอบที่แดง → ดูขั้นที่มีกากบาทสีแดง แล้วส่งข้อความผิดพลาดให้ Lead (log ของ repo สาธารณะใครก็อ่านได้ — workflow จึงไม่พิมพ์ค่า env)
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
| **`CRON_SECRET`** (R1) | เครื่องของ boss | สร้างค่าสุ่มใหม่ | แก้บน Vercel → Redeploy |
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
| การส่งอีเมล OTP ผ่าน Gmail ของแอป + ลิมิตการส่งจากเอกสาร Google + การสลับผู้ส่งเป็นโดเมนของเราโดยแก้ env | R1 | ตัวแปรที่เกี่ยวอยู่ใน `.env.example` (`EMAIL_*`, `SMTP_*`, `OTP_DAILY_CAP`) แล้ว · ลิมิตต้องเปิดเอกสาร Google ตอนทำ ไม่ใช้ความจำ |
| cron (`/api/cron/daily`) และ `CRON_SECRET` | R1 | ต้องยืนยันวิธีที่ Vercel ส่ง secret จากเอกสารก่อน แล้วเพิ่ม `crons` ใน `vercel.json` |
| ชื่อ header IP ที่เชื่อถือได้ (`TRUSTED_IP_HEADER`) | R1 | security-privacy ยืนยัน |
| backup/restore ที่ลองทำจริง + แผนรับมือข้อมูลรั่วฉบับเต็ม + health check เชิงลึก + นโยบาย log ไม่มีข้อมูลส่วนตัว | R6 | ตอนนี้ `/api/health` ตอบแค่ ok/ไม่ ok และ log ของแอปไม่พิมพ์ connection string หรือ error object ของฐานข้อมูล |
| ตั้ง required status check บน `main` | หลัง CI รันครั้งแรกบน GitHub | Lead ตั้ง — ชื่อ check ที่ต้องบังคับคือ `gates` (เพิ่ม `e2e` เมื่อ qa-test ใส่เทสต์แล้ว) |
