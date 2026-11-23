import { SEARCH_TERMS_SEPARATOR, type Category } from "./exercise-meta";

// ค้นท่าฝั่งไคลเอนต์ (R2 contract "API & ชนิดข้อมูล" ข้อ 4) — ฟังก์ชันบริสุทธิ์ ไม่แตะเครือข่าย/DOM (R3 ใช้ค้นตอนออฟไลน์)
// normalize: NFC → ตัวเล็ก → ตัดวรรณยุกต์/เครื่องหมายไทย U+0E47–U+0E4E → ตัดช่องว่าง ขีด วรรคตอน
// จับคู่แบบ substring บน name, name_th, search_terms · อันดับ: ขึ้นต้นชื่อ(0) > ขึ้นต้นคำ(1) > กลางคำ(2) · เท่ากัน: ท่าของฉันก่อน แล้วตามตัวอักษร

export type SearchableExercise = {
  id: string;
  name: string;
  name_th: string | null;
  search_terms: string | null;
  /** null = คลังกลาง · ไม่ null = ท่าของฉัน */
  owner_user_id: string | null;
  category: Category | string;
  archived_at: string | null;
};

const THAI_MARKS = /[็-๎]/gu;
const NON_WORD = /[^\p{L}\p{N}\p{M}]+/u;

/** ข้อความที่ normalize แล้ว (ไม่มีช่องว่าง) + ตำแหน่งที่คำขึ้นต้น */
function prepare(text: string): { s: string; starts: Set<number> } {
  const words = text.normalize("NFC").toLowerCase().replace(THAI_MARKS, "").split(NON_WORD).filter(Boolean);
  const starts = new Set<number>();
  let at = 0;
  for (const w of words) {
    starts.add(at);
    at += w.length;
  }
  return { s: words.join(""), starts };
}

export function normalizeQuery(text: string): string {
  return prepare(text).s;
}

/** อันดับของข้อความหนึ่งกับคำค้น: 0 ขึ้นต้น · 1 ขึ้นต้นคำ · 2 กลางคำ · null ไม่เจอ */
function rankText(text: string | null | undefined, q: string): number | null {
  if (!text) return null;
  const { s, starts } = prepare(text);
  let best: number | null = null;
  for (let i = s.indexOf(q); i !== -1; i = s.indexOf(q, i + 1)) {
    const r = i === 0 ? 0 : starts.has(i) ? 1 : 2;
    if (best === null || r < best) best = r;
    if (r === 0) break;
  }
  return best;
}

export function rankExercise(e: SearchableExercise, q: string): number | null {
  const fields: Array<string | null | undefined> = [e.name, e.name_th, ...(e.search_terms ? e.search_terms.split(SEARCH_TERMS_SEPARATOR) : [])];
  let best: number | null = null;
  for (const f of fields) {
    const r = rankText(f, q);
    if (r !== null && (best === null || r < best)) best = r;
    if (best === 0) break;
  }
  return best;
}

export type SearchOptions = {
  /** กรองหมวด (ชิป) */
  category?: string | null;
  /** แสดงท่าที่เก็บเข้ากรุด้วย (ค่าเริ่มต้น false) */
  includeArchived?: boolean;
  limit?: number;
};

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** ค้นท่า · คำค้นว่าง (หลัง normalize) = คืนทุกท่าตามหมวดที่เลือก เรียงท่าของฉันก่อนแล้วตามตัวอักษร */
export function searchExercises<T extends SearchableExercise>(items: readonly T[], query: string, opts: SearchOptions = {}): T[] {
  const q = normalizeQuery(query);
  const scored: Array<{ e: T; rank: number }> = [];
  for (const e of items) {
    if (!opts.includeArchived && e.archived_at) continue;
    if (opts.category && e.category !== opts.category) continue;
    const rank = q ? rankExercise(e, q) : 0;
    if (rank !== null) scored.push({ e, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.e.owner_user_id !== null) - Number(a.e.owner_user_id !== null) ||
      collator.compare(a.e.name, b.e.name) ||
      (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0),
  );
  const out = scored.map((s) => s.e);
  return opts.limit ? out.slice(0, opts.limit) : out;
}
