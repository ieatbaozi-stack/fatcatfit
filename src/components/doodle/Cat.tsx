// แมววาดมือ — SVG inline จากต้นฉบับ docs/design/samples.html + ท่าขยับใน scripts/sprites/rigs.mjs (ผ่าน poses.generated.ts)
// เส้นใช้ currentColor · สีใช้ var(--cat) var(--cat-ear) var(--cat-white) var(--paper) ที่ theme ประกาศ
// (โหมดมืด theme ตั้งสามตัวแรกให้เท่ากับ --paper แมวจึงเป็นเส้นล้วนเอง component ไม่ต้องรู้โหมด)
//
// ไม่มี "use client": ใช้ได้ทั้ง Server Component และ Client Component (useId ใช้ได้ทั้งสองฝั่ง)
// แมวขยับจริง (motion) = 5 เฟรมจาก rig สลับด้วย CSS ล้วน (cat.css) ไม่มี JS
//   ชั้นภาพนิ่งแสดงตั้งต้น เฟรมทั้ง 5 ซ่อนตั้งต้น → CSS ไม่โหลด / prefers-reduced-motion: reduce = เห็นภาพนิ่งภาพเดียว
import { useId } from "react";
import { POSES, WOB, type CatPose } from "./poses.generated";
import "./cat.css";

export interface CatProps {
  pose: CatPose;
  /** ความกว้างเป็น px (สูงเท่ากัน) */
  size?: number;
  /** แมวขยับจริง 5 เฟรม รอบละ 0.7 วิ (นิ่งเองเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว) */
  motion?: boolean;
  /** มี = ภาพที่มีความหมาย (role="img") · ไม่มี = ภาพตกแต่ง (aria-hidden) */
  title?: string;
  className?: string;
}

const FILTER_BOX = { x: "-10%", y: "-10%", width: "120%", height: "120%" } as const;

export function Cat({ pose, size = 120, motion = false, title, className }: CatProps) {
  // id ของ filter ต้องไม่ชนกันเมื่อมีแมวหลายตัว และต้องเหมือนกันทั้งฝั่งเซิร์ฟเวอร์/ไคลเอนต์ → useId
  // ตัดอักขระพิเศษ (เช่น « » :) ออกเพื่อใช้ใน url(#...) ได้ปลอดภัย
  // คำนำหน้า "doodle" ไม่ขึ้นต้นด้วยอักษร hex — กันตัวตรวจ "ห้ามมีค่าสี #xxx" สับสน
  const uid = `doodle${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const data = POSES[pose];
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true as const };
  // ชั้นภาพ: ภาพนิ่ง (+ 5 เฟรมเมื่อ motion) · ทุกชั้นใช้ตัวกรองเส้นสั่นคู่เดียวกัน
  // markup มาจาก poses.generated.ts ที่สร้างจากไฟล์ใน repo เท่านั้น ไม่มีข้อมูลจากผู้ใช้
  const markup = (layer: string) =>
    layer
      .replace(/@(\d+)/g, (_, n: string) => data.els[Number(n)])
      .replaceAll("url(#wob-line)", `url(#${uid}-l)`)
      .replaceAll("url(#wob-fill)", `url(#${uid}-f)`);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      overflow={data.clip ? "hidden" : "visible"}
      focusable="false"
      className={className}
      data-pose={pose}
      {...a11y}
    >
      <defs>
        <filter id={`${uid}-l`} {...FILTER_BOX}>
          <feTurbulence type="fractalNoise" baseFrequency={WOB.line.baseFrequency} numOctaves={2} seed={WOB.line.seed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={WOB.line.scale} />
        </filter>
        <filter id={`${uid}-f`} {...FILTER_BOX}>
          <feTurbulence type="fractalNoise" baseFrequency={WOB.fill.baseFrequency} numOctaves={2} seed={WOB.fill.seed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={WOB.fill.scale} />
        </filter>
      </defs>
      <g className={motion ? "fcf-cat-still" : undefined} dangerouslySetInnerHTML={{ __html: markup(data.still) }} />
      {motion &&
        data.frames.map((frame, k) => (
          <g
            key={k}
            // ซ่อนตั้งต้นทุกเฟรม — CSS (cat.css) เป็นคนสลับให้เห็นทีละเฟรม
            visibility="hidden"
            className={`fcf-cat-frame fcf-cat-f${k}`}
            dangerouslySetInnerHTML={{ __html: markup(frame) }}
          />
        ))}
    </svg>
  );
}
