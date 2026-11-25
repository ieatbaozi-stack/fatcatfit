// เตือนพักครบ (UX 7 · ของแถม): สั่น (Android) + เสียงสั้นถ้าแอปเปิดอยู่ · iOS ปลดล็อกเสียงได้หลังผู้ใช้แตะครั้งแรก (แตะ ✓)
// ไม่มีเสียง/ไม่มีสั่นก็ยังใช้ได้ — ตัวเลขเปลี่ยนเป็น "ไปต่อ" เสมอ

import { tryVibrate } from "@/lib/offline/timer";

type AudioCtor = new () => AudioContext;
let ctx: AudioContext | null = null;

/** เรียกในตัวจัดการแตะ (✓) เพื่อให้เบราว์เซอร์อนุญาตเสียงภายหลัง */
export function unlockAudio(): void {
  try {
    const AC = (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }).AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    void ctx.resume();
  } catch {
    // ไม่มีเสียงก็ไม่เป็นไร
  }
}

function beep(): void {
  try {
    if (!ctx || ctx.state !== "running") return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    // เงียบ
  }
}

/** พักครบ: สั่น + เสียงสั้น (feature-detect ทั้งคู่) */
export function alertRestDone(): void {
  tryVibrate();
  beep();
}
