import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: string;
  /** ข้อความผิดพลาดใต้ช่อง (ขอบ --warn + ข้อความ · ไม่สื่อด้วยสีอย่างเดียว) */
  error?: string | null;
  /** ตัวเลข/โค้ดใช้ตัวกว้างเท่ากัน */
  tabular?: boolean;
};

/** ช่องกรอกข้อความ (CR4 Studio Minimal): กล่องพื้นรองสะอาดมุมโค้ง 12px ขอบบาง 1px · ตัวอักษร ≥ 16px สูง ≥ 48px */
export function TextField({ label, hint, error, tabular = false, className, ...rest }: TextFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption font-medium text-ink-2">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cx(
          "min-h-12 w-full rounded-hand border bg-paper-2 px-3.5 text-body text-ink placeholder:font-normal placeholder:text-ink-3 transition-colors duration-150 focus:bg-paper",
          error ? "border-warn" : "border-line focus:border-line-strong",
          tabular && "num",
          className,
        )}
        {...rest}
      />
      {note ? (
        <p id={noteId} role={error ? "alert" : undefined} className={cx("text-caption", error ? "text-warn" : "text-ink-3")}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
