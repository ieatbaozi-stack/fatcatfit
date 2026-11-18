import "server-only";
import { and, eq } from "drizzle-orm";
import { bodyEntry, place, profile } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { HttpError } from "@/lib/data/shared/http-error";
import { validateOnboarding } from "@/lib/data/shared/onboarding";

// POST /api/onboarding — profile + place แรก + body_entry แรก ใน transaction เดียว
// ส่งซ้ำด้วย id ชุดเดิม = สำเร็จโดยไม่เกิดแถวใหม่ · ส่งใหม่ด้วย id อื่นหลังกรอกแล้ว = 409 already_onboarded

export async function submitOnboarding(
  db: AppDb,
  userId: string,
  body: unknown,
  now: Date,
): Promise<{ replay: boolean }> {
  const v = validateOnboarding(body, now);
  if (!v.ok) throw new HttpError(400, "invalid_input", { fields: v.fields });
  const d = v.data;
  const clientUpdatedAt = d.clientUpdatedAt ? new Date(d.clientUpdatedAt) : now;

  return db.transaction(async (tx) => {
    const created = await tx
      .insert(profile)
      .values({
        userId,
        locale: d.profile.locale,
        weightUnit: d.profile.weightUnit,
        lengthUnit: d.profile.lengthUnit,
        distanceUnit: d.profile.distanceUnit,
        theme: "system",
        restSeconds: 90,
        birthYear: d.profile.birthYear,
        heightM: v.heightM,
        heightInput: d.profile.height.value,
        heightUnit: d.profile.height.unit,
        goals: JSON.stringify(d.profile.goals),
        experience: d.profile.experience ?? null,
        onboardedAt: now,
        createdAt: now,
        updatedAt: now,
        clientUpdatedAt,
      })
      .onConflictDoNothing()
      .returning({ userId: profile.userId });

    if (created.length === 0) {
      // กรอกแล้ว: ถือเป็นการส่งซ้ำก็ต่อเมื่อ id ของสถานที่และน้ำหนักตรงกับที่เคยบันทึกของผู้ใช้คนนี้
      const [pl] = await tx
        .select({ id: place.id })
        .from(place)
        .where(and(eq(place.id, d.place.id), eq(place.userId, userId)));
      const [be] = await tx
        .select({ id: bodyEntry.id })
        .from(bodyEntry)
        .where(and(eq(bodyEntry.id, d.bodyEntry.id), eq(bodyEntry.userId, userId)));
      if (pl && be) return { replay: true };
      throw new HttpError(409, "already_onboarded");
    }

    const placeRows = await tx
      .insert(place)
      .values({ id: d.place.id, userId, name: d.place.name, createdAt: now, updatedAt: now, clientUpdatedAt })
      .onConflictDoNothing()
      .returning({ id: place.id });
    const bodyRows = placeRows.length
      ? await tx
          .insert(bodyEntry)
          .values({
            id: d.bodyEntry.id,
            userId,
            measuredAt: new Date(d.bodyEntry.measuredAt),
            localDate: d.bodyEntry.localDate,
            weightKg: v.weightKg,
            weightInput: d.bodyEntry.weight.value,
            weightUnit: d.bodyEntry.weight.unit,
            createdAt: now,
            updatedAt: now,
            clientUpdatedAt,
          })
          .onConflictDoNothing()
          .returning({ id: bodyEntry.id })
      : [];
    // id ชนกับแถวของผู้ใช้อื่น — ยกเลิกทั้ง transaction โดยไม่บอกว่าเป็นของใคร
    if (placeRows.length === 0 || bodyRows.length === 0) throw new HttpError(409, "id_conflict");
    return { replay: false };
  });
}
