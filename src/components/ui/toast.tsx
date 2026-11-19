"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ข้อความลอยสั้นๆ ขอบวาดมือ 3 วินาที (role="status") · ช่อง live region อยู่ตลอด ข้อความเปลี่ยนแล้วโปรแกรมอ่านจอจะอ่าน
 * คืน [โหนดที่ต้อง render, ฟังก์ชันแสดง]
 */
export function useToast(durationMs = 3000): [React.ReactNode, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback(
    (next: string) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setText(next);
      timer.current = window.setTimeout(() => setText(null), durationMs);
    },
    [durationMs],
  );

  const node = (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-5">
      {text ? (
        <p className="max-w-100 rounded-hand border-draw border-ink bg-paper px-4 py-2 text-center text-body text-ink">{text}</p>
      ) : null}
    </div>
  );
  return [node, show];
}
