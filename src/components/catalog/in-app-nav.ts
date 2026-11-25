// จำว่าผู้ใช้เข้าฟอร์มจากในแอป (จอค้นตั้งค่านี้ตอน mount) — ฟอร์มกลับด้วย history ได้เฉพาะกรณีนี้
// เปิดฟอร์มตรงๆ/มาจากเว็บอื่น history.back() จะพาออกนอกแอป → ใช้ replace ไปจอค้นแทน
let inApp = false;
export const markInApp = (): void => {
  inApp = true;
};
export const cameFromApp = (): boolean => inApp;
export const resetInApp = (): void => {
  inApp = false;
};

// หน้าแก้ท่าใช้ path คงที่ `/me/exercises/edit` (เปิดออฟไลน์ได้ · ADR 0005) — id ของท่าที่กำลังแก้จำไว้ในเครื่อง (แท็บนี้)
const EDIT_KEY = "fcf:edit-exercise";
export const EXERCISE_EDIT_HREF = "/me/exercises/edit";
let editId: string | null = null;

export function setEditExerciseId(id: string): void {
  editId = id;
  try {
    sessionStorage.setItem(EDIT_KEY, id);
  } catch {
    // ใช้ตัวแปรในหน่วยความจำ
  }
}

export function getEditExerciseId(): string | null {
  try {
    return sessionStorage.getItem(EDIT_KEY) ?? editId;
  } catch {
    return editId;
  }
}
