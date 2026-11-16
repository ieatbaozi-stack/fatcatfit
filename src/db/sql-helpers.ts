import { sql } from "drizzle-orm";

// ที่เดียวที่อนุญาตให้ใช้ sql`...` ดิบ (ADR 0001) — ฟังก์ชันที่ builder ของ Drizzle ทำไม่ได้ให้เพิ่มที่นี่

/** คำสั่งเบาที่สุดสำหรับตรวจว่าฐานข้อมูลตอบ (ใช้กับ /api/health) */
export const selectOne = sql`select 1 as ok`;
