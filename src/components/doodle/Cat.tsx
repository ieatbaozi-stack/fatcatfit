// แมววาดมือ — SVG inline จากต้นฉบับ docs/design/samples.html + ท่าขยับใน scripts/sprites/rigs.mjs (ผ่าน poses.generated.ts)
// เส้นใช้ currentColor · สีใช้ var(--cat) var(--cat-ear) var(--cat-white) var(--paper) ที่ theme ประกาศ
// (โหมดมืด theme ตั้งสามตัวแรกให้เท่ากับ --paper แมวจึงเป็นเส้นล้วนเอง component ไม่ต้องรู้โหมด)
//
// ไม่มี "use client": ใช้ได้ทั้ง Server Component และ Client Component (useId ใช้ได้ทั้งสองฝั่ง)
// แมวขยับจริง (motion) = 5 เฟรมจาก rig แบบแผ่น sprite ด้วย CSS ล้วน (cat.css) ไม่มี JS
//   เฟรมเรียงแนวนอนห่างกัน STRIDE หน่วยในแผ่นเดียว (fcf-cat-strip) ภายในกรอบ clip ที่กว้างพอให้เห็นได้ทีละเฟรม
//   แอนิเมชันตัวเดียว (เลื่อนแผ่นด้วย steps(5)) คุมทุกเฟรม → ซ้อนเฟรมไม่ได้โดยโครงสร้าง
//   (แบบเดิม 5 แอนิเมชันแยกชั้น เริ่มไม่พร้อมกันได้เมื่อเบราว์เซอร์ parse SVG ไม่จบในรอบเดียว → เห็น 2 เฟรมซ้อน)
//   ชั้นภาพนิ่งแสดงตั้งต้น ชั้นขยับซ่อนตั้งต้น → CSS ไม่โหลด / prefers-reduced-motion: reduce = เห็นภาพนิ่งภาพเดียว
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
/** ระยะห่างของเฟรมในแผ่น sprite (หน่วย viewBox) — ต้องตรงกับ -5 × STRIDE ใน @keyframes ของ cat.css
 *  ภาพทุกท่าอยู่ราว x −14..225 จึงเผื่อกรอบ clip −200..400 ได้โดยไม่ตัดภาพ และเฟรมข้างเคียง (≥ 950) อยู่นอกกรอบเสมอ
 *  STRIDE × (size/200) เป็นจำนวนเต็ม px ทุก size ที่เป็นจำนวนเต็ม → เฟรมที่เห็นตรงตำแหน่งเดิมเป๊ะ */
const CAT_FRAME_STRIDE = 1000;
const CLIP_BOX = { x: -200, y: -200, width: 600, height: 600 } as const;

export function Cat({ pose, size = 120, motion = false, title, className }: CatProps) {
  // id ของ filter ต้องไม่ชนกันเมื่อมีแมวหลายตัว และต้องเหมือนกันทั้งฝั่งเซิร์ฟเวอร์/ไคลเอนต์ → useId
  // ตัดอักขระพิเศษ (เช่น « » :) ออกเพื่อใช้ใน url(#...) ได้ปลอดภัย
  // คำนำหน้า "doodle" ไม่ขึ้นต้นด้วยอักษร hex — กันตัวตรวจ "ห้ามมีค่าสี #xxx" สับสน
  const uid = `doodle${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const data = POSES[pose];
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true as const };
  // ชั้นภาพ: ภาพนิ่ง (+ ชั้นขยับ 5 เฟรมเมื่อ motion) · ทุกชั้นใช้ตัวกรองเส้นสั่นคู่เดียวกัน
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
        {motion && (
          <clipPath id={`${uid}-c`}>
            {/* clip ใช้แค่รูปทรง ไม่สนสี — fill="none" ให้ทุก element ในแมวมีสีเฉพาะชุดของ theme (เกตโหมดมืดเส้นล้วน) */}
            <rect {...CLIP_BOX} fill="none" />
          </clipPath>
        )}
      </defs>
      <g className={motion ? "fcf-cat-still" : undefined} dangerouslySetInnerHTML={{ __html: markup(data.still) }} />
      {motion && (
        // ซ่อนตั้งต้น — CSS (cat.css) เปิดให้เห็นและเลื่อนแผ่นเฉพาะเมื่อผู้ใช้ไม่ได้ขอลดการเคลื่อนไหว
        <g className="fcf-cat-motion" visibility="hidden" clipPath={`url(#${uid}-c)`}>
          <g className="fcf-cat-strip">
            {data.frames.map((frame, k) => (
              <g
                key={k}
                className={`fcf-cat-frame fcf-cat-f${k}`}
                transform={k ? `translate(${k * CAT_FRAME_STRIDE} 0)` : undefined}
                dangerouslySetInnerHTML={{ __html: markup(frame) }}
              />
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}
