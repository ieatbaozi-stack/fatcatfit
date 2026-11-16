// STUB ชั่วคราวของ frontend (R0) — ux-brand เป็นเจ้าของ Lead จะแทนด้วยของจริงตอนรวม
// signature ตามที่ตกลง: <Cat pose="standing" size={120} wiggle title="..." className="..." />
import type { CSSProperties } from "react";

export type CatProps = {
  /** slug ตาม assets/stickers/README.md เช่น standing, lying, side, new-record, confused, offline, stretch, scale, peek */
  pose: string;
  size?: number;
  wiggle?: boolean;
  /** มี title = ภาพมีความหมาย (role img + aria-label) · ไม่มี = ของตกแต่ง (aria-hidden) */
  title?: string;
  className?: string;
};

export function Cat({ pose, size = 120, wiggle = false, title, className }: CatProps) {
  const style: CSSProperties = { width: size, height: size };
  return (
    <svg
      viewBox="0 0 120 120"
      style={style}
      className={className}
      data-pose={pose}
      data-wiggle={wiggle ? "on" : "off"}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <ellipse cx="60" cy="64" rx="48" ry="40" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
