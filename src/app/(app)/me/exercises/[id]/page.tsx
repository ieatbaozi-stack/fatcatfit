import { EditExerciseForm } from "@/components/catalog/exercise-form";

// แก้ท่าของฉัน (UX 12.6) — แถวมาจาก /api/bootstrap ฝั่งไคลเอนต์ · ไม่เจอ id = จอ "ไม่เจอท่านี้"
export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditExerciseForm id={id} />;
}
