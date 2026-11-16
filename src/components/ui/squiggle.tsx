import { cx } from "./cx";

// เส้นวาดมือ 4 แบบ (จาก wireframes.html) ให้สลับใช้ไม่ซ้ำกันทั้งจอ
export const SQUIGGLE_PATHS = [
  "M2 5 C50 8 110 2 170 6 S290 3 338 6",
  "M2 6 C70 3 130 8 190 5 S300 7 338 4",
  "M2 4 C60 7 120 3 180 6 S280 4 338 6",
  "M2 6 C40 4 120 7 160 5 S270 3 338 5",
] as const;

/** เส้นคั่นวาดมือ แทน <hr> · variant 0–3 เลือกแบบเส้น · tone "muted" = เส้นเทาบาง */
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
      className={cx("block h-2.5 w-full flex-none", tone === "ink" ? "text-ink" : "text-ink-3", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
