// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { renderWithIntl } from "../test-utils";
import { ConsentScreen } from "./consent-screen";

const reset = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/pwa/reset-device", () => ({ resetDeviceAfterSignOut: reset }));
const meHolder = vi.hoisted(() => ({ me: null as unknown, networkFailed: false, refresh: vi.fn(async () => {}) }));
vi.mock("./auth-gate", () => ({
  useMe: () => ({ me: meHolder.me, networkFailed: meHolder.networkFailed, refresh: meHolder.refresh }),
}));

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const existing = { state: "consent_required", profile: { locale: "th", weightUnit: "kg", lengthUnit: "cm", distanceUnit: "km" } };
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
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  meHolder.me = null;
  meHolder.networkFailed = false;
  meHolder.refresh.mockClear();
});

describe("ConsentScreen ผู้ใช้เดิม (มี profile แล้ว) กดไม่ยินยอม", () => {
  it("บอกว่าข้อมูลยังอยู่ · ไม่มีข้อความ 'ลบบัญชีที่เพิ่งสร้าง' · มี 2 ทาง", () => {
    meHolder.me = existing;
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    expect(screen.getByText(th.consent.existing.title)).toBeTruthy();
    expect(document.body.textContent).toContain(th.consent.existing.body);
    expect(document.body.textContent).not.toContain("ที่เพิ่งสร้าง");
    expect(screen.getByRole("button", { name: th.consent.existing.signOut })).toBeTruthy();
    expect(screen.getByRole("button", { name: th.consent.existing.delete })).toBeTruthy();
    expect(screen.getByRole("button", { name: th.consent.declineBack })).toBeTruthy();
  });

  it("ออกจากระบบ: POST sign-out, ล้างเครื่องแบบไม่ลบบัญชี, ไม่เรียก DELETE", async () => {
    meHolder.me = existing;
    fetchMock.mockResolvedValue(json(200, { success: true }));
    renderWithIntl(<ConsentScreen />, "en");
    fireEvent.click(screen.getByRole("button", { name: en.consent.decline }));
    fireEvent.click(screen.getByRole("button", { name: en.consent.existing.signOut }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/sign-out");
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false);
    expect(reset).toHaveBeenCalledWith({ accountDeleted: false });
  });

  it("ออกจากระบบล้มเหลว: แสดงข้อความ ไม่ไปไหน", async () => {
    meHolder.me = existing;
    fetchMock.mockResolvedValue(json(500));
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.signOut }));
    expect((await screen.findByRole("alert")).textContent).toBe(th.consent.existing.signOutFailed);
    expect(replace).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("ลบบัญชี: ต้องยืนยันอีกขั้นก่อน (ยังไม่เรียก API) แล้วจึง DELETE /api/me", async () => {
    meHolder.me = existing;
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.delete }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(th.consent.existing.confirmBody);
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.confirmDelete }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
    expect(fetchMock).toHaveBeenCalledWith("/api/me", expect.objectContaining({ method: "DELETE" }));
    expect(reset).toHaveBeenCalledWith({ accountDeleted: true });
  });

  it("ยกเลิกในขั้นยืนยัน กลับมาเลือก 2 ทาง · กลับไปอ่านอีกที กลับจอยินยอม", () => {
    meHolder.me = existing;
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.delete }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.confirmBack }));
    expect(screen.getByRole("button", { name: th.consent.existing.signOut })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: th.consent.declineBack }));
    expect(screen.getByRole("button", { name: th.consent.agree })).toBeTruthy();
  });

  it("ออฟไลน์: ทั้งออกจากระบบและลบปิด", () => {
    meHolder.me = existing;
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    expect((screen.getByRole("button", { name: th.consent.existing.signOut }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: th.consent.existing.delete }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ConsentScreen ผู้ใช้ใหม่ (profile = null) ยังเหมือนเดิม", () => {
  it("ข้อความเดิม + ปุ่มลบบัญชีที่เพิ่งสร้างปุ่มเดียว", () => {
    meHolder.me = { state: "consent_required", profile: null };
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    expect(document.body.textContent).toContain(th.consent.declineBody);
    expect(screen.getByRole("button", { name: th.consent.declineConfirm })).toBeTruthy();
    expect(screen.queryByRole("button", { name: th.consent.existing.signOut })).toBeNull();
  });
});

describe("ConsentScreen me ยังไม่รู้ (pending / ล้ม) ห้ามถือเป็นผู้ใช้ใหม่", () => {
  it("me ยังไม่ตอบ: ปุ่มไม่ยินยอมปิด · ไม่มีปุ่มลองใหม่", () => {
    meHolder.me = null;
    renderWithIntl(<ConsentScreen />);
    expect((screen.getByRole("button", { name: th.consent.decline }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(th.consent.meLoading)).toBeTruthy();
    expect(screen.queryByRole("button", { name: th.consent.retry })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    expect(screen.queryByRole("button", { name: th.consent.declineConfirm })).toBeNull();
  });

  it("me โหลดล้ม: ปุ่มไม่ยินยอมปิด + ข้อความ + ลองใหม่เรียก refresh", () => {
    meHolder.me = null;
    meHolder.networkFailed = true;
    renderWithIntl(<ConsentScreen />, "en");
    expect((screen.getByRole("button", { name: en.consent.decline }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(en.consent.meFailed);
    fireEvent.click(screen.getByRole("button", { name: en.consent.retry }));
    expect(meHolder.refresh).toHaveBeenCalled();
  });

  it("gate รายงาน network failure ทั้งที่มี me เดิม: ออกจากระบบ/ลบปิด", () => {
    meHolder.me = existing;
    meHolder.networkFailed = true;
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    expect((screen.getByRole("button", { name: th.consent.existing.signOut }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: th.consent.existing.delete }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ข้อความ error ล้างเมื่อเปลี่ยนขั้น (signOutFailed หายเมื่อกดลบ/กลับ)", async () => {
    meHolder.me = existing;
    fetchMock.mockResolvedValue(json(500));
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.signOut }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.delete }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.confirmBack }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("deleteFailed ล้างเมื่อยกเลิกแล้วกลับไปอ่าน", async () => {
    meHolder.me = existing;
    fetchMock.mockResolvedValue(json(500));
    renderWithIntl(<ConsentScreen />);
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.delete }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.confirmDelete }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: th.consent.existing.confirmBack }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.declineBack }));
    fireEvent.click(screen.getByRole("button", { name: th.consent.decline }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
