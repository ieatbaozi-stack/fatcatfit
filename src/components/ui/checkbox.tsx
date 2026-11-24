import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./icon";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id" | "children"> & {
  children: ReactNode;
  /** accent = ติ๊กแล้วเป็นส้ม (ค่าเริ่มต้น) · ink = ติ๊กแล้วเป็นสีหมึก เมื่อจอมีช่องติ๊กหลายช่อง (ส้มที่เดียวต่อจอ) */
  tone?: "accent" | "ink";
};

/** ช่องติ๊ก (CR4 Studio Minimal): กล่องมุมโค้ง 10px ขนาด 28px ในแถวสูง ≥ 52px แตะได้ทั้งแถว */
export function Checkbox({ children, className, tone = "accent", ...rest }: CheckboxProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-13 cursor-pointer items-start gap-3 py-2 has-disabled:cursor-not-allowed">
      <input id={id} type="checkbox" className="peer sr-only" {...rest} />
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-7 flex-none place-items-center rounded-box border border-line-strong bg-paper-2 transition-colors duration-150 ${
          tone === "ink"
            ? "text-paper peer-checked:border-ink peer-checked:bg-ink"
            : "text-on-accent peer-checked:border-transparent peer-checked:bg-accent"
        } peer-focus-visible:shadow-[0_0_0_2.5px_var(--paper),0_0_0_4.5px_var(--ink)] peer-disabled:opacity-40 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100`}
      >
        <Icon name="check" size={18} strokeWidth={2.8} />
      </span>
      <span className={className ?? "text-body text-ink"}>{children}</span>
    </label>
  );
}
