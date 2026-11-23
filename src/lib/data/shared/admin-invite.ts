import { z } from "zod";

// กติกาฟอร์มออกโค้ดเชิญของหน้าแอดมิน (ADR 0007 ข้อ 3 · D3) — ใช้ร่วมฝั่งไคลเอนต์ตรวจก่อนส่งและ API ตรวจจริง
// สคริปต์ `npm run invite` ใช้กติกาหลวมกว่านี้ตามเดิม

export const ADMIN_INVITE_DAYS = [1, 3, 7, 14] as const;
export const ADMIN_INVITE_LABEL_MAX = 40;
export const ADMIN_INVITE_MAX_USES_MAX = 10;

const label = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => [...s].length >= 1 && [...s].length <= ADMIN_INVITE_LABEL_MAX)
  // ห้ามอักขระควบคุม (Cc) อักขระจัดรูปแบบ (Cf เช่น bidi/zero-width/ZWJ) และตัวคั่นบรรทัด/ย่อหน้า (U+2028/2029)
  .refine((s) => !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s));

export const adminInviteInputSchema = z
  .object({
    label,
    days: z.number().refine((n) => (ADMIN_INVITE_DAYS as readonly number[]).includes(n)),
    maxUses: z.number().int().min(1).max(ADMIN_INVITE_MAX_USES_MAX),
  })
  .strict();

export type AdminInviteInput = z.infer<typeof adminInviteInputSchema>;
