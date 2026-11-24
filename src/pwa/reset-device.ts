// ล้างสิ่งที่ผูกกับผู้ใช้ในเครื่องหลังออกจากระบบ/ลบบัญชีสำเร็จ (ADR 0006 ข้อ 5 ขั้น 2 · ADR 0004 ข้อ 8)
// ลำดับฝั่งไคลเอนต์: (1) signOut / DELETE /api/me สำเร็จ → (2) resetDeviceAfterSignOut → (3) location.replace("/welcome")
// R3: ลบฐาน IndexedDB ของคิวออฟไลน์ `fcf:v1:<user_id>` (คิว ส่งไม่ผ่าน ร่างเซสชัน snapshot) + ลืม user id ของเครื่อง
import { clearAuthHint, clearKnownDevice } from "./auth-hint";
import { clearUserCaches } from "./clear-caches";
import { clearOfflineUserId, deleteOfflineDb, getOfflineUserId } from "./offline-db";
import { USER_RESET_MESSAGE } from "./messages";

/** รอ SW ตอบรับไม่เกินเท่านี้ — SW ไม่ตอบ (ไม่มี/ค้าง) ต้องไม่ทำให้ออกจากระบบค้าง */
export const SW_RESET_TIMEOUT_MS = 1000;

type MessageTarget = Pick<ServiceWorker, "postMessage">;
type RegistrationLike = Partial<Pick<ServiceWorkerRegistration, "installing" | "waiting" | "active">>;

export interface ResetDeps {
  /** SW ทุกตัวของ registration (installing/waiting/active) — แต่ละตัวมีการดึงหน้าของตัวเอง */
  getRegistration?: () => Promise<RegistrationLike | undefined>;
  clearCaches?: () => Promise<unknown>;
  /** ลบฐานในเครื่องของผู้ใช้ (ค่าเริ่มต้น: deleteOfflineDb) */
  deleteDb?: (userId: string) => Promise<unknown>;
  timeoutMs?: number;
}

/** บอก SW หนึ่งตัวให้ทิ้งการดึงหน้าที่ค้าง (ยังใช้ cookie ของผู้ใช้เดิม) แล้วรอตอบรับหรือหมดเวลา */
function tellWorker(worker: MessageTarget, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        clearTimeout(timer);
        channel.port1.close();
        resolve();
      };
      worker.postMessage({ type: USER_RESET_MESSAGE }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function resetWorkers(deps: ResetDeps, timeoutMs: number): Promise<void> {
  try {
    const getRegistration =
      deps.getRegistration ??
      (typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? () => navigator.serviceWorker.getRegistration("/")
        : null);
    if (!getRegistration) return;
    const reg = await getRegistration();
    const workers = [reg?.installing, reg?.waiting, reg?.active].filter((w): w is ServiceWorker => Boolean(w));
    await Promise.all(workers.map((w) => tellWorker(w, timeoutMs)));
  } catch {
    // ไม่มี SW / getRegistration ล้ม — ล้าง cache ต่อได้เลย
  }
}

/**
 * เรียกหลังออกจากระบบหรือลบบัญชี**สำเร็จแล้ว**เท่านั้น · ไม่โยน error (ล้างได้เท่าที่ได้)
 * - บอก SW ให้ทิ้งการดึงหน้าที่ค้าง (กันหน้าที่ได้ด้วย cookie เดิมถูกเขียนกลับหลังล้าง)
 * - `clearUserCaches()`: หน้า HTML ที่ cache ไว้ + cache `user-*` (คง asset ที่มี hash)
 * - ล้าง hint `fcf:auth` · ลบบัญชี: ล้าง `fcf:known-device` ด้วย (กลับมาต้องใส่โค้ดเชิญใหม่)
 * - ลบฐาน IndexedDB `fcf:v1:<user_id>` ทั้งก้อน (userId ไม่ส่ง = ผู้ใช้ที่ลงทะเบียนไว้ใน offline-db) · ไม่ลบฐานของคนอื่นในเครื่อง
 * ผู้เรียกต้องถามผู้ใช้ก่อนถ้ายังมีค้างส่ง (UX 13.3 · `flushBeforeSignOut` ใน src/lib/offline)
 */
export async function resetDeviceAfterSignOut(opts: { accountDeleted: boolean; userId?: string }, deps: ResetDeps = {}): Promise<void> {
  const timeoutMs = deps.timeoutMs ?? SW_RESET_TIMEOUT_MS;
  // hint ล้างก่อน: ถ้าขั้นอื่นค้าง/ล้ม ตอนออฟไลน์ก็ไม่แสดงหน้าแอปแล้ว
  clearAuthHint();
  if (opts.accountDeleted) clearKnownDevice();
  const userId = opts.userId ?? getOfflineUserId();
  clearOfflineUserId();
  const dbDone = userId
    ? (deps.deleteDb ?? ((id: string) => deleteOfflineDb(id)))(userId).catch(() => {})
    : Promise.resolve();
  await resetWorkers(deps, timeoutMs);
  try {
    await (deps.clearCaches ?? (() => clearUserCaches()))();
  } catch {
    // Cache Storage ใช้ไม่ได้ — ไม่มีอะไรให้ล้าง
  }
  await dbDone;
}
