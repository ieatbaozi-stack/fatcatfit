"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SyncBar } from "@/components/sync/sync-bar";
import { Button } from "@/components/ui/button";
import { closeOffline, initOffline, resumeOfflineFromDevice } from "@/lib/offline/client";
import { StatusScreen } from "@/components/ui/status-screen";
import { fetchMe, type MeData, type MeFetch } from "./api";
import { decideRoute, type MeResult, type ScreenKind } from "./decide-route";
import { applyHintOp, getAuthHint } from "./gate-hint";
import { OfflineBar, OfflineSignIn } from "./offline-sign-in";
import { useNet } from "./use-net";

type GateValue = {
  /** ข้อมูลผู้ใช้จาก /api/me (null จนกว่าจะโหลดเสร็จ · มาจากไคลเอนต์เท่านั้น ไม่อยู่ใน HTML) */
  me: MeData | null;
  /** ถาม /api/me ไม่สำเร็จเพราะเครือข่าย (fetch ล้ม) — ต่างจาก "ยังไม่ตอบ" (me เป็น null ทั้งคู่) */
  networkFailed?: boolean;
  /** ถาม /api/me ใหม่ (เช่นหลังบันทึกยินยอม) แล้วให้ตารางตัดสินพาไปจอถัดไปเอง */
  refresh: () => Promise<void>;
};

const GateContext = createContext<GateValue>({ me: null, refresh: async () => {} });

export function useMe(): GateValue {
  return useContext(GateContext);
}

function toResult(r: MeFetch | null): MeResult {
  if (r === null) return { status: "pending" };
  if (r.status === "ok") return { status: "ok", state: r.me.state };
  if (r.status === "unauthorized") return { status: "unauthorized" };
  return { status: "error" };
}

/**
 * ด่านฝั่งไคลเอนต์ (ADR 0006 ข้อ 2–3) — รับ kind เป็น prop จาก layout (ไม่ใช้ path ตัดสินว่าเป็นจออะไร
 * ยกเว้น "setup" ที่ต้องรู้ว่าอยู่ /consent หรือ /onboarding)
 * ตัดสินด้วย decideRoute · ไปจอใหม่ด้วย router.replace เฉพาะตอนออนไลน์และได้ผลชี้ขาด
 */
export function AuthGate({ kind, children }: { kind: ScreenKind; children: ReactNode }) {
  const t = useTranslations("error");
  const router = useRouter();
  const pathname = usePathname();
  const net = useNet();
  const [result, setResult] = useState<MeFetch | null>(null);
  const [networkFailed, setNetworkFailed] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const r = await fetchMe();
    if (!alive.current) return;
    // fetch ล้ม (โยน error) = ถือว่าออฟไลน์ ไม่เปลี่ยนหน้า (ADR 0006)
    setNetworkFailed(r.status === "network");
    if (r.status !== "network") setResult(r);
    // R3a: ล็อกอินพร้อมใช้ (ยินยอมแล้ว) → เปิดฐานในเครื่องของผู้ใช้นี้ (ส่งคิว + ดึง snapshot) · 401/ยังไม่พร้อม → ปิด engine ทันที (ไม่ลบฐาน) · เน็ตหลุดที่มี hint ready → เปิดฐานอ่าน/เขียนออฟไลน์ (ไม่ส่งจนกว่าจะยืนยันตัวตน)
    if (kind === "app") {
      if (r.status === "ok" && r.me.state === "ready") void initOffline(r.me.user.id);
      else if (r.status === "unauthorized" || r.status === "ok") closeOffline();
      else if (r.status === "network" && getAuthHint() === "ready") void resumeOfflineFromDevice();
    }
  }, [kind]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // เปิดแอปตอนออฟไลน์ตั้งแต่ต้น (ไม่ถาม /api/me) → เปิดฐานของผู้ใช้ที่จำไว้ เฉพาะเมื่อ hint ยืนยันว่าเคยพร้อมใช้
  useEffect(() => {
    if (net === "offline" && kind === "app" && getAuthHint() === "ready") void resumeOfflineFromDevice();
  }, [net, kind]);

  // เปิดหน้า + กลับมาออนไลน์ → ถามสถานะจริง
  useEffect(() => {
    // ดึงข้อมูลจากภายนอกตอนเปิดหน้า/กลับมาออนไลน์ — setState เกิดหลังคำตอบ ไม่ใช่ตอน render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (net === "online") void load();
  }, [net, load]);

  const effectiveNet = net === "offline" || networkFailed ? "offline" : "online";
  const decision = useMemo(
    () => decideRoute(kind, effectiveNet, toResult(result), getAuthHint(), pathname),
    // hint อ่านสดทุกครั้งที่คำนวณ (localStorage) — คำนวณใหม่เมื่อผลหรือเครือข่ายเปลี่ยน
    [kind, effectiveNet, result, pathname],
  );

  useEffect(() => {
    if (decision.action === "go" || decision.action === "stay") applyHintOp(decision.hint);
    if (decision.action === "go") router.replace(decision.to);
  }, [decision, router]);

  const value = useMemo<GateValue>(
    () => ({ me: result?.status === "ok" ? result.me : null, networkFailed, refresh: load }),
    [result, networkFailed, load],
  );

  if (decision.action === "offline-welcome") return <OfflineSignIn />;
  if (decision.action === "error") {
    return (
      <StatusScreen pose="confused" title={t("text")}>
        <Button onClick={() => void load()}>{t("retry")}</Button>
      </StatusScreen>
    );
  }
  // แถบ "เน็ตหลุด" ตัวเดียวทั้งแอป (ไม่มีแมว) — /welcome ใช้จอ OfflineSignIn แทน
  const showBar = decision.action === "stay" && decision.offline === true && kind !== "public";
  let statusBar: ReactNode = null;
  if (kind === "app") statusBar = <SyncBar offline={showBar} />;
  else if (showBar) statusBar = <OfflineBar />;
  return (
    <GateContext.Provider value={value}>
      {statusBar}
      {children}
    </GateContext.Provider>
  );
}
