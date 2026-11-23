// ตัวเรียก API ของคลังท่า/สถานที่ (R2) — ไม่มี React · ไม่เขียน query เอง ทุกอย่างผ่าน /api/**
// R2 ออนไลน์อย่างเดียว: fetch โยน error = "network" · 401/403 = "auth" (จอแสดงเป็นโหลดไม่ได้ · AuthGate พาไปจอที่ถูกเมื่อถาม /api/me รอบถัดไป)

import type { BootstrapResponse, CatalogResponse, PushRejectCode, PushResponse } from "@/lib/data/shared/sync";
import { PUSH_VERSION } from "@/lib/data/shared/sync";

type Fetcher = typeof fetch;

export type FailReason = "auth" | "error" | "network";
export type Fail = { ok: false; reason: FailReason };

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function failOf(status: number): Fail {
  return { ok: false, reason: status === 401 || status === 403 ? "auth" : "error" };
}

async function getJson<T>(url: string, valid: (v: unknown) => v is T, f: Fetcher): Promise<{ ok: true; data: T } | Fail> {
  try {
    // ไม่ตั้ง cache: ให้เบราว์เซอร์ส่ง If-None-Match เองจาก ETag ของ /api/catalog (304 → ใช้ของเดิม)
    const res = await f(url, { credentials: "same-origin" });
    if (!res.ok) return failOf(res.status);
    const body = await readJson(res);
    return valid(body) ? { ok: true, data: body } : { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

const isCatalog = (v: unknown): v is CatalogResponse =>
  typeof v === "object" && v !== null && typeof (v as CatalogResponse).catalog_version === "string" && Array.isArray((v as CatalogResponse).exercises);

const isBootstrap = (v: unknown): v is BootstrapResponse =>
  typeof v === "object" &&
  v !== null &&
  Array.isArray((v as BootstrapResponse).places) &&
  Array.isArray((v as BootstrapResponse).my_exercises);

export const fetchCatalog = (f: Fetcher = fetch) => getJson("/api/catalog", isCatalog, f);
export const fetchBootstrap = (f: Fetcher = fetch) => getJson("/api/bootstrap", isBootstrap, f);

// ---- push ----

export type PushOpInput = {
  entity: "place" | "exercise";
  id: string;
  action: "upsert" | "delete";
  data?: Record<string, unknown>;
};

export type PushOutcome =
  | { kind: "applied" }
  | { kind: "stale" }
  | { kind: "rejected"; code: PushRejectCode | "unknown" }
  | { kind: "auth" }
  | { kind: "error" }
  | { kind: "network" };

/** ส่งการเขียน 1 รายการ (R2 เรียกตรงตอนออนไลน์ ยังไม่มีคิว) · ส่งซ้ำด้วย op_id/id เดิมได้ผลเท่าเดิม */
export async function pushOne(input: PushOpInput, f: Fetcher = fetch, now: () => Date = () => new Date()): Promise<PushOutcome> {
  const op = {
    op_id: crypto.randomUUID(),
    entity: input.entity,
    id: input.id,
    action: input.action,
    ...(input.data ? { data: input.data } : {}),
    client_updated_at: now().toISOString(),
  };
  try {
    const res = await f("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v: PUSH_VERSION, ops: [op] }),
      credentials: "same-origin",
    });
    if (res.status === 401 || res.status === 403) return { kind: "auth" };
    if (!res.ok) return { kind: "error" };
    const body = (await readJson(res)) as Partial<PushResponse> | null;
    const r = body?.results?.[0];
    if (!r) return { kind: "error" };
    if (r.status === "applied") return { kind: "applied" };
    if (r.status === "stale") return { kind: "stale" };
    return { kind: "rejected", code: r.code ?? "unknown" };
  } catch {
    return { kind: "network" };
  }
}
