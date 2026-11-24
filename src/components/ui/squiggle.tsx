import { cx } from "./cx";

// เส้นตรงบาง 1px 4 รูป (คง API เดิมให้โค้ดและเทสต์ทุกสาขาเข้ากันได้ — ยกเลิกเส้นหยักหนาตาม CR4 Studio Minimal)
export const SQUIGGLE_PATHS = [
  "M0 5 L340 5",
  "M1 5 L339 5",
  "M2 5 L338 5",
  "M0 5 H340",
] as const;

/** เส้นคั่นบางสะอาด 1px (คงชื่อ Squiggle เพื่อเข้ากันได้กับโค้ดเดิมและสาขา R3a) */
export function Squiggle({
  variant = 0,
  tone = "ink",
  className,
}: {
  variant?: number;
  tone?: "ink" | "muted";
  className?: string;
}) {
  const d = SQUIGGLE_PATHS[((variant % 4) + 4) % 4];
  return (
    <svg
      viewBox="0 0 340 10"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cx("block h-2.5 w-full flex-none", tone === "ink" ? "text-line-strong" : "text-line", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
