// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";
import { renderWithIntl } from "../test-utils";
import { AccountSection } from "./account-section";
import { ConsentScreen } from "./consent-screen";

const reset = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/pwa/reset-device", () => ({ resetDeviceAfterSignOut: reset }));
// ผู้ใช้ใหม่ที่ยืนยันแล้ว (โหลด me สำเร็จ profile = null) — ไม่ใช่ "ยังไม่รู้"
const gate = vi.hoisted(() => ({ me: null as unknown }));
vi.mock("./auth-gate", async (orig) => ({
  ...(await orig<typeof import("./auth-gate")>()),
  useMe: () => ({ me: gate.me, refresh: async () => {} }),
}));

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  replace = vi.fn();
  reset.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { ...window.location, replace });
});
afterEach(() => {
  gate.me = null;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ConsentScreen", () => {
  beforeEach(() => {
    gate.me = { state: "consent_required", profile: null };
  });

  it("ช่องติ๊กไม่ติ๊กไว้ก่อน · ปุ่มปิดจนกว่าจะติ๊ก · บอกว่าถอน = ลบบัญชี · มีลิงก์ประกาศ", () => {
    renderWithIntl(<ConsentScreen />);
    const [ageBox, box] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(ageBox.checked).toBe(false);
    const agree = screen.getByRole("button", { name: th.consent.agree }) as HTMLButtonElement;
    expect(box.checked).toBe(false);
    expect(agree.disabled).toBe(true);
    expect(document.body.textContent).toContain(th.consent.withdraw);
    expect(screen.getByRole("link", { name: th.consent.readFull.replace("{version}", PRIVACY_NOTICE_VERSION) }).getAttribute("href")).toBe("/privacy");
    fireEvent.click(box);
    expect(agree.disabled).toBe(true); // ติ๊กยินยอมอย่างเดียวยังไม่พอ ต้องยืนยันอายุด้วย
    fireEvent.click(ageBox);
    expect(agree.disabled).toBe(false);
  });

  it("กดยินยอม ส่งเวอร์ชันประกาศ + ภาษา", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    renderWithIntl(<ConsentScreen />, "en");
    for (const b of screen.getAllByRole("checkbox")) fireEvent.click(b);
    fireEvent.click(screen.getByRole("button", { name: en.consent.agree }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.find((c) => c[0] === "/api/consent")).toBeTruthy();
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ noticeVersion: PRIVACY_NOTICE_VERSION, locale: "en" });
  });

  it("บันทึกไม่ได้ → ข้อความ + ปุ่มลองใหม่", async () => {
    fetchMock.mockResolvedValue(json(500));
    renderWithIntl(<ConsentScreen />);
    for (const b of screen.getAllByRole("checkbox")) fireEvent.click(b);
    fireEvent.click(screen.getByRole("button", { name: th.consent.agree }));
    expect((await screen.findByRole("alert")).textContent).toBe(th.consent.saveFailed);
    expect(screen.getByRole("button", { name: th.consent.retry })).toBeTruthy();
  });

  it("ไม่ยินยอม: ถามยืนยันก่อน แล้ว DELETE /api/me → /welcome", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(th.consent.declineTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: th.consent.declineConfirm }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
    expect(fetchMock).toHaveBeenCalledWith("/api/me", expect.objectContaining({ method: "DELETE" }));
    expect(reset).toHaveBeenCalledWith({ accountDeleted: true });
  });

  it("ออฟไลน์: ปุ่มยินยอมปิดแม้ติ๊กแล้ว", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderWithIntl(<ConsentScreen />);
    for (const b of screen.getAllByRole("checkbox")) fireEvent.click(b);
    expect((screen.getByRole("button", { name: th.consent.agree }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AccountSection", () => {
  it("แถวส่งออกปิด · ลิงก์ประกาศ · ออกจากระบบไม่ถามยืนยัน → POST sign-out → /welcome", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true }));
    renderWithIntl(<AccountSection />);
    expect(screen.getByRole("link", { name: th.account.privacy }).getAttribute("href")).toBe("/privacy");
    expect(document.body.textContent).toContain(th.account.exportSoon);
    expect(screen.queryByRole("button", { name: th.account.export })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: th.account.signOut }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/sign-out");
    expect(reset).toHaveBeenCalledWith({ accountDeleted: false });
  });

  it("ออกจากระบบล้มเหลว: ข้อความ ไม่ไปไหน", async () => {
    fetchMock.mockResolvedValue(json(500));
    renderWithIntl(<AccountSection />);
    fireEvent.click(screen.getByRole("button", { name: th.account.signOut }));
    expect((await screen.findByRole("alert")).textContent).toBe(th.account.signOutFailed);
    expect(replace).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled(); // ล้มแล้วหยุด ไม่ล้างอะไร
  });

  it("ลบบัญชี: ต้องติ๊กก่อน · กำลังลบกดซ้ำไม่ได้ · สำเร็จเห็นจอลบเรียบร้อย แล้ว 'กลับหน้าแรก' = /welcome", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (finish = r)));
    renderWithIntl(<AccountSection />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(th.account.delete) }));
    const confirm = screen.getByRole("button", { name: th.account.deleteScreen.confirm }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    for (const b of screen.getAllByRole("checkbox")) fireEvent.click(b);
    fireEvent.click(confirm);
    const busy = await screen.findByRole("button", { name: th.account.deleteScreen.deleting });
    fireEvent.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(json(200, { ok: true }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith({ accountDeleted: true }));
    const back = await screen.findByRole("button", { name: th.account.deleteScreen.doneButton });
    fireEvent.click(back);
    expect(replace).toHaveBeenCalledWith("/welcome");
  });

  it("ลบไม่สำเร็จ: ข้อมูลยังอยู่ + ลองใหม่ได้", async () => {
    fetchMock.mockResolvedValue(json(500));
    renderWithIntl(<AccountSection />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(th.account.delete) }));
    for (const b of screen.getAllByRole("checkbox")) fireEvent.click(b);
    fireEvent.click(screen.getByRole("button", { name: th.account.deleteScreen.confirm }));
    expect((await screen.findByRole("alert")).textContent).toBe(th.account.deleteScreen.failed);
    expect(screen.getByRole("button", { name: th.account.deleteScreen.retry })).toBeTruthy();
  });

  it("ออฟไลน์: ออกจากระบบ/ลบบัญชีปิด + บอกว่าต้องต่อเน็ต", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderWithIntl(<AccountSection />);
    expect((screen.getByRole("button", { name: th.account.signOut }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: new RegExp(th.account.delete) }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(th.account.needNet);
  });
});
