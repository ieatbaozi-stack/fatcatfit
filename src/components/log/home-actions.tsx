"use client";
// ส่วนล่างของหน้าหลัก (UX 1–2): ชิปสถานที่ + ปุ่ม เริ่ม · ระหว่างมีเซสชันค้างแถบ "กำลังเล่น" แทนทั้งสองอย่าง (แถบอยู่ใน layout)
// เทมเพลต/ทำซ้ำครั้งก่อน/สัปดาห์นี้ เป็นงาน R4–R5 (ยังไม่มี)

import { PlaceChip } from "@/components/places/place-chip";
import { useLocalView } from "@/components/sync/use-offline";
import { ResumeGate } from "./resume-gate";
import { StartButton } from "./start-button";

export function HomeActions() {
  const view = useLocalView();
  const active = view.activeSession !== null;
  return (
    <div className="mt-auto flex w-full flex-col items-center gap-4 pt-10">
      {active ? null : (
        <>
          <PlaceChip />
          <StartButton />
        </>
      )}
      <ResumeGate />
    </div>
  );
}
