// แมววาดมือ — SVG inline จากต้นฉบับ docs/design/samples.html (ผ่าน poses.generated.ts)
// เส้นใช้ currentColor · สีใช้ var(--cat) var(--cat-ear) var(--cat-white) var(--paper) ที่ theme ประกาศ
// (โหมดมืด theme ตั้งสามตัวแรกให้เท่ากับ --paper แมวจึงเป็นเส้นล้วนเอง component ไม่ต้องรู้โหมด)
//
// ไม่มี "use client": ใช้ได้ทั้ง Server Component และ Client Component (useId ใช้ได้ทั้งสองฝั่ง)
// ดุ๊กดิ๊กเป็น CSS ล้วน (cat.css) ไม่มี JS และหยุดเองเมื่อ prefers-reduced-motion: reduce
import { useId } from "react";
import { FRAMES, POSES, WOB, type CatPose } from "./poses.generated";
import "./cat.css";

export interface CatProps {
  pose: CatPose;
  /** ความกว้างเป็น px (สูงเท่ากัน) */
  size?: number;
  /** ดุ๊กดิ๊ก 3 เฟรม รอบละ 0.6 วิ */
  wiggle?: boolean;
  /** มี = ภาพที่มีความหมาย (role="img") · ไม่มี = ภาพตกแต่ง (aria-hidden) */
  title?: string;
  className?: string;
}

const FILTER_BOX = { x: "-10%", y: "-10%", width: "120%", height: "120%" } as const;

export function Cat({ pose, size = 120, wiggle = false, title, className }: CatProps) {
  // id ของ filter ต้องไม่ชนกันเมื่อมีแมวหลายตัว และต้องเหมือนกันทั้งฝั่งเซิร์ฟเวอร์/ไคลเอนต์ → useId
  // ตัดอักขระพิเศษ (เช่น « » :) ออกเพื่อใช้ใน url(#...) ได้ปลอดภัย
  // คำนำหน้า "doodle" ไม่ขึ้นต้นด้วยอักษร hex — กันตัวตรวจ "ห้ามมีค่าสี #xxx" สับสน
  const uid = `doodle${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const data = POSES[pose];
  const frames = wiggle ? FRAMES : FRAMES.slice(0, 1);
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true as const };

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
        {frames.map((f, k) => (
          <g key={k}>
            <filter id={`${uid}-l${k}`} {...FILTER_BOX}>
              <feTurbulence type="fractalNoise" baseFrequency={WOB.line.baseFrequency} numOctaves={2} seed={f.line} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={WOB.line.scale} />
            </filter>
            <filter id={`${uid}-f${k}`} {...FILTER_BOX}>
              <feTurbulence type="fractalNoise" baseFrequency={WOB.fill.baseFrequency} numOctaves={2} seed={f.fill} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={WOB.fill.scale} />
            </filter>
          </g>
        ))}
      </defs>
      {frames.map((f, k) => (
        <g
          key={k}
          transform={f.tf || undefined}
          // เฟรม 2–3 ซ่อนไว้ตั้งต้น — ถ้า CSS ไม่โหลดหรือลดการเคลื่อนไหว จะเห็นเฟรมแรกเฟรมเดียว
          visibility={k > 0 ? "hidden" : undefined}
          className={wiggle ? `fcf-cat-frame fcf-cat-f${k}` : undefined}
          // body มาจาก poses.generated.ts ที่สร้างจากไฟล์ใน repo เท่านั้น ไม่มีข้อมูลจากผู้ใช้
          dangerouslySetInnerHTML={{
            __html: data.body
              .replaceAll("url(#wob-line)", `url(#${uid}-l${k})`)
              .replaceAll("url(#wob-fill)", `url(#${uid}-f${k})`),
          }}
        />
      ))}
    </svg>
  );
}
