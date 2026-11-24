import { describe, expect, it } from "vitest";
import { MAP_URL_MAX, isValidMapUrl, normalizeMapUrl } from "./map-link";

describe("normalizeMapUrl", () => {
  it.each([
    "https://maps.app.goo.gl/AbC123xyz",
    "https://www.google.com/maps/place/Fitness/@13.7,100.5,17z",
    "https://www.google.com/maps?q=13.7,100.5",
    "https://google.com/maps/place/x",
    "https://maps.google.com/?q=13.7,100.5",
    "https://maps.google.com",
    "https://goo.gl/maps/AbC123",
    "https://www.google.com:443/maps/place/x",
    "https://GOOGLE.COM/maps/place/x",
  ])("รับ %s", (u) => {
    expect(isValidMapUrl(u)).toBe(true);
  });

  it.each([
    ["http://maps.app.goo.gl/AbC", "http"],
    ["javascript:alert(1)", "javascript"],
    ["data:text/html,<script>1</script>", "data"],
    ["https://google.com.evil.com/maps/x", "host หลอกต่อท้าย"],
    ["https://evil.com/?q=google.com/maps", "google.com ในพารามิเตอร์"],
    ["https://evil.com/maps.app.goo.gl/x", "host อยู่ใน path"],
    ["https://www.google.com@evil.com/maps/x", "userinfo หลอก host"],
    ["https://user:pw@www.google.com/maps/x", "มี user/pass"],
    ["https://www.google.com:8443/maps/x", "port ไม่ใช่ 443"],
    ["https://www.google.co.th/maps/x", "โดเมนประเทศ"],
    ["https://evil.maps.google.com.evil.com/", "ซับโดเมนหลอก"],
    ["https://sub.maps.google.com/", "ซับโดเมนอื่น"],
    ["https://www.google.com/search?q=maps", "ไม่ใช่ /maps"],
    ["https://www.google.com/mapsx/y", "ขึ้นต้น /maps แต่ไม่ใช่ /maps/"],
    ["https://maps.app.goo.gl", "path ว่าง"],
    ["https://maps.app.goo.gl/", "path ว่าง"],
    ["https://goo.gl/abc", "goo.gl ไม่ใช่ /maps/"],
    ["https://goo.gl/maps", "goo.gl/maps ไม่มี / ท้าย"],
    ["https://www.google.com/maps/x y", "ช่องว่างกลาง"],
    ["https://www.google.com/maps/x\ny", "ขึ้นบรรทัดใหม่กลาง"],
    ["", "ว่าง"],
    ["   ", "ช่องว่างล้วน"],
    ["not a url", "ไม่ใช่ URL"],
  ])("ไม่รับ %s (%s)", (u) => {
    expect(isValidMapUrl(u)).toBe(false);
  });

  it("ไม่ใช่สตริง = ไม่รับ", () => {
    for (const v of [null, undefined, 1, {}, ["https://maps.app.goo.gl/a"]]) expect(normalizeMapUrl(v)).toBeNull();
  });

  it("ตัดช่องว่างหัวท้าย และคืนข้อความตามที่วาง", () => {
    expect(normalizeMapUrl("  https://maps.app.goo.gl/Ab  \n")).toBe("https://maps.app.goo.gl/Ab");
  });

  it("ยาว 500 ผ่าน · 501 ไม่ผ่าน", () => {
    const base = "https://www.google.com/maps/place/";
    expect(normalizeMapUrl(base + "a".repeat(MAP_URL_MAX - base.length))).toHaveLength(MAP_URL_MAX);
    expect(normalizeMapUrl(base + "a".repeat(MAP_URL_MAX - base.length + 1))).toBeNull();
  });
});
