// คาร์ดิโอ/กีฬาที่ทีมเขียนเอง (R2 · contract D2 ก) — ชื่อกิจกรรมทั่วไป เขียนคำอธิบายเอง ไม่คัดลอกจากแหล่งใด · ไม่มี MET (D4)
// ชื่อไทยเป็นชื่อไทยจริง (ไม่ใช่ทับศัพท์ท่ายิม) · เพิ่ม/ตัดได้ตามที่ boss ดูใน PR · แก้แล้วรัน seed-convert ใหม่ (id เดิมคงอยู่ตาม slug)
import type { Category, TrackType } from "../src/lib/data/shared/exercise-meta";

export type OwnEntry = {
  slug: string;
  name: string;
  name_th: string;
  category: Extract<Category, "cardio" | "sport">;
  track_type: Extract<TrackType, "duration" | "distance_duration" | "incline_speed_duration">;
  terms?: string[];
};

const c = (slug: string, name: string, name_th: string, track_type: OwnEntry["track_type"], terms: string[] = []): OwnEntry => ({
  slug, name, name_th, category: "cardio", track_type, terms,
});
const s = (slug: string, name: string, name_th: string, terms: string[] = []): OwnEntry => ({
  slug, name, name_th, category: "sport", track_type: "duration", terms,
});

