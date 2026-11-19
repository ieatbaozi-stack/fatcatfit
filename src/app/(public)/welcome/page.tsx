import { WelcomeScreen } from "@/components/auth/welcome-screen";

// HTML เหมือนกันทุกสถานะ (ไม่อ่าน cookie/ข้อมูลผู้ใช้) — service worker เก็บไว้เป็นจอยินดีต้อนรับตอนออฟไลน์
// โค้ดเชิญมาทาง #invite= ที่ไคลเอนต์อ่านเอง (ADR 0006) — หน้านี้ห้ามรับโค้ดทาง URL ฝั่งเซิร์ฟเวอร์
export default function WelcomePage() {
  return <WelcomeScreen />;
}
