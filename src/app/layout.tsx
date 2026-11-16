// ไฟล์ชั่วคราวจาก platform (R0 ขั้น 1) — frontend เป็นเจ้าของ จะมาแทน
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Fat Cat Fit" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