export const OWN_ENTRIES: OwnEntry[] = [
  // คาร์ดิโอ — ระยะ+เวลา
  c("running-outdoor", "Running (Outdoor)", "วิ่งกลางแจ้ง", "distance_duration", ["วิ่ง", "run", "วิ่งถนน", "วิ่งสวน"]),
  c("walking-outdoor", "Walking (Outdoor)", "เดินกลางแจ้ง", "distance_duration", ["เดิน", "walk", "เดินออกกำลังกาย"]),
  c("brisk-walking", "Brisk Walking", "เดินเร็ว", "distance_duration", ["power walk", "เพาเวอร์วอล์ก"]),
  c("hiking", "Hiking", "เดินป่า", "distance_duration", ["เดินเขา", "ไฮกิ้ง", "เทรคกิ้ง", "trekking"]),
  c("cycling-road", "Road Cycling", "ปั่นจักรยานเสือหมอบ", "distance_duration", ["จักรยานถนน", "ปั่นจักรยาน", "cycling"]),
  c("cycling-mountain", "Mountain Biking", "ปั่นจักรยานเสือภูเขา", "distance_duration", ["เสือภูเขา", "mtb"]),
  c("swimming-general", "Swimming", "ว่ายน้ำ", "distance_duration", ["swim"]),
  c("swimming-freestyle", "Swimming - Freestyle", "ว่ายน้ำท่าฟรีสไตล์", "distance_duration", ["ฟรีสไตล์", "ท่าคลาน", "ว่ายคลาน"]),
  c("swimming-breaststroke", "Swimming - Breaststroke", "ว่ายน้ำท่ากบ", "distance_duration", ["ท่ากบ", "breaststroke"]),
  c("swimming-backstroke", "Swimming - Backstroke", "ว่ายน้ำท่ากรรเชียง", "distance_duration", ["ท่ากรรเชียง", "backstroke"]),
  c("swimming-butterfly", "Swimming - Butterfly", "ว่ายน้ำท่าผีเสื้อ", "distance_duration", ["ท่าผีเสื้อ", "butterfly stroke"]),
  c("kayaking", "Kayaking", "พายคายัค", "distance_duration", ["พายเรือคายัค", "คายัก"]),
  c("paddleboarding", "Stand-Up Paddleboarding", "พายบอร์ดยืน", "distance_duration", ["sup", "ซัพบอร์ด", "paddle board"]),
  c("ski-erg", "Ski Erg", "เครื่องสกีเออร์ก", "distance_duration", ["skierg", "สกีเออร์ก"]),
  // คาร์ดิโอ — ลู่วิ่งชัน
  c("treadmill-incline-walk", "Incline Treadmill Walk", "เดินชันบนลู่วิ่ง", "incline_speed_duration", ["เดินชัน", "incline walk", "12-3-30", "เดินลู่ชัน"]),
  c("treadmill-incline-run", "Incline Treadmill Run", "วิ่งชันบนลู่วิ่ง", "incline_speed_duration", ["วิ่งชัน", "incline run", "วิ่งลู่ชัน"]),
  // คาร์ดิโอ — เวลา
  c("stair-climbing", "Stair Climbing", "ขึ้นบันได", "duration", ["วิ่งบันได", "เดินขึ้นบันได", "stairs"]),
  c("interval-training", "Interval Training", "ออกกำลังแบบสลับหนักเบา", "duration", ["อินเทอร์วัล", "interval"]),
  c("hiit", "HIIT", "ฮิต (HIIT)", "duration", ["ฮิท", "high intensity", "ออกกำลังแบบหนักสลับพัก"]),
  c("tabata", "Tabata", "ทาบาตะ", "duration", ["ทาบาต้า", "tabata"]),
  c("circuit-training", "Circuit Training", "เซอร์กิตเทรนนิ่ง", "duration", ["เซอร์กิต", "circuit"]),
  c("jumping-jacks", "Jumping Jacks", "กระโดดตบ", "duration", ["จัมปิ้งแจ็ค", "jumping jack"]),
  c("burpees", "Burpees", "เบอร์ปี", "duration", ["เบอร์ปี้", "burpee"]),
  c("high-knees", "High Knees", "วิ่งยกเข่าสูง", "duration", ["ไฮนี", "ยกเข่าสูง"]),
  c("shadow-boxing", "Shadow Boxing", "ชกเงา", "duration", ["ชาโดว์บ็อกซิ่ง", "ชาโดว์"]),
  c("heavy-bag-work", "Heavy Bag Work", "ชกกระสอบทราย", "duration", ["ต่อยกระสอบ", "ต่อยกระสอบทราย", "heavy bag"]),
  c("pad-work-muay-thai", "Muay Thai Pad Work", "ซ้อมเป้ามวยไทย", "duration", ["ตีเป้า", "เตะเป้า", "pad work"]),
  c("zumba", "Zumba", "ซุมบ้า", "duration", ["ซุมบา", "zumba"]),
  c("dance-cardio", "Dance Cardio", "เต้นแอโรบิก", "duration", ["แดนซ์คาร์ดิโอ", "เต้น", "dance workout"]),
  c("aerobics", "Aerobics", "แอโรบิก", "duration", ["แอโร", "แอโรบิค", "aerobic"]),
  c("step-aerobics", "Step Aerobics", "สเต็ปแอโรบิก", "duration", ["สเต็ปแอโร", "step class"]),
  c("spin-class", "Spin Class", "คลาสสปินไบค์", "duration", ["สปินนิ่ง", "สปินไบค์", "spinning"]),
  c("water-aerobics", "Water Aerobics", "แอโรบิกในน้ำ", "duration", ["แอโรบิกน้ำ", "aqua aerobics", "aqua"]),
  c("kickboxing-cardio", "Cardio Kickboxing", "คาร์ดิโอคิกบ็อกซิ่ง", "duration", ["แอโรบิกมวย", "บ็อกซ์ซิ่ง", "cardio kickboxing"]),
  c("trampoline-workout", "Trampoline Workout", "กระโดดแทรมโพลีน", "duration", ["แทรมโพลีน", "trampoline", "rebounder"]),
  c("calisthenics-session", "Calisthenics Session", "คาลิสเธนิกส์", "duration", ["คาลิสเทนิค", "สตรีทเวิร์คเอาท์", "street workout"]),
  c("crossfit-wod", "CrossFit Workout", "ครอสฟิต", "duration", ["ครอสฟิท", "wod", "crossfit"]),
  // กีฬา
  s("badminton", "Badminton", "แบดมินตัน", ["แบด", "ตีแบด", "ตีแบดมินตัน"]),
  s("tennis", "Tennis", "เทนนิส", ["ตีเทนนิส"]),
  s("table-tennis", "Table Tennis", "ปิงปอง", ["เทเบิลเทนนิส", "ping pong", "เทเบิ้ลเทนนิส"]),
  s("squash", "Squash", "สควอช", ["สควอซ"]),
  s("padel", "Padel", "พาเดล", ["ปาเดล", "padel tennis"]),
  s("pickleball", "Pickleball", "พิกเคิลบอล", ["พิคเคิลบอล", "พิกเกิลบอล"]),
  s("futsal", "Futsal", "ฟุตซอล", ["เตะฟุตซอล"]),
  s("football", "Football (Soccer)", "ฟุตบอล", ["เตะบอล", "soccer", "เตะฟุตบอล"]),
  s("basketball", "Basketball", "บาสเกตบอล", ["บาส", "เล่นบาส"]),
  s("volleyball", "Volleyball", "วอลเลย์บอล", ["วอลเล่ย์บอล", "วอลเลย์"]),
  s("beach-volleyball", "Beach Volleyball", "วอลเลย์บอลชายหาด", ["วอลเลย์ชายหาด", "วอลเล่ย์บอลชายหาด"]),
  s("sepak-takraw", "Sepak Takraw", "ตะกร้อ", ["เซปักตะกร้อ", "เตะตะกร้อ", "takraw"]),
  s("hoop-takraw", "Hoop Takraw", "ตะกร้อลอดห่วง", ["ตะกร้อห่วง"]),
  s("muay-thai", "Muay Thai", "มวยไทย", ["ซ้อมมวย", "นักมวยไทย", "thai boxing"]),
  s("boxing", "Boxing", "มวยสากล", ["ชกมวย", "บ็อกซิ่ง", "บ๊อกซิ่ง"]),
  s("kickboxing", "Kickboxing", "คิกบ็อกซิ่ง", ["คิกบอกซิ่ง"]),
  s("mma", "Mixed Martial Arts (MMA)", "เอ็มเอ็มเอ", ["mma", "ศิลปะการต่อสู้ผสม"]),
  s("brazilian-jiu-jitsu", "Brazilian Jiu-Jitsu", "บราซิลเลียนยิวยิตสู", ["bjj", "ยิวยิตสู", "จูจิตสึ", "jiu jitsu"]),
  s("judo", "Judo", "ยูโด", []),
  s("taekwondo", "Taekwondo", "เทควันโด", ["เทควอนโด"]),
  s("karate", "Karate", "คาราเต้", ["คาราเต"]),
  s("krabi-krabong", "Krabi Krabong", "กระบี่กระบอง", ["กระบี่", "กระบอง"]),
  s("fencing", "Fencing", "ฟันดาบ", ["เฟนซิ่ง", "ฟันดาบสากล"]),
  s("yoga", "Yoga", "โยคะ", ["โยคา", "โยกะ"]),
  s("hot-yoga", "Hot Yoga", "โยคะร้อน", ["ฮอตโยคะ", "บิกรัม", "bikram"]),
  s("pilates", "Pilates", "พิลาทิส", ["พิลาทีส", "พีลาทิส", "พิลาเทส"]),
  s("tai-chi", "Tai Chi", "ไทเก๊ก", ["ไทเก็ก", "ไทชิ", "taichi"]),
  s("rock-climbing", "Rock Climbing", "ปีนผา", ["ปีนหน้าผา", "ไต่ผา", "climbing"]),
  s("bouldering", "Bouldering", "ปีนผาบูลเดอริ่ง", ["บูลเดอริ่ง", "ปีนผาในร่ม", "ปีนผาฝึก"]),
  s("golf", "Golf", "กอล์ฟ", ["ตีกอล์ฟ", "ไดรฟ์กอล์ฟ"]),
  s("bowling", "Bowling", "โบว์ลิ่ง", ["โบลิ่ง", "เล่นโบว์ลิ่ง"]),
  s("baseball", "Baseball", "เบสบอล", []),
  s("softball", "Softball", "ซอฟต์บอล", ["ซอฟบอล"]),
  s("rugby", "Rugby", "รักบี้", ["รักบี้ฟุตบอล"]),
  s("american-football", "American Football", "อเมริกันฟุตบอล", ["ฟุตบอลอเมริกัน"]),
  s("handball", "Handball", "แฮนด์บอล", []),
  s("ice-skating", "Ice Skating", "สเก็ตน้ำแข็ง", ["สเก็ตลานน้ำแข็ง", "ice skate"]),
  s("roller-skating", "Roller Skating", "สเก็ตรองเท้าสี่ล้อ", ["โรลเลอร์สเก็ต", "โรลเลอร์เบลด"]),
  s("skateboarding", "Skateboarding", "เล่นสเก็ตบอร์ด", ["สเก็ตบอร์ด", "สเกตบอร์ด", "skateboard"]),
  s("surfing", "Surfing", "เล่นเซิร์ฟ", ["โต้คลื่น", "เซิร์ฟบอร์ด", "surf"]),
  s("scuba-diving", "Scuba Diving", "ดำน้ำลึก", ["สคูบา", "ดำน้ำสคูบา", "scuba"]),
  s("snorkeling", "Snorkeling", "ดำน้ำตื้น", ["สน็อกเกิล", "สนอร์เกิล", "snorkel"]),
  s("ultimate-frisbee", "Ultimate Frisbee", "อัลติเมทฟริสบี้", ["ฟริสบี้", "ultimate"]),
  s("cricket", "Cricket", "คริกเก็ต", ["คริคเก็ต"]),
  s("archery", "Archery", "ยิงธนู", ["ธนู"]),
  s("horseback-riding", "Horseback Riding", "ขี่ม้า", ["ม้า", "horse riding"]),
  s("gymnastics", "Gymnastics", "ยิมนาสติก", ["ยิมนาสติค", "ยิมนาสติกส์"]),
  s("ballroom-dance", "Ballroom Dancing", "เต้นรำบอลรูม", ["เต้นรำ", "ลีลาศ", "ballroom"]),
];
