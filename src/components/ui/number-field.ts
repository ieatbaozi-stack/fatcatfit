// logic ล้วนของช่องตัวเลข (ไม่มี React) — เทสต์ใน number-field.test.ts

export function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const exp = /e-(\d+)$/.exec(s);
  if (exp) return Number(exp[1]);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

export function roundTo(n: number, decimals: number): number {
  return Number(n.toFixed(Math.min(Math.max(decimals, 0), 10)));
}

export function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

/** แปลงข้อความที่พิมพ์เป็นตัวเลข: รับ "62.5" "62,5" "62." ".5" "-3" · อื่นๆ = null */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(n: number | null, decimals: number): string {
  return n === null ? "" : String(roundTo(n, decimals));
}

/** เพิ่ม/ลดทีละ step โดยไม่มีเศษทศนิยมลอย (0.1+0.2) · ค่าว่างเริ่มจาก min (หรือ 0) */
export function stepValue(
  value: number | null,
  direction: 1 | -1,
  step: number,
  min?: number,
  max?: number,
): number {
  const base = value ?? min ?? 0;
  const decimals = Math.max(decimalsOf(step), decimalsOf(base));
  return clamp(roundTo(base + direction * step, decimals), min, max);
}
