"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TextField } from "@/components/ui/text-field";
import { MAP_URL_MAX, isValidMapUrl } from "@/lib/data/shared/map-link";

// ตัวอย่างรูปลิงก์ที่ได้จากปุ่มแชร์ (ไม่ใช่ข้อความที่แปล)
const MAP_PLACEHOLDER = "https://maps.app.goo.gl/…";

/** ว่าง = ไม่ใส่ลิงก์ (ใช้ได้) · ไม่ว่างต้องเป็นลิงก์ Google Maps ที่ตัวตรวจฝั่งเซิร์ฟเวอร์รับ (ตัวเดียวกัน) */
export const mapUrlOk = (value: string): boolean => value.trim() === "" || isValidMapUrl(value);

/**
 * ช่อง "ลิงก์ Google Maps" (ไม่บังคับ · CR3 D1): ตรวจด้วย isValidMapUrl · ข้อความผิดขึ้นใต้ช่องหลังออกจากช่อง
 * (ไม่ขึ้นระหว่างพิมพ์ครึ่งทาง) · คำแนะนำ "คัดลอกจากปุ่มแชร์ใน Google Maps" ใต้ช่องเมื่อไม่ผิด
 */
export function MapUrlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("places");
  const [touched, setTouched] = useState(false);
  const bad = !mapUrlOk(value);
  return (
    <TextField
      label={t("mapUrl")}
      value={value}
      inputMode="url"
      autoComplete="off"
      autoCapitalize="none"
      spellCheck={false}
      maxLength={MAP_URL_MAX + 100}
      placeholder={MAP_PLACEHOLDER}
      hint={t("mapUrlHint")}
      error={touched && bad ? t("mapUrlInvalid") : null}
      onBlur={() => setTouched(true)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
