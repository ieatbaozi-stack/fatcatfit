// ร่างชื่อไทยและคำค้นของแถวใหม่จากพจนานุกรม (R2 · contract D3) — ฟังก์ชันบริสุทธิ์ ไม่มี I/O
import { ENGLISH_ABBREVIATIONS, EXTRA_SEARCH_TERMS, NAME_TH_OVERRIDES, PHRASES, TOKENS } from "./seed-glossary";

const SEGMENT_SPLIT = /\s+-\s+|\s*\(|\)\s*|,\s*/;

export type Composed = { text: string; missing: string[] };

function composeSegment(segment: string, altIndex: number, missing: string[]): string {
  const words = segment.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  let out = "";
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let len = Math.min(5, words.length - i); len >= 2; len--) {
      const phrase = words.slice(i, i + len).join(" ");
      const th = PHRASES[phrase];
      if (th !== undefined) {
        out += th;
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const w = words[i]!;
    const phrase1 = PHRASES[w];
    if (phrase1 !== undefined) out += phrase1;
    else {
      const entry = TOKENS[w];
      if (!entry) {
        missing.push(w);
        out += `?${w}?`;
      } else out += entry[altIndex] ?? entry[0];
    }
    i++;
  }
  return out;
}

/** altIndex 0 = สะกดหลัก · 1,2 = สะกดอื่นของแต่ละคำ (ถ้ามี) */
export function composeNameTh(name: string, altIndex = 0): Composed {
  const missing: string[] = [];
  if (altIndex === 0 && NAME_TH_OVERRIDES[name]) return { text: NAME_TH_OVERRIDES[name], missing };
  const text = name
    .split(SEGMENT_SPLIT)
    .filter((s) => s.trim())
    .map((s) => composeSegment(s, altIndex, missing))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, missing };
}

/** สะกดทับศัพท์อีกแบบที่คนพิมพ์จริง (แทนที่ในชื่อไทยสำเร็จรูป ไม่แปลคำใหม่ — กันคำค้นแปลตรงตัว) */
const SPELLING_ALTS: [string, string][] = [
  ["สควอท", "สควอต"], ["เดดลิฟต์", "เดดลิฟท์"], ["ลิฟต์", "ลิฟท์"], ["เคิร์ล", "เคิล"], ["โรว์", "โรว"], ["เพรส", "เพลส"],
  ["เบนช์", "เบนซ์"], ["บาร์เบล", "บาร์เบลล์"], ["ดัมเบล", "ดัมเบลล์"], ["เคทเทิลเบล", "เคตเทิลเบล"], ["ลันจ์", "ลังจ์"],
  ["แพลงก์", "แพลงค์"], ["พูลดาวน์", "พูลดาว"], ["เรส", "เรซ"], ["ชรัก", "ชรัค"], ["สเตรทช์", "สเตรช"],
];
export function spellingVariant(nameTh: string): string {
  let out = nameTh;
  for (const [a, b] of SPELLING_ALTS) out = out.split(a).join(b);
  return out;
}

/** คำค้นของแถว: สะกดทับศัพท์อีกแบบ + ตัวย่ออังกฤษ + คำพูดสามัญ (ไม่รวมชื่อหลัก · ไม่ซ้ำ) */
export function buildSearchTerms(name: string, nameTh: string): string[] {
  const terms: string[] = [];
  const add = (t: string | undefined) => {
    const v = t?.trim();
    if (!v || v === nameTh || v.toLowerCase() === name.toLowerCase() || terms.includes(v) || v.includes("|") || [...v].length > 60) return;
    terms.push(v);
  };
  for (const t of EXTRA_SEARCH_TERMS[name] ?? []) add(t);
  add(spellingVariant(nameTh));
  const abbr = name.replace(/\b(barbell|dumbbell|kettlebell)s?\b/gi, (m) => ENGLISH_ABBREVIATIONS[m.toLowerCase().replace(/s$/, "")] ?? m);
  if (abbr !== name) add(abbr.toLowerCase());
  return terms.slice(0, 6);
}
