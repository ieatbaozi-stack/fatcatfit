import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./icon";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id" | "children"> & {
  children: ReactNode;
  /** accent = ติ๊กแล้วเป็นส้ม (ค่าเริ่มต้น) · ink = ติ๊กแล้วเป็นสีหมึก เมื่อจอมีช่องติ๊กหลายช่อง (ส้มที่เดียวต่อจอ) */
  tone?: "accent" | "ink";
};

/** ช่องติ๊ก: กล่องวาดมือ 28px ในแถวสูง ≥ 52px แตะได้ทั้งแถว · ติ๊กแล้วมีเครื่องหมายถูก (ไม่ใช่สีอย่างเดียว) */
export function Checkbox({ children, className, tone = "accent", ...rest }: CheckboxProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-13 cursor-pointer items-start gap-3 py-2 has-disabled:cursor-not-allowed">
      <input id={id} type="checkbox" className="peer sr-only" {...rest} />
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-7 flex-none place-items-center rounded-box border-draw border-ink ${tone === "ink" ? "text-paper peer-checked:bg-ink" : "text-on-accent peer-checked:bg-accent"} peer-focus-visible:shadow-[0_0_0_3px_var(--paper),0_0_0_5.5px_var(--ink)] peer-disabled:opacity-40 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100`}
      >
        <Icon name="check" size={20} strokeWidth={3} />
      </span>
      <span className={className ?? "text-body text-ink"}>{children}</span>
    </label>
  );
}
