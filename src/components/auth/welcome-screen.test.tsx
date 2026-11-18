// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { renderWithIntl } from "../test-utils";
import { WelcomeScreen } from "./welcome-screen";

const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/welcome");
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const callsTo = (path: string) => fetchMock.mock.calls.filter((c) => String(c[0]) === path);

describe("WelcomeScreen · โค้ดเชิญ", () => {
  it("อ่าน #invite= เติมช่อง แล้วลบ hash ออกจาก URL", async () => {
    window.history.replaceState(null, "", "/welcome#invite=mewp4823");
    renderWithIntl(<WelcomeScreen />);
    const field = (await screen.findByLabelText(th.welcome.invite.label)) as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe("MEWP-4823"));
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/welcome");
  });

  it("รูปแบบโค้ดผิด = ข้อความเดียวกับโค้ดผิด และไม่เรียก API", async () => {
    renderWithIntl(<WelcomeScreen />);
    fireEvent.change(await screen.findByLabelText(th.welcome.invite.label), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: th.welcome.google.label }));
    expect((await screen.findByRole("alert")).textContent).toBe(th.welcome.invite.invalid);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ตรวจโค้ดก่อนไป Google · โค้ดไม่ผ่านแล้วไม่ขอ URL ของ Google", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { result: "invalid" }));
    renderWithIntl(<WelcomeScreen />);
    fireEvent.change(await screen.findByLabelText(th.welcome.invite.label), { target: { value: "MEWP-4823" } });
    fireEvent.click(screen.getByRole("button", { name: th.welcome.google.label }));
    expect((await screen.findByRole("alert")).textContent).toBe(th.welcome.invite.invalid);
    expect(callsTo("/api/invite/check")).toHaveLength(1);
    expect(callsTo("/api/auth/sign-in/social")).toHaveLength(0);
  });

  it("ช่องโค้ดว่าง (มีบัญชีแล้ว) ข้ามการตรวจแล้วไป Google เลย", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { url: "about:blank#google" }));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, hash: "", search: "", pathname: "/welcome" });
    renderWithIntl(<WelcomeScreen />);
    fireEvent.click(await screen.findByRole("button", { name: th.welcome.google.label }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("about:blank#google"));
    expect(callsTo("/api/invite/check")).toHaveLength(0);
  });

  it("เครื่องที่เคยเข้าสู่ระบบ: ซ่อนช่องโค้ดเชิญ", async () => {
    window.localStorage.setItem("fcf:known-device", "1");
    renderWithIntl(<WelcomeScreen />);
    await waitFor(() => expect(screen.queryByLabelText(th.welcome.invite.label)).toBeNull());
  });
});

describe("WelcomeScreen · error จาก Google callback", () => {
  it("?error=invite_required → ข้อความใต้ช่องโค้ด แล้วลบ query ออกจาก URL", async () => {
    window.history.replaceState(null, "", "/welcome?error=invite_required");
    renderWithIntl(<WelcomeScreen />);
    expect((await screen.findByRole("alert")).textContent).toBe(th.welcome.invite.required);
    expect(window.location.search).toBe("");
  });
  it("error อื่น → ข้อความทั่วไปใต้ปุ่ม Google (ไม่บอกว่าไม่มีบัญชี)", async () => {
    window.history.replaceState(null, "", "/welcome?error=access_denied");
    renderWithIntl(<WelcomeScreen />, "en");
    expect((await screen.findByRole("alert")).textContent).toBe(en.welcome.google.failed);
  });
});

