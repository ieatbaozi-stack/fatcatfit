# วิจัย: PWA และออฟไลน์ (Serwist, Safari iOS)

วันที่เปิดดูทุกแหล่ง: 2026-11-15 · ผู้เขียน: researcher
ระดับ: **[ทางการ]** · **[รอง]** · **[ไม่ได้]**

## คำถาม
7. Serwist กับ Next.js App Router รุ่นปัจจุบัน (ยังดูแลอยู่ไหม, Turbopack, ข้อจำกัด, ทางเลือกที่ Next.js แนะนำ)
8. Safari iOS: Background Sync, นโยบายล้าง storage, Wake Lock, Web Push

## คำตอบสั้น
- Serwist ยังมีการ release (9.5.12 เมื่อ 22 ก.ค. ตามหน้า releases, npm ล่าสุด 9.5.13) และ Next.js docs ชี้ Serwist เป็นตัวเลือกของ service worker offline · **แต่ `@serwist/next` เขียนไว้สำหรับ webpack** ขณะที่ Next 16 ใช้ Turbopack เป็นค่าเริ่มต้น ต้องใช้แพ็กเกจ `@serwist/turbopack` หรือสั่ง build ด้วย `--webpack`
- iOS: **ไม่มี Background Sync** · storage ของแอปที่ติดตั้งแล้ว **ได้รับยกเว้นจากกฎล้าง 7 วัน** · Wake Lock ใช้ใน Home Screen web app ได้ตั้งแต่ iOS 18.4 · Web Push ต้องติดตั้งลง Home Screen ก่อน

## C7. Serwist + Next.js

