# R2: ชุดข้อมูลท่าออกกำลังกายเปิด และค่า MET

วันที่เปิดดูทุกแหล่ง: 2026-11-23 (เครื่องมือดึงหน้าเว็บสรุปเนื้อหาให้ ไม่ได้อ่านไฟล์ดิบเอง)

## คำถาม
1. ชุดข้อมูลท่าเวทเปิดชุดไหนใช้ได้ ใบอนุญาตข้อความ/รูปแยกกันอย่างไร
2. ค่า MET จาก Compendium ใช้ในแอปไม่แสวงกำไรได้ไหม ให้เครดิตอย่างไร
3. ชุดไหนเหมาะกับ R2

## คำตอบสั้น
- **free-exercise-db** (Unlicense = สาธารณสมบัติ) เหมาะที่สุด ไม่มีเงื่อนไข share-alike แต่ที่มาของข้อมูลต้นทางไม่ระบุชัด (ดูความเสี่ยง)
- **wger** เป็น CC ต่อรายการ (มีทั้ง CC-BY-SA, CC-BY, CC0, ODbL) ต้องเก็บใบอนุญาตต่อแถวและมี share-alike กับข้อมูล
- **MET**: Compendium ระบุว่าใช้เชิงพาณิชย์ได้ฟรี ห้ามแก้ค่า MET ให้อ้างอิงเว็บหรือบทความ ไม่ได้พูดถึงแอป/ไม่แสวงกำไรโดยตรง

## ตารางเปรียบเทียบ

| ชุด | ใบอนุญาตข้อความ | ใบอนุญาตรูป | จำนวนท่า | ฟิลด์ | ดูแลอยู่ไหม | ความมั่นใจ |
|---|---|---|---|---|---|---|
| yuhonas/free-exercise-db | Unlicense (LICENSE.md และ GitHub API ตรงกัน) | ไม่ได้ระบุแยก README ไม่บอกที่มารูป | "800+" (README) | id, name, force, level, mechanic, equipment, primaryMuscles, secondaryMuscles, instructions, category, images · force/mechanic/equipment บางท่าเป็น null | push ล่าสุด 2026-09-27 (GitHub API) | ข้อความ: ทางการ · รูป: ยืนยันไม่ได้ |
| wger-project/wger | โค้ด AGPL-3.0-or-later · ข้อมูลท่า "Creative Commons ดูต่อรายการ" (README) | README ไม่ระบุแยก ต้องดูต่อรายการ | 979 ท่า (ภาษา en, API `exerciseinfo` count) | มีอุปกรณ์ กลุ่มกล้ามเนื้อ หมวด (ยังไม่ได้ตรวจโครงสร้างจริง) | push ล่าสุด 2026-11-21 | ทางการ (ฟิลด์ที่มีเป็นแหล่งรอง) |
| wrkout/exercises.json | Unlicense | ไม่ระบุ | ไม่ระบุ (ชุดพาณิชย์ของผู้ทำอ้าง 2,500+ แยกต่างหาก) | ไม่ได้ตรวจ | ไม่ทราบวันที่ commit (31 commits) | ทางการบางส่วน |

ใบอนุญาตที่ wger API ประกาศ (`/api/v2/license/`): CC-BY-SA 3, CC-BY 4, CC-BY-SA 4, CC0 1.0, ODbL ท่าตัวอย่างแรกที่ดึงมาเป็น CC-BY-SA 4

ความสัมพันธ์: README ของ free-exercise-db ระบุว่าข้อมูลมาจาก exercises.json ของ Ollie Jennings (wrkout/exercises.json) ผู้ทำจัดโครงสร้างใหม่

## เงื่อนไข MET (Compendium)
แหล่ง: https://pacompendium.com/ (ทางการ)

