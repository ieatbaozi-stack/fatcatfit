import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: string;
  /** ข้อความผิดพลาดใต้ช่อง (เส้นใต้ --warn + ข้อความ · ไม่สื่อด้วยสีอย่างเดียว) */
  error?: string | null;
  /** ตัวเลข/โค้ดใช้ตัวกว้างเท่ากัน */
  tabular?: boolean;
};

/** ช่องกรอกข้อความ: ป้ายอยู่บน เส้นใต้วาดมือ · ตัวอักษร ≥ 16px (กัน iOS ซูม) สูง ≥ 48px */
export function TextField({ label, hint, error, tabular = false, className, ...rest }: TextFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption text-ink-3">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cx(
          "min-h-12 w-full rounded-underline border-0 border-b-2 bg-transparent px-0 text-section text-ink placeholder:font-light placeholder:text-ink-3",
          error ? "border-warn" : "border-ink",
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
