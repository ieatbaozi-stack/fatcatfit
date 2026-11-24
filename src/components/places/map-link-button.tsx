"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { isValidMapUrl } from "@/lib/data/shared/map-link";

/**
 * ไอคอนหมุดท้ายแถวสถานที่ → เปิดลิงก์ Google Maps ในแท็บใหม่/แอป (CR3 D2/D3)
 * แสดงเฉพาะสถานที่ที่มี map_url และลิงก์ผ่านตัวตรวจ (กันค่าแปลกที่หลุดมาจากข้อมูล) · แอปไม่ส่งลิงก์ให้ใคร ไม่โหลดอะไรจาก Google
 */
export function MapLinkButton({ url, name }: { url: string | null; name: string }) {
  const t = useTranslations("places");
  if (!url || !isValidMapUrl(url)) return null;
  return (
    <a
      href={url.trim()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("openMap", { place: name })}
      className="grid size-11 flex-none place-items-center rounded-hand text-ink"
    >
      <Icon name="pin" size={24} />
    </a>
  );
}
