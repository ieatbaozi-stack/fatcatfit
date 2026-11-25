// ค่าคงที่การแปลงหน่วย (ADR 0003 ข้อ 1) — ที่เดียว ใช้ร่วมไคลเอนต์/เซิร์ฟเวอร์
// เก็บค่ามาตรฐาน (kg / เมตร) เต็มความละเอียด คู่กับตัวเลขที่ผู้ใช้พิมพ์ + หน่วย

export const KG_PER_LB = 0.45359237;
export const M_PER_IN = 0.0254;

export type WeightUnit = "kg" | "lb";
export type HeightUnit = "cm" | "in";

export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}

export function heightToMeters(value: number, unit: HeightUnit): number {
  return unit === "cm" ? value / 100 : value * M_PER_IN;
}

// ---- R3: ระยะ / ความเร็ว (ADR 0003 ข้อ 1) ----
export const M_PER_KM = 1000;
export const M_PER_MI = 1609.344;
export const MPS_PER_MPH = 0.44704;
export const MPS_PER_KMH = 1 / 3.6;

export type DistanceUnit = "km" | "mi";
export type SpeedUnit = "kmh" | "mph";

export function distanceToMeters(value: number, unit: DistanceUnit): number {
  return unit === "km" ? value * M_PER_KM : value * M_PER_MI;
}

export function speedToMps(value: number, unit: SpeedUnit): number {
  return unit === "kmh" ? value * MPS_PER_KMH : value * MPS_PER_MPH;
}
