// ร่างเซสชันที่เล่นอยู่ (ADR 0004 ข้อ 6 · contract D5) — ฟังก์ชันบริสุทธิ์: คืนร่างใหม่ + การเขียนที่ต้องเข้าคิว
// - ร่างเก็บใน store `active_session` ทุกครั้งที่เปลี่ยน (client.ts `applySessionChange`)
// - เข้าคิวเมื่อมีเซ็ตแรกถูกติ๊ก: session → session_exercise → set (ลำดับ seq = พ่อแม่ก่อนลูก)
// - ท่าที่ไม่มีเซ็ตติ๊กไม่ถูกส่ง · แถวแนะนำ (ยังไม่ติ๊ก) ไม่ออกนอกเครื่อง · เอาติ๊กออก = delete เซ็ต
// - จบโดยไม่มีเซ็ต = ทิ้งในเครื่อง · ทิ้งเซสชันที่ยังไม่เคยส่ง = คิวเอาออกหมด ไม่ส่งอะไร (กติกาสร้างแล้วลบ)
// - local_date/time_zone คำนวณครั้งเดียวตอนเริ่ม แล้วส่งค่าเดิมทุกครั้ง (เกณฑ์ 9)

import type { LoadMode, TrackType } from "@/lib/data/shared/exercise-meta";
import { localDateOf, SET_RANGES, type SetKind, type WireSession } from "@/lib/data/shared/workout";
import type { RestTimer, Stopwatch } from "./timer";
import type { OpDisplay, WriteIntent } from "./types";

export const ACTIVE_SESSION_VERSION = 1;
/** D5: ≤ 3 ชม. กลับหน้าจดเลย · > 3 ชม. ถาม · > 24 ชม. จบเอง */
export const RESUME_ASK_MS = 3 * 60 * 60 * 1000;
export const RESUME_AUTO_END_MS = 24 * 60 * 60 * 1000;

/** ช่องค่าของเซ็ตในรูปบนสาย (ไคลเอนต์ส่ง _input + _unit เท่านั้น) */
export type SetValues = {
  weight_input: number | null;
  weight_unit: "kg" | "lb" | null;
  reps: number | null;
  duration_s: number | null;
  distance_input: number | null;
  distance_unit: "km" | "mi" | null;
  speed_input: number | null;
  speed_unit: "kmh" | "mph" | null;
  incline_pct: number | null;
};

export const EMPTY_SET_VALUES: SetValues = {
  weight_input: null,
  weight_unit: null,
  reps: null,
  duration_s: null,
  distance_input: null,
  distance_unit: null,
  speed_input: null,
  speed_unit: null,
  incline_pct: null,
};

export type DraftSet = SetValues & {
  id: string;
  position: number;
  set_kind: SetKind;
  /** null = ยังไม่ติ๊ก (แถวแนะนำ) */
  completed_at: string | null;
  /** เข้าคิว (หรือมีบนเซิร์ฟเวอร์) แล้ว */
  queued: boolean;
};

export type DraftExercise = {
  id: string;
  exercise_id: string;
  position: number;
  exercise_name: string;
  exercise_name_th: string | null;
  track_type: TrackType;
  load_mode: LoadMode;
  queued: boolean;
  sets: DraftSet[];
};

export type ActiveSessionDraft = {
  v: 1;
  session: {
    id: string;
    place_id: string;
    place_name: string;
    started_at: string;
    local_date: string;
    time_zone: string;
  };
  queued: boolean;
  exercises: DraftExercise[];
  rest: RestTimer | null;
  /** ▶ ของเซ็ตที่กำลังจับเวลา */
  stopwatch: (Stopwatch & { exercise_row_id: string; set_id: string }) | null;
  /** epoch ms */
  updated_at: number;
};

/** การเขียนที่ client ต้องเอาเข้าคิว (client_updated_at ใส่ตอนเข้าคิว) */
export type SessionWrite = Omit<WriteIntent, "client_updated_at">;
export type SessionChange = { draft: ActiveSessionDraft | null; writes: SessionWrite[] };

const touch = (d: ActiveSessionDraft, now: number): ActiveSessionDraft => ({ ...d, updated_at: now });

/** เริ่มเซสชัน · timeZone = Intl ของเครื่องตอนนี้ (ไม่เปลี่ยนอีก) */
export function newSessionDraft(p: { id: string; placeId: string; placeName: string; now: number; timeZone?: string }): ActiveSessionDraft {
  const tz = p.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const startedAt = new Date(p.now).toISOString();
  return {
    v: ACTIVE_SESSION_VERSION,
    session: { id: p.id, place_id: p.placeId, place_name: p.placeName, started_at: startedAt, local_date: localDateOf(startedAt, tz) ?? startedAt.slice(0, 10), time_zone: tz },
    queued: false,
    exercises: [],
    rest: null,
    stopwatch: null,
    updated_at: p.now,
  };
}

