"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { useKeyboardInset } from "./use-keyboard-inset";

const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
const DRAG_CLOSE_PX = 80;

/**
 * แผ่นล่างแบบ modal (CR4 Studio Minimal · UX 12.3/12.7):
 * พื้น surface-3 ยกชั้นชัด · ขอบบาง 1px · เงาอ่อน · focus ถูกขังในแผ่น · Esc/แตะพื้นมืด/ลากลง = ปิด
 */
export function Sheet({ titleId, onClose, busy = false, children, className }: { titleId: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const dragFrom = useRef<number | null>(null);
  const kb = useKeyboardInset();

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = dialog.current?.querySelector<HTMLElement>("[data-autofocus]") ?? dialog.current;
    first?.focus();
    return () => {
      const el = opener.current;
      // คืน focus ให้ปุ่ม/แถวที่เปิด (ถ้ายังอยู่ในหน้า) หลังแผ่นหายไป
      if (el && el.isConnected) window.setTimeout(() => el.focus(), 0);
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-scrim" onClick={() => (busy ? undefined : onClose())} aria-hidden="true" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={kb > 0 ? { bottom: kb } : undefined}
        className={cx(
          "pb-safe absolute inset-x-3 mx-auto flex max-h-9/10 max-w-114 flex-col gap-3.5 overflow-y-auto rounded-sheet border border-line-strong bg-surface-3 p-5 shadow-elevated outline-none",
          kb > 0 ? "bottom-0" : "bottom-3",
          className,
        )}
      >
        {/* มือจับลากลงเพื่อปิด (ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านจอใช้ Esc หรือปุ่มปิด) */}
        <div
          aria-hidden="true"
          className="-mt-2 flex h-4 flex-none cursor-grab touch-none justify-center"
          onPointerDown={(e) => {
            dragFrom.current = e.clientY;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerUp={(e) => {
            const from = dragFrom.current;
            dragFrom.current = null;
            if (from !== null && e.clientY - from > DRAG_CLOSE_PX && !busy) onClose();
          }}
        >
          <span className="mt-1 h-1 w-9 rounded-full bg-line-strong" />
        </div>
        {children}
      </div>
    </div>
  );
}
