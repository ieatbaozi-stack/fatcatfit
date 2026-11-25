import { EditExerciseFromDevice } from "@/components/catalog/exercise-form";

// แก้ท่าของฉัน (UX 12.6) — path คงที่ ไม่มี id ใน URL เพื่อให้เปิดออฟไลน์ได้ (ADR 0005) · id ของท่าอ่านจากเครื่อง
export default function EditExercisePage() {
  return <EditExerciseFromDevice />;
}
