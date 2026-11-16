import type { ElementType, ReactNode } from "react";
import { cx } from "./cx";

// บล็อกอักษรไทย U+0E00–U+0E7F
function hasThai(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0e00 && code <= 0x0e7f) return true;
  }
  return false;
}

/**
 * คำเด่นลายมือ (Gaegu Light) — ภาษาอังกฤษสั้นๆ เท่านั้น ขนาด ≥ 20px ตัวพิมพ์เล็ก
 * ถ้าข้อความมีตัวอักษรไทย จะไม่ใช้ฟอนต์ลายมือ (DESIGN ข้อ 4: ห้ามใช้กับภาษาไทย)
 */
export function HandWord({
  children,
  as: Tag = "span",
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  if (typeof children === "string" && hasThai(children)) {
    return <Tag className={className}>{children}</Tag>;
  }
  return <Tag className={cx("hand-word text-hand", className)}>{children}</Tag>;
}
