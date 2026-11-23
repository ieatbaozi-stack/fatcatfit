# รายการคาร์ดิโอและกีฬา (R2 · contract D2)

> สร้างโดย `scripts/seed-convert.ts` — อย่าแก้ไฟล์นี้ด้วยมือ (แก้ที่ไฟล์คลังใน content/exercises/ แล้วรันแปลงใหม่)

รวม 99 รายการ (เป้า 60–100) · ทีมเขียนเองเป็นชื่อกิจกรรมทั่วไป + ท่าหมวด cardio ของ free-exercise-db · ไม่มีค่า MET (D4 ก)
boss: ดูแล้วอยากเพิ่ม/ตัดรายการไหน บอก Lead ได้เลย (แก้ที่ `scripts/seed-own-list.ts`)
ชนิดการจด: duration = เวลา · distance_duration = ระยะ+เวลา · incline_speed_duration = ลู่วิ่ง ความชัน+ความเร็ว+เวลา

| หมวด | ชื่ออังกฤษ | ชื่อไทย | ชนิดการจด | ที่มา |
|---|---|---|---|---|
| คาร์ดิโอ | Aerobics | แอโรบิก | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Bicycling | ปั่นจักรยาน | distance_duration | free-exercise-db |
| คาร์ดิโอ | Bicycling, Stationary | ปั่นจักรยานอยู่กับที่ | distance_duration | free-exercise-db |
| คาร์ดิโอ | Brisk Walking | เดินเร็ว | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Burpees | เบอร์ปี | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Calisthenics Session | คาลิสเธนิกส์ | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Cardio Kickboxing | คาร์ดิโอคิกบ็อกซิ่ง | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Circuit Training | เซอร์กิตเทรนนิ่ง | duration | ทีมเขียนเอง |
| คาร์ดิโอ | CrossFit Workout | ครอสฟิต | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Dance Cardio | เต้นแอโรบิก | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Elliptical Trainer | เครื่องเอลลิปติคอล | distance_duration | free-exercise-db |
| คาร์ดิโอ | Heavy Bag Work | ชกกระสอบทราย | duration | ทีมเขียนเอง |
| คาร์ดิโอ | High Knees | วิ่งยกเข่าสูง | duration | ทีมเขียนเอง |
| คาร์ดิโอ | HIIT | ฮิต (HIIT) | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Hiking | เดินป่า | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Incline Treadmill Run | วิ่งชันบนลู่วิ่ง | incline_speed_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Incline Treadmill Walk | เดินชันบนลู่วิ่ง | incline_speed_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Interval Training | ออกกำลังแบบสลับหนักเบา | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Jogging, Treadmill | จ๊อกกิ้งบนลู่วิ่ง | incline_speed_duration | free-exercise-db |
| คาร์ดิโอ | Jumping Jacks | กระโดดตบ | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Kayaking | พายคายัค | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Mountain Biking | ปั่นจักรยานเสือภูเขา | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Muay Thai Pad Work | ซ้อมเป้ามวยไทย | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Prowler Sprint | พราวเลอร์สปรินต์ | weight_duration | free-exercise-db |
| คาร์ดิโอ | Recumbent Bike | จักรยานเอนหลัง | distance_duration | free-exercise-db |
| คาร์ดิโอ | Road Cycling | ปั่นจักรยานเสือหมอบ | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Rope Jumping | กระโดดเชือก | duration | free-exercise-db |
| คาร์ดิโอ | Rowing, Stationary | พายเรืออยู่กับที่ (เครื่องพาย) | distance_duration | free-exercise-db |
| คาร์ดิโอ | Running (Outdoor) | วิ่งกลางแจ้ง | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Running, Treadmill | วิ่งบนลู่วิ่ง | incline_speed_duration | free-exercise-db |
| คาร์ดิโอ | Shadow Boxing | ชกเงา | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Skating | สเก็ตอินไลน์ | duration | free-exercise-db |
| คาร์ดิโอ | Ski Erg | เครื่องสกีเออร์ก | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Spin Class | คลาสสปินไบค์ | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Stair Climbing | ขึ้นบันได | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Stairmaster | เครื่องเดินขึ้นบันได (สเตอร์มาสเตอร์) | duration | free-exercise-db |
| คาร์ดิโอ | Stand-Up Paddleboarding | พายบอร์ดยืน | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Step Aerobics | สเต็ปแอโรบิก | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Step Mill | สเต็ปมิลล์ | duration | free-exercise-db |
| คาร์ดิโอ | Swimming | ว่ายน้ำ | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Swimming - Backstroke | ว่ายน้ำท่ากรรเชียง | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Swimming - Breaststroke | ว่ายน้ำท่ากบ | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Swimming - Butterfly | ว่ายน้ำท่าผีเสื้อ | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Swimming - Freestyle | ว่ายน้ำท่าฟรีสไตล์ | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Tabata | ทาบาตะ | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Trail Running/Walking | วิ่ง/เดินเทรล | distance_duration | free-exercise-db |
| คาร์ดิโอ | Trampoline Workout | กระโดดแทรมโพลีน | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Walking (Outdoor) | เดินกลางแจ้ง | distance_duration | ทีมเขียนเอง |
| คาร์ดิโอ | Walking, Treadmill | เดินบนลู่วิ่ง | incline_speed_duration | free-exercise-db |
| คาร์ดิโอ | Water Aerobics | แอโรบิกในน้ำ | duration | ทีมเขียนเอง |
| คาร์ดิโอ | Zumba | ซุมบ้า | duration | ทีมเขียนเอง |
| กีฬา | American Football | อเมริกันฟุตบอล | duration | ทีมเขียนเอง |
| กีฬา | Archery | ยิงธนู | duration | ทีมเขียนเอง |
| กีฬา | Badminton | แบดมินตัน | duration | ทีมเขียนเอง |
| กีฬา | Ballroom Dancing | เต้นรำบอลรูม | duration | ทีมเขียนเอง |
| กีฬา | Baseball | เบสบอล | duration | ทีมเขียนเอง |
| กีฬา | Basketball | บาสเกตบอล | duration | ทีมเขียนเอง |
| กีฬา | Beach Volleyball | วอลเลย์บอลชายหาด | duration | ทีมเขียนเอง |
| กีฬา | Bouldering | ปีนผาบูลเดอริ่ง | duration | ทีมเขียนเอง |
| กีฬา | Bowling | โบว์ลิ่ง | duration | ทีมเขียนเอง |
| กีฬา | Boxing | มวยสากล | duration | ทีมเขียนเอง |
| กีฬา | Brazilian Jiu-Jitsu | บราซิลเลียนยิวยิตสู | duration | ทีมเขียนเอง |
| กีฬา | Cricket | คริกเก็ต | duration | ทีมเขียนเอง |
| กีฬา | Fencing | ฟันดาบ | duration | ทีมเขียนเอง |
| กีฬา | Football (Soccer) | ฟุตบอล | duration | ทีมเขียนเอง |
| กีฬา | Futsal | ฟุตซอล | duration | ทีมเขียนเอง |
| กีฬา | Golf | กอล์ฟ | duration | ทีมเขียนเอง |
| กีฬา | Gymnastics | ยิมนาสติก | duration | ทีมเขียนเอง |
| กีฬา | Handball | แฮนด์บอล | duration | ทีมเขียนเอง |
| กีฬา | Hoop Takraw | ตะกร้อลอดห่วง | duration | ทีมเขียนเอง |
| กีฬา | Horseback Riding | ขี่ม้า | duration | ทีมเขียนเอง |
| กีฬา | Hot Yoga | โยคะร้อน | duration | ทีมเขียนเอง |
| กีฬา | Ice Skating | สเก็ตน้ำแข็ง | duration | ทีมเขียนเอง |
| กีฬา | Judo | ยูโด | duration | ทีมเขียนเอง |
| กีฬา | Karate | คาราเต้ | duration | ทีมเขียนเอง |
| กีฬา | Kickboxing | คิกบ็อกซิ่ง | duration | ทีมเขียนเอง |
| กีฬา | Krabi Krabong | กระบี่กระบอง | duration | ทีมเขียนเอง |
| กีฬา | Mixed Martial Arts (MMA) | เอ็มเอ็มเอ | duration | ทีมเขียนเอง |
| กีฬา | Muay Thai | มวยไทย | duration | ทีมเขียนเอง |
| กีฬา | Padel | พาเดล | duration | ทีมเขียนเอง |
| กีฬา | Pickleball | พิกเคิลบอล | duration | ทีมเขียนเอง |
| กีฬา | Pilates | พิลาทิส | duration | ทีมเขียนเอง |
| กีฬา | Rock Climbing | ปีนผา | duration | ทีมเขียนเอง |
| กีฬา | Roller Skating | สเก็ตรองเท้าสี่ล้อ | duration | ทีมเขียนเอง |
| กีฬา | Rugby | รักบี้ | duration | ทีมเขียนเอง |
| กีฬา | Scuba Diving | ดำน้ำลึก | duration | ทีมเขียนเอง |
| กีฬา | Sepak Takraw | ตะกร้อ | duration | ทีมเขียนเอง |
| กีฬา | Skateboarding | เล่นสเก็ตบอร์ด | duration | ทีมเขียนเอง |
| กีฬา | Snorkeling | ดำน้ำตื้น | duration | ทีมเขียนเอง |
| กีฬา | Softball | ซอฟต์บอล | duration | ทีมเขียนเอง |
| กีฬา | Squash | สควอช | duration | ทีมเขียนเอง |
| กีฬา | Surfing | เล่นเซิร์ฟ | duration | ทีมเขียนเอง |
| กีฬา | Table Tennis | ปิงปอง | duration | ทีมเขียนเอง |
| กีฬา | Taekwondo | เทควันโด | duration | ทีมเขียนเอง |
| กีฬา | Tai Chi | ไทเก๊ก | duration | ทีมเขียนเอง |
| กีฬา | Tennis | เทนนิส | duration | ทีมเขียนเอง |
| กีฬา | Ultimate Frisbee | อัลติเมทฟริสบี้ | duration | ทีมเขียนเอง |
| กีฬา | Volleyball | วอลเลย์บอล | duration | ทีมเขียนเอง |
| กีฬา | Yoga | โยคะ | duration | ทีมเขียนเอง |
