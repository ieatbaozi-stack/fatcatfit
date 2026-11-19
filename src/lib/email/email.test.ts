import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn(async () => ({}));
const close = vi.fn();
const createTransport = vi.fn((opts: unknown) => (void opts, { sendMail, close }));
vi.mock("nodemailer", () => ({ default: { createTransport: (o: unknown) => createTransport(o) } }));

import { EmailConfigError, sendEmail, sendOtpEmail } from "./index";
import { renderOtpEmail } from "./templates";

const SMTP_ENV = {
  EMAIL_TRANSPORT: "smtp",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "465",
  SMTP_USER: "app@example.com",
  SMTP_PASS: "fake-app-password",
  EMAIL_FROM: "Fat Cat Fit <noreply@example.com>",
};
const msg = { to: "a@example.com", subject: "s", text: "t", html: "<p>h</p>" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sendMail.mockClear();
  close.mockClear();
  createTransport.mockClear();
});

describe("แม่แบบ OTP", () => {
  const TH = "ไม่ต้องทำอะไร";
  const EN = "ignore this email";
  it("ทั้ง th และ en มีสองภาษาทั้งใน text และ html", () => {
    for (const l of ["th", "en"] as const) {
      const r = renderOtpEmail(l, "123456");
      for (const s of [r.text, r.html]) {
        expect(s).toContain(TH);
        expect(s).toContain(EN);
      }
      expect(r.html).toContain('lang="th"');
      expect(r.html).toContain('lang="en"');
    }
  });
  it("ภาษาของ locale มาก่อน", () => {
    for (const s of ["text", "html"] as const) {
      const th = renderOtpEmail("th", "123456")[s];
      const en = renderOtpEmail("en", "123456")[s];
      expect(th.indexOf(TH)).toBeLessThan(th.indexOf(EN));
      expect(en.indexOf(EN)).toBeLessThan(en.indexOf(TH));
    }
    expect(renderOtpEmail("th", "123456").html).toMatch(/^<!doctype html><html lang="th">/);
    expect(renderOtpEmail("en", "123456").html).toMatch(/^<!doctype html><html lang="en">/);
  });
  it("locale ที่ไม่รู้จักถอยไป th", () => {
    const r = renderOtpEmail("fr" as never, "123456");
    expect(r.text.indexOf(TH)).toBeLessThan(r.text.indexOf(EN));
  });
  it("subject สองภาษา ไม่มีรหัส", () => {
    for (const l of ["th", "en"] as const) {
      const { subject } = renderOtpEmail(l, "123456");
      expect(subject).toBe("รหัส OTP เข้าสู่ระบบ Fat Cat Fit / Your Fat Cat Fit sign-in code (OTP)");
      expect(subject).not.toContain("123456");
    }
  });
  it("รหัสปรากฏครั้งเดียวในแต่ละส่วน · อายุ 10 นาที · ไม่มีลิงก์", () => {
    for (const l of ["th", "en"] as const) {
      const r = renderOtpEmail(l, "123456");
      expect(r.text.split("123456")).toHaveLength(2);
      expect(r.html.split("123456")).toHaveLength(2);
      expect(r.text).toContain("10");
      for (const s of [r.text, r.html]) expect(s).not.toMatch(/https?:|href|<a |www\./i);
    }
  });
});

describe("transport log", () => {
  it("production: ไม่ log รหัสและไม่ log อีเมล", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail(msg, { EMAIL_TRANSPORT: "log", NODE_ENV: "production" }, "987654");
    const out = JSON.stringify(spy.mock.calls);
    expect(spy).toHaveBeenCalled();
    expect(out).not.toContain("987654");
    expect(out).not.toContain("a@example.com");
  });
  it("นอก production: แสดงรหัสเพื่อทดสอบ", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail(msg, { EMAIL_TRANSPORT: "log", NODE_ENV: "development" }, "987654");
    expect(JSON.stringify(spy.mock.calls)).toContain("987654");
  });
  it("ไม่ตั้ง EMAIL_TRANSPORT: dev ใช้ log, production error ชัดเจน", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(sendEmail(msg, { NODE_ENV: "development" })).resolves.toBeUndefined();
    await expect(sendEmail(msg, { NODE_ENV: "production" })).rejects.toThrow(EmailConfigError);
  });
  it("ค่า EMAIL_TRANSPORT แปลก → error", async () => {
    await expect(sendEmail(msg, { EMAIL_TRANSPORT: "http" })).rejects.toThrow(/EMAIL_TRANSPORT/);
  });
});

describe("transport smtp", () => {
  it("ใช้ค่าจาก env", async () => {
    await sendEmail(msg, SMTP_ENV);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 465,
        secure: true,
        auth: { user: "app@example.com", pass: "fake-app-password" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: SMTP_ENV.EMAIL_FROM, to: "a@example.com", subject: "s" }),
    );
    expect(close).toHaveBeenCalled();
  });
  it("พอร์ต 587 ใช้ STARTTLS (secure=false)", async () => {
    await sendEmail(msg, { ...SMTP_ENV, SMTP_PORT: "587" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
  });
  it("ค่าไม่ครบ → error บอกชื่อตัวแปรที่ขาด (ไม่บอกค่า)", async () => {
    const { SMTP_PASS: _omit, ...rest } = SMTP_ENV;
    void _omit;
    const err = await sendEmail(msg, rest).catch((e) => e);
    expect(err).toBeInstanceOf(EmailConfigError);
    expect(err.message).toContain("SMTP_PASS");
    expect(createTransport).not.toHaveBeenCalled();
  });
});

describe("sendOtpEmail", () => {
  it("แสดงรหัสใน log ของ production ไม่ได้ (ผ่านทางเต็ม)", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "log");
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await sendOtpEmail({ to: "a@example.com", otp: "246810", locale: "en" });
    expect(JSON.stringify([info.mock.calls, errSpy.mock.calls])).not.toMatch(/246810|a@example\.com/);
  });
  it("ส่งผิดพลาด: log ไม่มีอีเมล/รหัส และโยนต่อ", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "smtp");
    vi.stubEnv("SMTP_HOST", "");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendOtpEmail({ to: "a@example.com", otp: "246810", locale: "th" })).rejects.toThrow();
    expect(JSON.stringify(errSpy.mock.calls)).not.toMatch(/246810|a@example\.com/);
  });
  it("error จาก SMTP ที่มีที่อยู่ผู้รับ: โยน error ใหม่ที่ไม่มี property อื่น และไม่ log อีเมล", async () => {
    for (const k of Object.keys(SMTP_ENV)) vi.stubEnv(k, SMTP_ENV[k as keyof typeof SMTP_ENV]);
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error("550 victim@example.com rejected"), {
        code: "EENVELOPE",
        rejected: ["victim@example.com"],
        response: "550 victim@example.com",
        command: "RCPT TO",
      }),
    );
    const spies = (["log", "info", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    let caught: unknown;
    try {
      await sendOtpEmail({ to: "victim@example.com", otp: "246810", locale: "en" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("email_send_failed");
    expect(Object.keys(caught as object)).toEqual([]);
    expect((caught as Error).cause).toBeUndefined();
    expect(JSON.stringify(spies.map((s) => s.mock.calls))).not.toMatch(/victim@example\.com|246810/);
  });
});
