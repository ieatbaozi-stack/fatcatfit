// แถวของแผ่น "ส่งไม่ผ่าน" + ข้อความคัดลอก (UX 13.2) — ฟังก์ชันบริสุทธิ์ · ข้อความมาจาก messages ผ่านตัวแปลที่ผู้เรียกส่งมา
// ห้ามใส่ในข้อความคัดลอก: อีเมล ชื่อผู้ใช้ user id และ id ของแถว

import { isLoadMode, isTrackType } from "@/lib/data/shared/exercise-meta";
import type { RejectedGroup, RejectedReason } from "@/lib/offline/rejected";
import { EMPTY_SET_VALUES, type SetValues } from "@/lib/offline/session";
import { formatSetValues } from "@/components/log/set-logic";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

const REASON_KEY: Record<RejectedReason, string> = {
  invalid: "invalid",
  track_type_changed: "typeChanged",
  parent_missing: "parentMissing",
  id_conflict: "idConflict",
  exercise_has_history: "exerciseHasHistory",
  place_has_history: "placeHasHistory",
  bad_clock: "badClock",
  limit_reached: "limitReached",
  unknown: "idConflict",
};

export const reasonKey = (r: RejectedReason): string => `sync.reason.${REASON_KEY[r]}`;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOf = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** ค่าเซ็ตจาก data ที่ส่งขึ้นเซิร์ฟเวอร์ (รูปบนสาย) */
export function setValuesOf(data: Record<string, unknown> | null): SetValues {
  const d = data ?? {};
  const unit = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null);
  return {
    ...EMPTY_SET_VALUES,
    weight_input: num(d.weight_input),
    weight_unit: unit(d.weight_unit, ["kg", "lb"] as const),
    reps: num(d.reps),
    duration_s: num(d.duration_s),
    distance_input: num(d.distance_input),
    distance_unit: unit(d.distance_unit, ["km", "mi"] as const),
    speed_input: num(d.speed_input),
    speed_unit: unit(d.speed_unit, ["kmh", "mph"] as const),
    incline_pct: num(d.incline_pct),
  };
}

export type RejectedRow = { kind: string; title: string; /** ค่าที่จด/การกระทำ (ไม่มีวันเวลา) */ value: string; /** value + วันเวลาเครื่อง ไว้แสดงบรรทัด 2 */ detail: string; reason: string; code: string; at: string; childCount: number };

function formatWhen(ms: number | string, locale: string): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

const clock = (iso: unknown, locale: string): string => {
  const d = new Date(typeof iso === "string" ? iso : "");
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-nu-latn" : "en-GB", { timeStyle: "short" }).format(d);
};

function intentKey(g: RejectedGroup): string {
  const it = g.item;
  if (it.action === "delete") return "sync.action.delete";
  switch (it.display?.intent) {
    case "create":
      return "sync.action.create";
    case "archive":
      return "sync.action.archive";
    case "select":
      return "sync.action.select";
    case "delete":
      return "sync.action.delete";
    default:
      return "sync.action.update";
  }
}

/** แถวที่แสดง: บรรทัด 1 `ชนิด · ชื่อ` · บรรทัด 2 ค่า/การกระทำ + วันเวลา · บรรทัด 3 เหตุผล */
export function describeRejected(g: RejectedGroup, t: Translate, locale: string): RejectedRow {
  const it = g.item;
  const d = it.display ?? {};
  const data = it.data;
  const exName = locale === "th" && d.exercise_name_th ? d.exercise_name_th : (d.exercise_name ?? strOf(data?.name) ?? "");
  let kind = "";
  let title = "";
  let detail = "";
  switch (it.entity) {
    case "set_record": {
      kind = t("sync.entity.set");
      title = exName;
      if (it.action === "delete") detail = t("sync.action.delete");
      else if (d.track_type && isTrackType(d.track_type)) {
        const load = d.load_mode && isLoadMode(d.load_mode) ? d.load_mode : "external";
        detail = formatSetValues(d.track_type, load, setValuesOf(data), locale);
        if (data?.set_kind === "warmup") detail += ` · ${t("sync.warmup")}`;
      }
      break;
    }
    case "session_exercise":
      kind = t("sync.entity.sessionExercise");
      title = exName;
      detail = it.action === "delete" ? t("sync.action.delete") : t("sync.action.addToSession");
      break;
    case "workout_session": {
      kind = t("sync.entity.session");
      title = d.place_name ?? "";
      if (it.action === "delete") detail = t("sync.action.delete");
      else if (data?.ended_at) detail = t("sync.action.ended", { time: clock(data.ended_at, locale) });
      else detail = t("sync.action.started", { time: clock(data?.started_at, locale) });
      break;
    }
    case "exercise":
      kind = t("sync.entity.exercise");
      title = d.exercise_name ?? strOf(data?.name) ?? "";
      detail = it.action === "upsert" && data?.archived_at && d.intent !== "unarchive" ? t("sync.action.archive") : t(intentKey(g));
      break;
    case "place":
      kind = t("sync.entity.place");
      title = d.place_name ?? strOf(data?.name) ?? "";
      detail = it.action === "upsert" && data?.archived_at && d.intent !== "unarchive" ? t("sync.action.archive") : t(intentKey(g));
      break;
  }
  const when = formatWhen(it.client_updated_at, locale);
  return { kind, title, value: detail, detail: [detail, when].filter(Boolean).join(" · "), reason: t(reasonKey(g.reason)), code: it.code, at: when, childCount: g.children.length };
}

/** ข้อความคัดลอก (ภาษาตามแอป) — 1 แถวต่อ 3 บรรทัด คั่นด้วยบรรทัดว่าง */
export function copyText(groups: readonly RejectedGroup[], t: Translate, locale: string, version: string): string {
  const header = t("sync.rejected.copyHeader", { version });
  const blocks = groups.map((g) => {
    const r = describeRejected(g, t, locale);
    const line1 = [r.at, r.kind, r.title, r.value].filter(Boolean).join(" · ");
    return `${line1}\n${t("sync.rejected.reasonLabel")}: ${r.reason} (${r.code})`;
  });
  return [header, ...blocks].join("\n\n");
}
