import { NewExerciseForm } from "@/components/catalog/exercise-form";
import { clampName } from "@/components/catalog/exercise-logic";
import { isCategory } from "@/lib/data/shared/exercise-meta";

// สร้างท่าของฉัน (UX 12.6): ชื่อ/หมวดเติมจากจอค้นผ่าน ?name= &category= (ตัดช่องว่าง · ไม่เกิน 60 ตัว · หมวดต้องอยู่ในรายการ)
export default async function NewExercisePage({ searchParams }: { searchParams: Promise<{ name?: string | string[]; category?: string | string[] }> }) {
  const sp = await searchParams;
  const name = typeof sp.name === "string" ? clampName(sp.name) : "";
  const category = typeof sp.category === "string" && isCategory(sp.category) ? sp.category : null;
  return <NewExerciseForm initialName={name} initialCategory={category} />;
}
