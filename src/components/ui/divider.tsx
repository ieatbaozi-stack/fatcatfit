import { cx } from "./cx";

/** เส้นคั่นตรงบาง 1px สี --line (CR4 Studio Minimal · แทนเส้นหยักหนา) */
export function Divider({ className }: { className?: string }) {
  return <hr aria-hidden="true" className={cx("my-6 h-px w-full border-0 bg-line", className)} />;
}
