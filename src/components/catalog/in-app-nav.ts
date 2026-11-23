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