// ---- ข้อมูลบนสาย ----

const sessionData = (d: ActiveSessionDraft, endedAt: string | null) => ({
  place_id: d.session.place_id,
  started_at: d.session.started_at,
  ended_at: endedAt,
  local_date: d.session.local_date,
  time_zone: d.session.time_zone,
});

const exDisplay = (e: DraftExercise): OpDisplay => ({
  exercise_id: e.exercise_id,
  exercise_name: e.exercise_name,
  exercise_name_th: e.exercise_name_th,
  track_type: e.track_type,
  load_mode: e.load_mode,
});

function setData(e: DraftExercise, s: DraftSet) {
  return {
    session_exercise_id: e.id,
    position: s.position,
    set_kind: s.set_kind,
    completed_at: s.completed_at,
    weight_input: s.weight_input,
    weight_unit: s.weight_input == null ? null : s.weight_unit,
    reps: s.reps,
    duration_s: s.duration_s,
    distance_input: s.distance_input,
    distance_unit: s.distance_input == null ? null : s.distance_unit,
    speed_input: s.speed_input,
    speed_unit: s.speed_input == null ? null : s.speed_unit,
    incline_pct: s.incline_pct,
  };
}

const upsert = (entity: SessionWrite["entity"], id: string, data: Record<string, unknown>, display?: OpDisplay, create = false): SessionWrite => ({
  entity,
  id,
  action: "upsert",
  data,
  ...(create ? { create: true } : {}),
  ...(display ? { display } : {}),
});
const del = (entity: SessionWrite["entity"], id: string, display?: OpDisplay): SessionWrite => ({
  entity,
  id,
  action: "delete",
  data: null,
  ...(display ? { display } : {}),
});

/** session + ท่า เข้าคิวถ้ายังไม่เคย (ก่อนเซ็ตแรก) */
function ensureParents(d: ActiveSessionDraft, e: DraftExercise): { d: ActiveSessionDraft; e: DraftExercise; writes: SessionWrite[] } {
  const writes: SessionWrite[] = [];
  let nd = d;
  if (!d.queued) {
    writes.push(upsert("workout_session", d.session.id, sessionData(d, null), { place_name: d.session.place_name }, true));
    nd = { ...nd, queued: true };
  }
  let ne = e;
  if (!e.queued) {
    writes.push(upsert("session_exercise", e.id, { session_id: d.session.id, exercise_id: e.exercise_id, position: e.position }, exDisplay(e), true));
    ne = { ...e, queued: true };
  }
  return { d: nd, e: ne, writes };
}

const replaceEx = (d: ActiveSessionDraft, e: DraftExercise): ActiveSessionDraft => ({
  ...d,
  exercises: d.exercises.map((x) => (x.id === e.id ? e : x)),
});

function findEx(d: ActiveSessionDraft, exRowId: string): DraftExercise {
  const e = d.exercises.find((x) => x.id === exRowId);
  if (!e) throw new Error("exercise row not in draft");
  return e;
}

// ---- การเปลี่ยนร่าง ----

/** เพิ่มท่า (ยังไม่ส่งจนกว่าจะมีเซ็ตติ๊ก) */
export function addExercise(
  d: ActiveSessionDraft,
  ex: Omit<DraftExercise, "position" | "queued" | "sets"> & { sets?: DraftSet[] },
  now: number,
): SessionChange {
  const position = d.exercises.reduce((m, x) => Math.max(m, x.position + 1), 0);
  const e: DraftExercise = { ...ex, position, queued: false, sets: ex.sets ?? [] };
  return { draft: touch({ ...d, exercises: [...d.exercises, e] }, now), writes: [] };
}

/** เพิ่มแถวเซ็ต (แถวแนะนำ ยังไม่ติ๊ก) */
export function addSet(d: ActiveSessionDraft, exRowId: string, s: { id: string; values: SetValues; set_kind?: SetKind }, now: number): SessionChange {
  const e = findEx(d, exRowId);
  const position = e.sets.reduce((m, x) => Math.max(m, x.position + 1), 0);
  const set: DraftSet = { ...s.values, id: s.id, position, set_kind: s.set_kind ?? "normal", completed_at: null, queued: false };
  return { draft: touch(replaceEx(d, { ...e, sets: [...e.sets, set] }), now), writes: [] };
}

