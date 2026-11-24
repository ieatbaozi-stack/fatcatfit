// เซิร์ฟเวอร์จำลองของ POST /api/sync/push + GET /api/bootstrap สำหรับ unit test ของคิว (ไม่ใช้ในแอป)
// ทำตามสัญญา ADR 0004 ข้อ 4: LWW ด้วย client_updated_at · ลบชนะ (tombstone) · ลบแถวที่ไม่มี = applied
// ลูกของพ่อแม่ที่ลบแล้ว = stale · พ่อแม่ไม่มี = parent_missing · ประมวลผลตามลำดับ แต่ละรายการอิสระ

import type { BootstrapResponse, PushResult } from "@/lib/data/shared/sync";

type Row = { entity: string; id: string; data: Record<string, unknown>; client_updated_at: string; deleted: boolean };

/** โหมดของคำขอถัดไป: ok · offline (fetch reject) · drop (ทำจริงแต่คำตอบหาย) · ตัวเลข = HTTP status (ไม่ทำอะไร) */
export type Mode = "ok" | "offline" | "drop" | number;

const PARENT: Record<string, [string, string] | undefined> = {
  session_exercise: ["session_id", "workout_session"],
  set_record: ["session_exercise_id", "session_exercise"],
  workout_session: ["place_id", "place"],
};

export function createMockServer() {
  const rows = new Map<string, Row>();
  const modes: Mode[] = [];
  const requests: { ops: { op_id: string; entity: string; id: string; action: string; data?: Record<string, unknown> }[] }[] = [];
  let reject: (op: { entity: string; id: string; action: string; data?: Record<string, unknown> }) => string | null = () => null;
  let bootstrapCalls = 0;

  const key = (e: string, id: string) => `${e}:${id}`;

  function applyOne(op: { op_id: string; entity: string; id: string; action: string; data?: Record<string, unknown>; client_updated_at: string }): PushResult {
    const code = reject(op);
    if (code) return { op_id: op.op_id, status: "rejected", code: code as PushResult["code"] };
    const k = key(op.entity, op.id);
    const cur = rows.get(k);
    if (op.action === "delete") {
      if (cur && !cur.deleted) {
        cur.deleted = true;
        // ลบเซสชัน/ท่าในเซสชัน → tombstone ลูก
        for (const r of rows.values()) {
          const p = PARENT[r.entity];
          if (p && p[1] === op.entity && r.data[p[0]] === op.id && !r.deleted) applyOne({ ...op, entity: r.entity, id: r.id });
        }
      }
      return { op_id: op.op_id, status: "applied" };
    }
    const p = PARENT[op.entity];
    if (p && p[1] !== "place") {
      const parent = rows.get(key(p[1], String(op.data?.[p[0]])));
      if (!parent) return { op_id: op.op_id, status: "rejected", code: "parent_missing" };
      if (parent.deleted) return { op_id: op.op_id, status: "stale" };
    }
    if (cur?.deleted) return { op_id: op.op_id, status: "stale" };
    if (cur && cur.client_updated_at > op.client_updated_at) return { op_id: op.op_id, status: "stale" };
    rows.set(k, { entity: op.entity, id: op.id, data: { ...(cur?.data ?? {}), ...(op.data ?? {}) }, client_updated_at: op.client_updated_at, deleted: false });
    return { op_id: op.op_id, status: "applied" };
  }

  const json = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/api/bootstrap")) {
      bootstrapCalls += 1;
      const mode = modes.length > 0 && modes[0] === "offline" ? modes.shift() : "ok";
      if (mode === "offline") throw new TypeError("Failed to fetch");
      const live = (e: string) => [...rows.values()].filter((r) => r.entity === e && !r.deleted);
      const body: BootstrapResponse = {
        profile: null,
        places: live("place").map((r) => ({ id: r.id, ...r.data }) as never),
        my_exercises: live("exercise").map((r) => ({ id: r.id, ...r.data }) as never),
        active_sessions: [],
        recent_sessions: [],
        exercise_summaries: [],
        catalog_version: "v1",
        server_time: new Date().toISOString(),
      } as BootstrapResponse;
      return json(200, body);
    }
    if (u.endsWith("/api/catalog")) return json(200, { catalog_version: "v1", exercises: [] });
    const mode = modes.shift() ?? "ok";
    if (mode === "offline") throw new TypeError("Failed to fetch");
    const body = JSON.parse(String(init?.body)) as { ops: Parameters<typeof applyOne>[0][] };
    requests.push({ ops: body.ops });
    if (typeof mode === "number") return json(mode, mode === 403 ? { code: "consent_required" } : mode === 409 ? { code: "upgrade_required" } : {});
    const results = body.ops.map(applyOne);
    if (mode === "drop") throw new TypeError("connection reset");
    return json(200, { results, server_time: new Date().toISOString() });
  }) as typeof globalThis.fetch;

  return {
    fetch,
    /** โหมดของคำขอถัดๆ ไป (ตามลำดับ) */
    next: (...m: Mode[]) => modes.push(...m),
    setReject: (fn: typeof reject) => {
      reject = fn;
    },
    /** จำนวนแถวที่ยังไม่ถูกลบของ entity */
    count: (entity: string) => [...rows.values()].filter((r) => r.entity === entity && !r.deleted).length,
    row: (entity: string, id: string) => rows.get(key(entity, id)),
    requests,
    get bootstrapCalls() {
      return bootstrapCalls;
    },
    /** ทุก op ที่เคยมาถึงเซิร์ฟเวอร์ */
    allOps: () => requests.flatMap((r) => r.ops),
  };
}