| ข้อเท็จจริง | ค่า | แหล่ง | ความมั่นใจ |
|---|---|---|---|
| ความเคลื่อนไหว | release ล่าสุดที่เห็นบน GitHub: `serwist@9.5.12` เมื่อ 22 ก.ค. (หน้าไม่ระบุปี ท้ายหน้าเขียน © 2026) ทุกแพ็กเกจออกพร้อมกัน รวม `@serwist/turbopack` · issue เปิดอยู่ 7, PR เปิด 1 | [GitHub releases](https://github.com/serwist/serwist/releases) | ทางการ (ปีของวันที่ = อนุมาน) |
| เวอร์ชัน npm | `@serwist/next` 9.5.13 · peer `next >=14`, `react >=18` | [registry](https://registry.npmjs.org/@serwist/next/latest) | ทางการ |
| webpack | คู่มือ `@serwist/next` ระบุว่า "meant for webpack" ใช้ `withSerwist` ใน config · ต้องเพิ่ม `webworker` ใน tsconfig lib และ ignore `public/sw*` | [คู่มือ](https://serwist.pages.dev/docs/next/getting-started) | ทางการ |
| Turbopack | แพ็กเกจ `@serwist/turbopack` (+ `esbuild`, `serwist`) · สร้าง route handler `app/serwist/[path]/route.ts` ด้วย `createSerwistRoute` · client ใช้ `SerwistProvider swUrl="/serwist/sw.js"` · ครอบ config ด้วย `withSerwist` จาก `@serwist/turbopack` | [Turbopack guide](https://serwist.pages.dev/docs/next/turbo) | ทางการ |
| ความขัดกันของข้อมูล | หน้าคู่มือ Turbopack เขียนว่า "Serwist 10 และใหม่กว่ารองรับ Next.js 15+" แต่ npm `latest` ยังเป็น 9.5.x → โดเมน `serwist.pages.dev` อาจเป็นเอกสารของรุ่นที่ยังไม่ปล่อย ยืนยันไม่ได้ว่าใช้กับ 9.5.x ได้ตรงตามนั้น | เทียบ 2 แหล่งข้างบน | ไม่ได้ |
| ข้อจำกัดของ Turbopack/dev mode | คู่มือไม่ได้ระบุ | — | ไม่ได้ |
| Next 16 + webpack | `next build --webpack` ยังมีให้ใช้ · webpack plugin ใช้กับ Turbopack ไม่ได้ | [Turbopack docs](https://nextjs.org/docs/app/api-reference/turbopack) | ทางการ |
| สิ่งที่ Next.js แนะนำเอง | คู่มือ PWA ของ Next: manifest ในตัว (`app/manifest.ts`) · Web Push ตัวอย่างพร้อม service worker เอง · ออฟไลน์: ฮุก **`useOffline` (experimental)** สำหรับ UI รับรู้การเชื่อมต่อ + retry navigation/Server Action ที่ล้มเหลว · ถ้าต้องการ cache ด้วย service worker เต็มรูปแบบ ชี้ไป Serwist (มีตัวอย่าง Turbopack และ webpack) | [Next PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) | ทางการ |
| ไม่พบ | ตัวเลือกอื่นของ Next.js ที่ไม่ใช่ Serwist สำหรับ cache ใน service worker | — | ไม่ได้ |

หมายเหตุ: คิวเขียนออฟไลน์ (IndexedDB) ตามแนว PRD ไม่ต้องพึ่ง Serwist เลย (เป็นโค้ดฝั่งไคลเอนต์) Serwist ใช้กับ precache/offline shell เท่านั้น

## C8. Safari iOS

| ข้อเท็จจริง | ค่า | แหล่ง | ความมั่นใจ |
|---|---|---|---|
| Background Sync | **ไม่รองรับ** ทุกเวอร์ชัน Safari และ iOS Safari ตั้งแต่ 3.2 ถึง 27.2 ตามตาราง | [caniuse](https://caniuse.com/background-sync) | ทางการ-กึ่ง (caniuse เป็นฐานข้อมูลชุมชน ไม่ใช่ Apple) → จัดเป็น **รอง** |
| MDN | จัด Background Sync เป็น "limited availability" ไม่ใช่ Baseline (ตารางความเข้ากันไม่ได้อยู่ในข้อความที่เปิดได้) | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) | ทางการ |
| ล้าง storage 7 วัน | ITP ลบข้อมูลที่ JS เขียนได้ (IndexedDB, LocalStorage, Cache/Service Worker, คุกกี้ที่ JS สร้าง) หลัง 7 วันที่ผู้ใช้ไม่โต้ตอบกับเว็บ · **โดเมนของ Home Screen web app ได้รับยกเว้น** · ข้อมูลแยกจาก Safari | [WebKit tracking prevention](https://webkit.org/tracking-prevention/) | ทางการ |
| ข้อยกเว้นไม่ครอบคลุม | แท็บ Safari ธรรมดา และกรณีที่ผู้ใช้ปิด "Open as Web App" ตอนเพิ่มลง Home Screen (iOS 26 ทำให้เปิดเป็น web app โดยปริยาย ผู้ใช้ปิดได้) → ข้อยกเว้นนี้เป็นการอนุมานจากสองหน้า ไม่มีข้อความ WebKit ตรงๆ | [Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) | ทางการ (แต่ละข้อ) · อนุมาน (การรวมกัน) |
| โควตา | Home Screen web app ได้โควตาเท่ากับเบราว์เซอร์ (origin สูงสุด ~60% ของดิสก์) · มี heuristic ให้ persistence ถ้าเปิดเป็น Home Screen web app | [WebKit storage](https://webkit.org/blog/14403/updates-to-storage-policy/) | ทางการ |
| Screen Wake Lock | Safari iOS รองรับตั้งแต่ 16.4 · แต่ **ใน Home Screen web app ใช้ไม่ได้จนกว่า iOS 18.4** (WebKit bug 254545 "Resolved Fixed" ระบุแก้ใน 18.4) · มีรายงานถดถอยบน 26.1 แต่ผู้รายงานถอนคำพูดแล้ว | [caniuse](https://caniuse.com/wake-lock), [bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545) | รอง (caniuse) · ทางการ (bug tracker) |
| Web Push | ต้องเพิ่มเว็บลง Home Screen (manifest `display: standalone`/`fullscreen` ตอน 16.4) · iOS/iPadOS 16.4 ขึ้นไป · ขอ permission จากการแตะของผู้ใช้เท่านั้น · Next.js docs ยืนยัน "iOS 16.4+ for applications installed to the home screen" | [WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Next PWA](https://nextjs.org/docs/app/guides/progressive-web-apps) | ทางการ |
| iOS 26 ไม่ต้องมี manifest | "A Web Application Manifest is no longer required" แต่ manifest ยังให้ผลดี (ไอคอน ฯลฯ) | [Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) | ทางการ |

## ผลต่อโปรเจกต์
- **ADR ออฟไลน์/โครงโปรเจกต์ต้องเลือก**: (ก) `@serwist/turbopack` กับ Next 16 Turbopack (เอกสารมีความไม่แน่นอนเรื่องเวอร์ชันข้างบน) หรือ (ข) `@serwist/next` + `next build --webpack` (เส้นทางมีเอกสารชัดกว่า แต่ถอยจากค่าเริ่มต้นของ Next) → ควรให้ dev ทำ spike ทดสอบก่อนตัดสิน
- PRD ข้อ 5 "iOS ไม่มี background sync": **ยืนยัน** (ตามแหล่งรอง caniuse) การออกแบบ sync ตอนเปิดแอป/กลับมาออนไลน์ถูกต้อง
- PRD ข้อ 8 "iOS ล้างข้อมูลในเครื่อง": ความเสี่ยงต่ำลงสำหรับแอปที่ติดตั้งแล้ว แต่ยังสูงถ้าผู้ใช้ใช้ในแท็บ Safari → แบนเนอร์สอนติดตั้ง (E6) และการเตือนเมื่อรายการค้างส่งยังจำเป็น
- US-3.4 ตัวจับเวลาพัก "ยังเดินถูกแม้จอดับ": Wake Lock ไม่ใช่ทางออก (กันจอดับ ไม่ได้ทำให้ JS วิ่งเมื่อจอดับ และในแอปที่ติดตั้งต้องใช้ iOS 18.4+) ควรคำนวณจาก timestamp เริ่ม/จบ ไม่นับ tick (ข้อเสนอ ไม่ใช่ข้อเท็จจริงจากเอกสาร)
- ถ้าจะเพิ่ม push (ตอนนี้เป็น P2) ต้องติดตั้งลง Home Screen ก่อนเสมอ
- ควรกำหนดรุ่น iOS ต่ำสุดที่รองรับใน PRD (≥16.4 สำหรับ push/wake lock, ≥18.4 ถ้าจะพึ่ง wake lock ในแอปที่ติดตั้ง)

## ยังไม่รู้
- `@serwist/turbopack` 9.5.x ทำงานกับ Next 16.4 ใน production build จริงหรือไม่ (ไม่ได้ทดสอบ)
- Apple/WebKit มีเอกสารตรงๆ ว่า standalone web app ที่ถูกปิด "Open as Web App" ถูกนับเป็นแท็บ Safari หรือไม่
- ตารางความเข้ากัน Background Sync ของ MDN (เปิดไม่ได้) ตรงกับ caniuse หรือไม่
- Cache/IndexedDB ถูกล้างเมื่อพื้นที่เครื่องเต็มหรือไม่ (นโยบายโควตา/eviction ใต้แรงกดดันดิสก์ไม่ได้อ่านละเอียด)