| ข้อ | ข้อเท็จจริง |
|---|---|
| ใช้เชิงพาณิชย์ | Adult/Older Adult/Wheelchair Compendia ใช้ฟรี รวมเชิงพาณิชย์ |
| ห้าม | เปลี่ยนค่า MET หรือรวมกิจกรรมที่ MET ต่างกัน |
| เครดิต | อ้างเว็บ (ลิงก์ https://pacompendium.com/) หรืออ้างบทความ |
| แอป/ไม่แสวงกำไร | หน้าไม่พูดถึง ติดต่อผู้จัดทำผ่านช่องทางบนเว็บถ้าต้องการยืนยัน (ยืนยันไม่ได้ว่าไม่ต้อง) |
| อ้างอิง 2024 | Herrmann SD, Willis EA, Ainsworth BE, et al. "2024 Adult Compendium of Physical Activities: A third update of the energy costs of human activities." J Sport Health Sci. 2024;13(1):6-12 |

หมายเหตุ: หน้า adult-compendium ไม่แสดงจำนวนกิจกรรมหรือเงื่อนไขเพิ่ม มีแค่ลิงก์ PDF (ไม่ได้ดาวน์โหลด) ตามกติกาต้องไม่ดาวน์โหลด จึงต้องให้ catalog พิมพ์ค่า MET จากหน้าเว็บ/PDF ที่ boss หรือ Lead อนุมัติ

## ข้อเสนอ
**ใช้ free-exercise-db เฉพาะข้อความ ไม่เอารูป** (และเสริมค่า MET จาก Compendium สำหรับคาร์ดิโอ/กีฬา 60–100 รายการ)
- เหตุผล: ใบอนุญาตง่ายที่สุด (Unlicense) ไม่ผูก share-alike ไม่ต้องเก็บใบอนุญาตหลายแบบ จำนวน ~870 ตรงเป้า ~800 ท่า ยังมีคนดูแล
- ความเสี่ยง: (1) Unlicense บอกเฉพาะสิทธิ์ของผู้ทำ repo ไม่รับประกันว่าข้อมูลต้นทางเป็นสาธารณสมบัติจริง README ไม่บอกที่มาของข้อความ/รูป (2) รูปไม่ชัดเจน จึงไม่ใช้ตามที่กำหนด (3) ฟิลด์ equipment/force/mechanic ขาดบางท่า ต้อง map/เติมเอง
- ลดความเสี่ยง: เก็บคอลัมน์ source/license/credit ต่อแถวเป็น "free-exercise-db (Unlicense)" + แสดงเครดิตในหน้า About · ไม่นำ `instructions` มาใช้ถ้าอยากเลี่ยงทั้งหมด (ใช้ชื่อ กลุ่มกล้ามเนื้อ อุปกรณ์ ก็พอสำหรับการจดบันทึก)

**wger เป็นตัวสำรอง/เติมท่า**: ถ้าใช้ ต้องเก็บใบอนุญาตและผู้เขียนต่อแถว ท่าที่เป็น CC-BY-SA ต้องให้เครดิตและ share-alike ผูกกับ "ข้อมูลที่ดัดแปลงจากท่านั้น" ไม่ผูกกับโค้ดแอปโดยตรง (ตีความจากเงื่อนไข CC ทั่วไป ยังไม่ได้ปรึกษาทนาย) ส่วน AGPL ของโค้ด wger ไม่เกี่ยวถ้าไม่นำโค้ดมา แต่ repo สาธารณะที่มีข้อมูล SA จะต้องติดป้ายใบอนุญาตชัด ถ้าไม่ต้องการภาระ ไม่ต้องใช้

## ผลต่อโปรเจกต์
- PRD E2: "ใบอนุญาต/เครดิตต่อแถว" ทำได้ แต่ควรระบุว่าถ้าใช้ free-exercise-db ทุกแถวเป็น Unlicense เดียวกัน
- ควรมี ADR: เลือกชุด + ไม่ใช้รูป + เก็บ source/license/credit + หน้าเครดิตใน About
- ต้องมีหน้า/ส่วนเครดิต MET (ลิงก์ pacompendium.com + อ้างบทความ) และห้ามปรับค่า MET ที่นำมา
- ฟิลด์ null ของอุปกรณ์: schema ต้องรองรับค่าว่าง/หมวด "ไม่ระบุ"

## สิ่งที่ยังไม่รู้
- ใบอนุญาตและที่มาของรูปใน free-exercise-db และที่มาข้อความต้นทางของ exercises.json (ยืนยันไม่ได้)
- LICENSE ของ wger ต่อรูป และสัดส่วนท่า wger ที่เป็น CC0/CC-BY เทียบกับ SA (ไม่ได้นับ)
- โครงสร้างฟิลด์จริงของ wger (ไม่ได้เปิดดู schema)
- Compendium: ข้อกำหนดชัดเจนสำหรับแอป/ไม่แสวงกำไร และจำนวนรายการ 2024 (ยืนยันไม่ได้ ต้องถามอีเมลเจ้าของหรืออ่าน PDF)
- ชุดเด่นอื่นนอกเหนือจากสามชุดนี้ (เช่น ExerciseDB, Wikidata-based) ไม่ได้ตรวจ
- วันที่ commit ล่าสุดของ wrkout/exercises.json

## แหล่ง
- https://github.com/yuhonas/free-exercise-db · LICENSE.md · README · https://api.github.com/repos/yuhonas/free-exercise-db
- https://github.com/wger-project/wger · https://api.github.com/repos/wger-project/wger · https://wger.de/api/v2/license/ · https://wger.de/api/v2/exerciseinfo/?limit=1&language=2
- https://github.com/wrkout/exercises.json
- https://pacompendium.com/ · https://pacompendium.com/adult-compendium/
