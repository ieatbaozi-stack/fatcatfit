import { sql, type AnyColumn } from "drizzle-orm";

// ที่เดียวที่อนุญาตให้ใช้ sql`...` ดิบ (ADR 0001) — ฟังก์ชันที่ builder ของ Drizzle ทำไม่ได้ให้เพิ่มที่นี่

/** คำสั่งเบาที่สุดสำหรับตรวจว่าฐานข้อมูลตอบ (ใช้กับ /api/health) */
export const selectOne = sql`select 1 as ok`;

/** `คอลัมน์ + 1` สำหรับตัวนับแบบ atomic (UPDATE ... SET count = count + 1) — builder ของ Drizzle ไม่มีตัวช่วยนี้ */
export const plusOne = (column: AnyColumn) => sql`${column} + 1`;
