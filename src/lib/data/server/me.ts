import "server-only";
import { eq } from "drizzle-orm";
import { consentRecord, profile } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { hasCurrentConsent } from "@/lib/auth/consent";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";

// GET /api/me (ADR 0006 ข้อ 3) — สถานะของผู้ใช้ปัจจุบันเท่านั้น (กรองด้วย userId ที่ได้จาก requireUser)

export type MeState = "consent_required" | "onboarding_required" | "ready";

export type MeResponse = {
  state: MeState;
  noticeVersion: string;
  user: { id: string; email: string; name: string };
  consent: { accepted: boolean; acceptedAt: string | null };
  profile: null | {
    locale: "th" | "en";
    weightUnit: string;
    lengthUnit: string;
    distanceUnit: string;
    theme: string;
    restSeconds: number;
    birthYear: number;
    height: { value: number; unit: string };
    goals: string[];
    experience: string | null;
  };
};

function parseGoals(text: string): string[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getMe(db: AppDb, u: { userId: string; email: string; name: string }): Promise<MeResponse> {
  const accepted = await hasCurrentConsent(db, u.userId);
  const [consentRow] = accepted
    ? await db
        .select({ acceptedAt: consentRecord.acceptedAt })
        .from(consentRecord)
        .where(eq(consentRecord.userId, u.userId))
        .limit(1)
    : [];
  const [p] = await db.select().from(profile).where(eq(profile.userId, u.userId)).limit(1);
  const state: MeState = !accepted ? "consent_required" : !p ? "onboarding_required" : "ready";
  return {
    state,
    noticeVersion: PRIVACY_NOTICE_VERSION,
    user: { id: u.userId, email: u.email, name: u.name },
    consent: { accepted, acceptedAt: consentRow ? consentRow.acceptedAt.toISOString() : null },
    profile: p
      ? {
          locale: p.locale as "th" | "en",
          weightUnit: p.weightUnit,
          lengthUnit: p.lengthUnit,
          distanceUnit: p.distanceUnit,
          theme: p.theme,
          restSeconds: p.restSeconds,
          birthYear: p.birthYear,
          height: { value: p.heightInput, unit: p.heightUnit },
          goals: parseGoals(p.goals),
          experience: p.experience,
        }
      : null,
  };
}
