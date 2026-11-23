import { cx } from "./cx";

// ไอคอนเส้นวาดมือ (path จาก wireframes.html ที่ boss อนุมัติ) — เส้นใช้ currentColor
const PATHS = {
  home: "M4 11.5 L12 4.5 L20 11 M6.5 10 L6 20 L18 20.3 L17.6 10",
  history: "M4 6.5 L20 6 L20.3 20 L3.8 20.2 Z M4 10.5 L20 10.2 M8 3.5 L8.2 7.5 M16 3.3 L15.8 7.5",
  progress: "M3 18.5 L8.5 12 L12.5 15 L20.5 6.5 M3 21 L21 20.6",
  me: "M5.5 9.5 L5 3.5 L9.8 7.2 Q12 6.5 14.2 7.2 L19 3.5 L18.5 9.5 Q21 14.5 17 18.2 Q12 21.2 7 18.2 Q3 14.5 5.5 9.5Z",
  check: "M5 13 L10 18 L19 6",
  plus: "M12 5 L12.2 19 M5 12 L19 11.8",
  minus: "M5 12 L19 11.8",
  back: "M15 5 L8 12 L14.8 19",
  close: "M6 6 L18 18 M18 6 L6 18.2",
  down: "M5 9 L12 16 L19 9.2",
  pin: "M12 21 Q5 13.5 5.5 9.5 A6.5 6.5 0 0 1 18.5 9.5 Q19 13.5 12 21 Z M12 7.6 A2 2 0 1 0 12.1 7.6 Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  strokeWidth = 2.2,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cx("block flex-none", className)}
    >
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