describe("WelcomeScreen · อีเมล + OTP", () => {
  async function toOtpStep() {
    fetchMock.mockResolvedValueOnce(json(200, { success: true }));
    renderWithIntl(<WelcomeScreen />);
    fireEvent.click(await screen.findByRole("button", { name: th.welcome.useEmail }));
    fireEvent.change(screen.getByLabelText(th.welcome.email.label), { target: { value: "nok@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: th.welcome.email.send }));
    return screen.findByLabelText(th.otp.label);
  }

  it("ส่งรหัสแล้วเข้าขั้น OTP: input เดียว autocomplete one-time-code", async () => {
    const otp = (await toOtpStep()) as HTMLInputElement;
    expect(otp.getAttribute("autocomplete")).toBe("one-time-code");
    expect(otp.getAttribute("inputmode")).toBe("numeric");
    expect(otp.maxLength).toBe(6);
    expect(JSON.parse(String(callsTo("/api/auth/email-otp/send-verification-otp")[0][1].body))).toEqual({
      email: "nok@example.com",
      type: "sign-in",
    });
  });

  it("ครบ 6 หลักส่งเอง ไม่ต้องกดปุ่ม · สำเร็จ = location.replace('/')", async () => {
    const otp = await toOtpStep();
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace, hash: "", search: "", pathname: "/welcome" });
    fetchMock.mockResolvedValueOnce(json(200, { token: "t" }));
    fireEvent.change(otp, { target: { value: "482 915" } });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(JSON.parse(String(callsTo("/api/auth/sign-in/email-otp")[0][1].body))).toEqual({
      email: "nok@example.com",
      otp: "482915",
    });
  });

  it("ไม่ถึง 6 หลักยังไม่ส่ง", async () => {
    const otp = await toOtpStep();
    fireEvent.change(otp, { target: { value: "48291" } });
    expect(callsTo("/api/auth/sign-in/email-otp")).toHaveLength(0);
  });

  it("รหัสผิด และ invite_required ได้ข้อความเดียวกัน (ไม่บอกว่าอีเมลไหนไม่มีบัญชี)", async () => {
    const otp = await toOtpStep();
    fetchMock.mockResolvedValueOnce(json(400, { code: "INVALID_OTP" }));
    fireEvent.change(otp, { target: { value: "111111" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(th.otp.wrong));
    fetchMock.mockResolvedValueOnce(json(403, { code: "invite_required" }));
    fireEvent.change(otp, { target: { value: "222222" } });
    await waitFor(() => expect(callsTo("/api/auth/sign-in/email-otp")).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(th.otp.wrong));
    expect(document.body.textContent).not.toContain(th.welcome.invite.required);
  });

  it("ปุ่มขอรหัสใหม่ปิดในช่วง 60 วินาทีแรก · ปุ่มย้อนกลับไปแก้อีเมลโดยค่าไม่หาย", async () => {
    await toOtpStep();
    const resend = screen.getByRole("button", { name: new RegExp(th.otp.resend) }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: th.otp.back }));
    const email = (await screen.findByLabelText(th.welcome.email.label)) as HTMLInputElement;
    expect(email.value).toBe("nok@example.com");
  });

  it("429 ตอนขอรหัส แสดง 'รอ mm:ss' จาก X-Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(json(429, {}, { "X-Retry-After": "299" }));
    renderWithIntl(<WelcomeScreen />);
    fireEvent.click(await screen.findByRole("button", { name: th.welcome.useEmail }));
    fireEvent.change(screen.getByLabelText(th.welcome.email.label), { target: { value: "nok@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: th.welcome.email.send }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/4:5\d/);
  });

  it("email_unavailable มี Google อยู่ → แนะนำ Google", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { code: "email_unavailable" }));
    renderWithIntl(<WelcomeScreen />);
    fireEvent.click(await screen.findByRole("button", { name: th.welcome.useEmail }));
    fireEvent.change(screen.getByLabelText(th.welcome.email.label), { target: { value: "nok@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: th.welcome.email.send }));
    expect((await screen.findByRole("alert")).textContent).toBe(th.welcome.email.unavailable);
  });

  it("อีเมลรูปแบบผิดไม่เรียก API", async () => {
    renderWithIntl(<WelcomeScreen />);
    fireEvent.click(await screen.findByRole("button", { name: th.welcome.useEmail }));
    fireEvent.change(screen.getByLabelText(th.welcome.email.label), { target: { value: "nok" } });
    fireEvent.click(screen.getByRole("button", { name: th.welcome.email.send }));
    expect((await screen.findByRole("alert")).textContent).toBe(th.welcome.email.invalid);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("WelcomeScreen · ออฟไลน์", () => {
  it("แมว #24 + ปุ่มปิด 'ต้องต่อเน็ตเพื่อเข้าสู่ระบบ' และไม่มีคำว่า Offline", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { container } = renderWithIntl(<WelcomeScreen />, "en");
    const button = screen.getByRole("button", { name: en.offline.signInClosed }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(container.querySelector("svg[data-pose]")?.getAttribute("data-pose")).toBe("offline");
    expect(document.body.textContent).not.toMatch(/offline/i);
    expect(screen.queryByRole("button", { name: en.welcome.google.label })).toBeNull();
  });
  it("ภาษาไทย", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderWithIntl(<WelcomeScreen />);
    expect(screen.getByRole("button", { name: th.offline.signInClosed })).toBeTruthy();
  });
});
