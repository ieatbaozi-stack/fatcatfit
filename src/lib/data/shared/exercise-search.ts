import { SEARCH_TERMS_SEPARATOR, type Category } from "./exercise-meta";

// ค้นท่าฝั่งไคลเอนต์ (R2 contract "API & ชนิดข้อมูล" ข้อ 4) — ฟังก์ชันบริสุทธิ์ ไม่แตะเครือข่าย/DOM (R3 ใช้ค้นตอนออฟไลน์)
// normalize: NFC → ตัวเล็ก → ตัดวรรณยุกต์/เครื่องหมายไทย U+0E47–U+0E4E → ตัดช่องว่าง ขีด วรรคตอน
// จับคู่แบบ substring บน name, name_th, search_terms
// อันดับ (น้อย = ดี) ตามลำดับ:
//  1. tier ของการจับคู่ — ตรงทั้งชื่อ (EN/TH) · ตรงทั้งชื่อหลังตัดคำอุปกรณ์หน้าชื่อ · ขึ้นต้นคำที่ n หลังตัดคำอุปกรณ์หน้าชื่อ
//     (barbell/dumbbell/kettlebell/cable/machine/smith/ez และคำไทย) · กลางคำ
//     → "bench" จึงได้ "Barbell Bench Press" (คำที่ 0) ก่อน "Barbell Squat To A Bench" (คำที่ 3)
//  2. ท่าของฉันก่อนคลัง
//  3. อุปกรณ์นำหน้า: barbell < dumbbell < อื่นๆ/ไม่มี  4. จำนวนคำน้อยกว่า  5. ชื่อสั้นกว่า  6. ตามตัวอักษร

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

function tokenize(text: string): string[] {
  return text.normalize("NFC").toLowerCase().replace(THAI_MARKS, "").split(NON_WORD).filter(Boolean);
}

export function normalizeQuery(text: string): string {
  return tokenize(text).join("");
}

// คำอุปกรณ์ที่นำหน้าชื่อท่า — ตัดออกก่อนนับว่าคำค้นตรงกับคำที่เท่าไร
const EQUIP_WORDS = new Set(["barbell", "dumbbell", "kettlebell", "cable", "machine", "smith", "ez", "band", "bands", "bb", "db", "kb"]);
// ไทยไม่มีช่องว่างคั่นคำ จึงตัดเป็นคำนำหน้าของคำ (ผ่าน normalize แล้ว)
const THAI_EQUIP_PREFIXES = [
  "บาร์เบลล์",
  "บาร์เบล",
  "ดัมเบลล์",
  "ดัมเบล",
  "เคตเทิลเบลล์",
  "เคตเทิลเบล",
  "เคเบิล",
  "สมิธ",
  "สมิท",
  "เครื่อง",
  "ยางยืด",
  "อีแซด",
]
  .map(normalizeQuery)
  .sort((a, b) => b.length - a.length);

type Stripped = { words: string[]; equip: string | null };

/** ตัดคำอุปกรณ์ที่นำหน้า (ซ้ำได้ เช่น "Smith Machine ...") · equip = คำอุปกรณ์คำแรกที่ถูกตัด */
function stripLeadingEquipment(tokens: string[]): Stripped {
  const words = [...tokens];
  let equip: string | null = null;
  while (words.length > 1) {
    const w = words[0];
    if (EQUIP_WORDS.has(w)) {
      equip ??= w;
      words.shift();
      continue;
    }
    const p = THAI_EQUIP_PREFIXES.find((x) => w.length > x.length && w.startsWith(x));
    if (p) {
      equip ??= p;
      words[0] = w.slice(p.length);
    }
    break;
  }
  return { words, equip };
}

const EXACT = 0;
const EXACT_STRIPPED = 1;
const WORD_BASE = 2; // + ลำดับคำที่คำค้นเริ่ม
const MID_BASE = 100;

/** tier ของข้อความหนึ่งกับคำค้น (น้อย = ดี) · null ไม่เจอ */
function tierOf(text: string | null | undefined, q: string, allowExact: boolean): number | null {
  if (!text) return null;
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;
  if (allowExact && tokens.join("") === q) return EXACT;
  const { words } = stripLeadingEquipment(tokens);
  const joined = words.join("");
  if (joined === q) return EXACT_STRIPPED;
  const starts: number[] = [];
  let at = 0;
  for (const w of words) {
    starts.push(at);
    at += w.length;
  }
  let best: number | null = null;
  for (let i = joined.indexOf(q); i !== -1; i = joined.indexOf(q, i + 1)) {
    const k = starts.indexOf(i);
    let wordIdx = starts.length - 1;
    while (wordIdx > 0 && starts[wordIdx] > i) wordIdx--;
    const tier = k !== -1 ? WORD_BASE + k : MID_BASE + wordIdx;
    if (best === null || tier < best) best = tier;
    if (best === WORD_BASE) break;
  }
  return best;
}

export function rankExercise(e: SearchableExercise, q: string): number | null {
  let best: number | null = null;
  const consider = (t: number | null) => {
    if (t !== null && (best === null || t < best)) best = t;
  };
  consider(tierOf(e.name, q, true));
  consider(tierOf(e.name_th, q, true));
  if (e.search_terms) for (const term of e.search_terms.split(SEARCH_TERMS_SEPARATOR)) consider(tierOf(term, q, false));
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

type Scored<T> = { e: T; tier: number; equip: number; words: number };

function equipPriority(equip: string | null): number {
  if (equip === "barbell" || equip === "bb") return 0;
  if (equip === "dumbbell" || equip === "db") return 1;
  return 2;
}

/** ค้นท่า · คำค้นว่าง (หลัง normalize) = คืนทุกท่าตามหมวดที่เลือก เรียงท่าของฉันก่อนแล้วตามตัวอักษร */
export function searchExercises<T extends SearchableExercise>(items: readonly T[], query: string, opts: SearchOptions = {}): T[] {
  const q = normalizeQuery(query);
  const scored: Scored<T>[] = [];
  for (const e of items) {
    if (!opts.includeArchived && e.archived_at) continue;
    if (opts.category && e.category !== opts.category) continue;
    const tier = q ? rankExercise(e, q) : 0;
    if (tier === null) continue;
    const { words, equip } = stripLeadingEquipment(tokenize(e.name));
    scored.push({ e, tier, equip: q ? equipPriority(equip) : 0, words: q ? words.length : 0 });
  }
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(b.e.owner_user_id !== null) - Number(a.e.owner_user_id !== null) ||
      a.equip - b.equip ||
      a.words - b.words ||
      a.e.name.length - b.e.name.length ||
      collator.compare(a.e.name, b.e.name) ||
      (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0),
  );
  const out = scored.map((s) => s.e);
  return opts.limit ? out.slice(0, opts.limit) : out;
}
