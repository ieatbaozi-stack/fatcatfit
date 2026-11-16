import { describe, expect, it } from "vitest";
import nextConfig, { buildCsp, buildSecurityHeaders } from "../next.config";

const toMap = (h: Array<{ key: string; value: string }>) => Object.fromEntries(h.map((x) => [x.key, x.value]));

describe("security headers", () => {
  it("next.config ตั้ง header ให้ทุก path", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(2);
    expect(rules[1]!.source).toBe("/serwist/:path*");
    expect(toMap(rules[1]!.headers)["Cache-Control"]).toContain("no-store");
    expect(rules[0]!.source).toBe("/:path*");
    const h = toMap(rules[0]!.headers);
    for (const key of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(h[key], key).toBeTruthy();
    }
  });

  it("production: ครบทุกตัว รวม HSTS และ upgrade-insecure-requests ไม่มี unsafe-eval", () => {
    const h = toMap(buildSecurityHeaders(false));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Strict-Transport-Security"]).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
    expect(h["Content-Security-Policy"]).not.toContain("unsafe-eval");
  });

  it("dev: ไม่มี HSTS/upgrade-insecure-requests แต่มี unsafe-eval ให้ React dev", () => {
    const h = toMap(buildSecurityHeaders(true));
    expect(h["Strict-Transport-Security"]).toBeUndefined();
    expect(h["Content-Security-Policy"]).toContain("'unsafe-eval'");
    expect(h["Content-Security-Policy"]).not.toContain("upgrade-insecure-requests");
  });

  it("CSP: ปิด frame, object, base-uri, form-action ภายนอก และไม่เปิด wildcard/โดเมนภายนอก", () => {
    const csp = buildCsp(false);
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "worker-src 'self'", "manifest-src 'self'", "connect-src 'self'"]) {
      expect(csp).toContain(d);
    }
    expect(csp).not.toMatch(/\*|https?:/);
  });
});
