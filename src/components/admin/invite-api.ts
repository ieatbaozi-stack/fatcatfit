// ตัวเรียก API แอดมินของหน้าออกโค้ดเชิญ (R1.5) — ไม่มี React · ไม่เขียน query เอง
// ทุกกรณีไม่ใช่แอดมิน/session หมด = 404 → ผู้เรียก reload หน้าให้เซิร์ฟเวอร์ตัดสิน (UX 11.7)
// ห้ามเก็บโค้ดที่ได้ในที่ใดนอกหน่วยความจำของหน้า (ไม่มี storage ใดๆ)

import { retryAfterSeconds } from "@/components/auth/api";
import type { AdminInviteInput } from "@/lib/data/shared/admin-invite";

type Fetcher = typeof fetch;

export type InviteStatus = "active" | "exhausted" | "expired" | "revoked";

export type InviteRow = {
  id: string;
  label: string;
  status: InviteStatus;
  usesCount: number;
  maxUses: number;
  expiresAt: string;
  createdAt: string;
};

export type CreatedInvite = { id: string; code: string; label: string; maxUses: number; expiresAt: string };

export type Fail = { ok: false; reason: "not_found" | "error" | "network" };

export type ListResult = { ok: true; invites: InviteRow[] } | Fail;
export type CreateResult = { ok: true; invite: CreatedInvite } | { ok: false; reason: "rate_limited"; retryAfterS: number } | Fail;
export type RevokeResult = { ok: true; result: "revoked" | "unchanged" } | Fail;

const STATUSES: readonly string[] = ["active", "exhausted", "expired", "revoked"];

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isRow(v: unknown): v is InviteRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.label === "string" &&
    typeof r.status === "string" &&
    STATUSES.includes(r.status) &&
    typeof r.usesCount === "number" &&
    typeof r.maxUses === "number" &&
    typeof r.expiresAt === "string"
  );
}

export async function listInvites(f: Fetcher = fetch): Promise<ListResult> {
  try {
    const res = await f("/api/admin/invites", { cache: "no-store", credentials: "same-origin" });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "error" };
    const body = await readJson(res);
    if (!Array.isArray(body.invites) || !body.invites.every(isRow)) return { ok: false, reason: "error" };
    return { ok: true, invites: body.invites };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function createInvite(input: AdminInviteInput, f: Fetcher = fetch): Promise<CreateResult> {
  try {
    const res = await f("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (res.status === 429) return { ok: false, reason: "rate_limited", retryAfterS: retryAfterSeconds(res) };
    if (res.status !== 201) return { ok: false, reason: "error" };
    const b = await readJson(res);
    if (
      typeof b.id !== "string" ||
      typeof b.code !== "string" ||
      typeof b.label !== "string" ||
      typeof b.maxUses !== "number" ||
      typeof b.expiresAt !== "string"
    ) {
      return { ok: false, reason: "error" };
    }
    return { ok: true, invite: { id: b.id, code: b.code, label: b.label, maxUses: b.maxUses, expiresAt: b.expiresAt } };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function revokeInvite(id: string, f: Fetcher = fetch): Promise<RevokeResult> {
  try {
    const res = await f(`/api/admin/invites/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin",
    });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "error" };
    const b = await readJson(res);
    return { ok: true, result: b.result === "unchanged" ? "unchanged" : "revoked" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** แยกไว้ให้เทสต์ mock ได้ (jsdom สั่ง location.reload ตรงๆ ไม่ได้) */
export function reloadPage(): void {
  window.location.reload();
}