/** แก้ค่า/ชนิดเซ็ต · ติ๊กแล้ว = upsert ใหม่ */
export function updateSet(d: ActiveSessionDraft, exRowId: string, setId: string, patch: Partial<SetValues> & { set_kind?: SetKind }, now: number): SessionChange {
  const e = findEx(d, exRowId);
  const sets = e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s));
  const ne = { ...e, sets };
  const s = sets.find((x) => x.id === setId);
  const writes = s && s.queued && s.completed_at ? [upsert("set_record", s.id, setData(ne, s), exDisplay(ne))] : [];
  return { draft: touch(replaceEx(d, ne), now), writes };
}

/** ✓ เซ็ต: ตั้ง completed_at แล้วเข้าคิว (พร้อมพ่อแม่ถ้ายังไม่เคย) */
export function checkSet(d: ActiveSessionDraft, exRowId: string, setId: string, now: number): SessionChange {
  const e0 = findEx(d, exRowId);
  const s0 = e0.sets.find((x) => x.id === setId);
  if (!s0) throw new Error("set not in draft");
  const { d: d1, e: e1, writes } = ensureParents(d, e0);
  const s1: DraftSet = { ...s0, completed_at: new Date(now).toISOString(), queued: true };
  const e2 = { ...e1, sets: e1.sets.map((x) => (x.id === setId ? s1 : x)) };
  writes.push(upsert("set_record", s1.id, setData(e2, s1), exDisplay(e2), !s0.queued));
  return { draft: touch(replaceEx(d1, e2), now), writes };
}

/** เอาติ๊กออก = delete เซ็ตนั้น (แถวยังอยู่ในร่างเป็นแถวแนะนำ ด้วย id ใหม่ — ลบชนะ id เดิมใช้ซ้ำไม่ได้) */
export function uncheckSet(d: ActiveSessionDraft, exRowId: string, setId: string, newSetId: string, now: number): SessionChange {
  const e = findEx(d, exRowId);
  const s = e.sets.find((x) => x.id === setId);
  if (!s) throw new Error("set not in draft");
  const writes = s.queued ? [del("set_record", s.id, exDisplay(e))] : [];
  const sets = e.sets.map((x) => (x.id === setId ? { ...x, id: s.queued ? newSetId : x.id, completed_at: null, queued: false } : x));
  return { draft: touch(replaceEx(d, { ...e, sets }), now), writes };
}

/** ลบแถวเซ็ต */
export function removeSet(d: ActiveSessionDraft, exRowId: string, setId: string, now: number): SessionChange {
  const e = findEx(d, exRowId);
  const s = e.sets.find((x) => x.id === setId);
  const writes = s?.queued ? [del("set_record", s.id, exDisplay(e))] : [];
  return { draft: touch(replaceEx(d, { ...e, sets: e.sets.filter((x) => x.id !== setId) }), now), writes };
}

/** ลบท่าออกจากเซสชัน (เซิร์ฟเวอร์ tombstone เซ็ตให้ · ยังไม่ส่ง = คิวเอาออกพร้อมเซ็ต) */
export function removeExercise(d: ActiveSessionDraft, exRowId: string, now: number): SessionChange {
  const e = findEx(d, exRowId);
  const writes = e.queued ? [del("session_exercise", e.id, exDisplay(e))] : [];
  return { draft: touch({ ...d, exercises: d.exercises.filter((x) => x.id !== exRowId) }, now), writes };
}

export const setRest = (d: ActiveSessionDraft, rest: RestTimer | null, now: number): SessionChange => ({ draft: touch({ ...d, rest }, now), writes: [] });
export const setStopwatch = (d: ActiveSessionDraft, stopwatch: ActiveSessionDraft["stopwatch"], now: number): SessionChange => ({
  draft: touch({ ...d, stopwatch }, now),
  writes: [],
});

/** เวลาเซ็ตสุดท้ายที่ติ๊ก (ISO) */
export function lastCompletedAt(d: ActiveSessionDraft): string | null {
  let last: string | null = null;
  for (const e of d.exercises) for (const s of e.sets) if (s.completed_at && (!last || s.completed_at > last)) last = s.completed_at;
  return last;
}

/** จบเซสชัน · ไม่มีเซ็ตเลย = ทิ้งในเครื่อง ไม่ส่งอะไร · endedAt ถูกจำกัดไม่เกิน started_at + 24 ชม. */
export function finishSession(d: ActiveSessionDraft, endedAtMs: number): SessionChange {
  if (!d.queued) return { draft: null, writes: [] };
  const start = Date.parse(d.session.started_at);
  const end = Math.min(Math.max(endedAtMs, start), start + SET_RANGES.sessionMaxMs);
  return { draft: null, writes: [upsert("workout_session", d.session.id, sessionData(d, new Date(end).toISOString()), { place_name: d.session.place_name })] };
}

