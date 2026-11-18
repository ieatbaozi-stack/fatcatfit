import { describe, expect, it } from "vitest";
import * as sessionCookieModule from "./session-cookie";
import { hasSessionCookie } from "./session-cookie";
import { readFileSync } from "node:fs";
import path from "node:path";

const h = (cookie?: string) => new Headers(cookie ? { cookie } : {});

describe("hasSessionCookie (ADR 0006 เทสต์ 7)", () => {
  it("รับทั้งชื่อปกติและชื่อมี __Secure- prefix", () => {
    expect(hasSessionCookie(h("better-auth.session_token=abc.def"))).toBe(true);
    expect(hasSessionCookie(h("__Secure-better-auth.session_token=abc.def"))).toBe(true);
    expect(hasSessionCookie(h("a=1; better-auth.session_token=abc.def; b=2"))).toBe(true);
  });
  it("ไม่มี cookie / cookie อื่น / ค่าว่าง → false", () => {
    expect(hasSessionCookie(h())).toBe(false);
    expect(hasSessionCookie(h("NEXT_LOCALE=th; fcf_invite=ABCD2345"))).toBe(false);
    expect(hasSessionCookie(h("better-auth.session_token="))).toBe(false);
  });
  it("ไม่ import ฐานข้อมูล (ไฟล์ไม่มี @/db และ drizzle)", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/auth/session-cookie.ts"), "utf8");
    expect(src).not.toMatch(/@\/db|drizzle|pg"/);
    expect(Object.keys(sessionCookieModule)).toEqual(["hasSessionCookie"]);
  });
});
