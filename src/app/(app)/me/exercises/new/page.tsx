import { NewExerciseForm } from "@/components/catalog/exercise-form";

// สร้างท่าของฉัน (UX 12.6): ชื่อ/หมวดที่เติมจากจอค้นอยู่ใน hash (#name= &category=) อ่านฝั่งไคลเอนต์
// ไม่ใส่ใน query string เพราะ query ถึงเซิร์ฟเวอร์และเข้า log (security L1)
export default function NewExercisePage() {
  return <NewExerciseForm />;
}