/** ทิ้งเซสชัน (ยืนยันแล้ว) · ส่งแล้ว = delete (เซิร์ฟเวอร์ลบลูกให้) · ยังไม่ส่ง = คิวเอาออกทั้งหมด */
export function discardSession(d: ActiveSessionDraft): SessionChange {
  return { draft: null, writes: d.queued ? [del("workout_session", d.session.id, { place_name: d.session.place_name })] : [] };
}

export type ResumeDecision =
  /** ≤ 3 ชม. เปิดหน้าจดต่อ */
  | { kind: "resume" }
  /** > 3 ชม. ถาม "เล่นต่อ / จบที่เวลาเซ็ตสุดท้าย" · endAt = ค่าที่จะใช้ถ้าเลือกจบ */
  | { kind: "ask"; endAt: number | null }
  /** > 24 ชม. จบให้เองที่ endAt + toast · endAt null = ไม่มีเซ็ต ทิ้งเงียบ */
  | { kind: "auto_end"; endAt: number | null };

/** D5 · นับจากกิจกรรมล่าสุด (เซ็ตสุดท้าย หรือเวลาเริ่มถ้ายังไม่มีเซ็ต) */
export function resumeDecision(d: ActiveSessionDraft, now: number): ResumeDecision {
  const start = Date.parse(d.session.started_at);
  const lastIso = lastCompletedAt(d);
  const last = lastIso ? Date.parse(lastIso) : null;
  const endAt = last === null ? null : Math.min(last, start + SET_RANGES.sessionMaxMs);
  const idle = now - Math.max(last ?? start, start);
  if (now - start > RESUME_AUTO_END_MS || idle > RESUME_AUTO_END_MS) return { kind: "auto_end", endAt };
  if (idle > RESUME_ASK_MS) return { kind: "ask", endAt };
  return { kind: "resume" };
}

/** ร่างจากเซสชันที่ยังไม่จบบนเซิร์ฟเวอร์ (เล่นค้างจากอีกเครื่อง) — ทุกแถวถือว่าส่งแล้ว */
export function draftFromWire(ws: WireSession, now: number): ActiveSessionDraft {
  return {
    v: ACTIVE_SESSION_VERSION,
    session: { id: ws.id, place_id: ws.place_id, place_name: ws.place_name, started_at: ws.started_at, local_date: ws.local_date, time_zone: ws.time_zone },
    queued: true,
    exercises: [...ws.exercises]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        id: e.id,
        exercise_id: e.exercise_id,
        position: e.position,
        exercise_name: e.exercise_name,
        exercise_name_th: e.exercise_name_th,
        track_type: e.track_type as TrackType,
        load_mode: e.load_mode as LoadMode,
        queued: true,
        sets: [...e.sets]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            id: s.id,
            position: s.position,
            set_kind: s.set_kind,
            completed_at: s.completed_at,
            queued: true,
            weight_input: s.weight_input,
            weight_unit: s.weight_unit as SetValues["weight_unit"],
            reps: s.reps,
            duration_s: s.duration_s,
            distance_input: s.distance_input,
            distance_unit: s.distance_unit as SetValues["distance_unit"],
            speed_input: s.speed_input,
            speed_unit: s.speed_unit as SetValues["speed_unit"],
            incline_pct: s.incline_pct,
          })),
      })),
    rest: null,
    stopwatch: null,
    updated_at: now,
  };
}

/** หลังผู้ใช้ทิ้งรายการที่ส่งไม่ผ่าน: เอาแถวนั้น (และลูก) ออกจากร่างให้ตรงกับเซิร์ฟเวอร์ (UX 13.7 ง) */
export function dropRowsFromDraft(d: ActiveSessionDraft, rows: { entity: string; id: string }[]): ActiveSessionDraft | null {
  if (rows.some((r) => r.entity === "workout_session" && r.id === d.session.id)) return null;
  const exIds = new Set(rows.filter((r) => r.entity === "session_exercise").map((r) => r.id));
  const setIds = new Set(rows.filter((r) => r.entity === "set_record").map((r) => r.id));
  return {
    ...d,
    exercises: d.exercises.filter((e) => !exIds.has(e.id)).map((e) => ({ ...e, sets: e.sets.filter((s) => !setIds.has(s.id)) })),
  };
}

/** อ่านร่างจาก store อย่างทน (รุ่นไม่รู้จัก/รูปเสีย = null — ไม่ทับ ผู้เรียกตัดสิน) */
export function parseDraft(raw: unknown): ActiveSessionDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<ActiveSessionDraft>;
  if (d.v !== 1 || !d.session || typeof d.session.id !== "string" || !Array.isArray(d.exercises)) return null;
  return { rest: null, stopwatch: null, updated_at: 0, queued: false, ...d } as ActiveSessionDraft;
}
