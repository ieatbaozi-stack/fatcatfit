import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { PRIVACY_SECTIONS } from "./privacy-notice";

type Section = { title: string; paragraphs?: string[]; items?: string[] };

describe("ประกาศความเป็นส่วนตัว", () => {
  it("ครอบเกณฑ์ 8 ของ R1 ครบ 8 หัวข้อ ทั้ง TH และ EN มีเนื้อหา", () => {
    expect(PRIVACY_SECTIONS).toEqual(["purpose", "required", "collected", "recipients", "controller", "rights", "backup", "withdraw"]);
    for (const messages of [th, en]) {
      const sections = messages.privacy.sections as unknown as Record<string, Section>;
      for (const key of PRIVACY_SECTIONS) {
        const s = sections[key];
        expect(s.title.length, key).toBeGreaterThan(3);
        if (key !== "controller") expect((s.paragraphs?.length ?? 0) + (s.items?.length ?? 0), key).toBeGreaterThan(0);
      }
    }
  });

  it("ระบุผู้รับข้อมูลและการส่งไปต่างประเทศ: Vercel Neon Google", () => {
    for (const messages of [th, en]) {
      const text = (messages.privacy.sections.recipients.items as string[]).join(" ");
      for (const name of ["Vercel", "Neon", "Google"]) expect(text).toContain(name);
    }
  });

  it("บอกชัดว่าถอนความยินยอม = ลบบัญชี และเรื่อง backup", () => {
    expect(th.privacy.sections.withdraw.paragraphs[0]).toContain("ลบบัญชี");
    expect(en.privacy.sections.withdraw.paragraphs[0]).toContain("deleting your account");
    expect(th.privacy.sections.backup.paragraphs[0]).toContain("6 ชั่วโมง");
    expect(th.privacy.sections.backup.paragraphs[0]).toContain("7 วัน");
    expect(en.privacy.sections.backup.paragraphs[0]).toContain("6 hours");
    expect(en.privacy.sections.backup.paragraphs[0]).toContain("7 days");
  });

  const all = (m: typeof th | typeof en) => JSON.stringify(m.privacy);

  it("R1 ขั้น 5: ระบุข้อมูลอ่อนไหว ม.26 / ม.24(3) / ม.28 ทั้งสองภาษา", () => {
    for (const m of [th, en]) {
      const text = all(m);
      for (const needle of ["26", "24(3)", "28"]) expect(text).toContain(needle);
    }
    expect(all(th)).toContain("อ่อนไหว");
    expect(all(en)).toContain("sensitive");
  });

  it("R1 ขั้น 5: มีข้อมูลเพื่อความปลอดภัย (IP, Vercel, Gmail) ทั้งสองภาษา", () => {
    for (const m of [th, en]) {
      const safety = (m.privacy.sections.collected as unknown as { safety: string[] }).safety.join(" ");
      for (const needle of ["IP", "Vercel", "Gmail"]) expect(safety).toContain(needle);
    }
  });

  it("R1 ขั้น 5: ระบุสิงคโปร์ สหรัฐอเมริกา และหลายประเทศ (Google) ทั้งสองภาษา", () => {
    expect(all(th)).toMatch(/สิงคโปร์[\s\S]*สหรัฐอเมริกา[\s\S]*หลายประเทศ/);
    expect(all(en)).toMatch(/Singapore[\s\S]*United States[\s\S]*many countries/);
  });

  it("R1 ขั้น 5: ไม่เขียนว่าลบถาวรทันที · ระบุไม่เก็บรูปโปรไฟล์ · ไม่มีข้อความเรื่องอายุ", () => {
    expect(all(th)).not.toContain("ข้อมูลหายจากระบบทันที");
    expect(all(en)).not.toMatch(/permanent/i);
    expect(all(th)).toContain("ไม่เก็บรูปโปรไฟล์");
    expect(all(en)).toContain("profile picture");
    expect(all(th)).not.toContain("อายุขั้นต่ำ");
  });

  it("ชื่อ/อีเมลผู้ควบคุมอ่านจาก env ไม่ฝังใน repo", () => {
    const page = readFileSync(path.resolve(import.meta.dirname, "../../app/privacy/page.tsx"), "utf8");
    expect(page).toContain("process.env.PRIVACY_CONTROLLER_NAME");
    expect(page).toContain("process.env.PRIVACY_CONTACT_EMAIL");
    for (const messages of [th, en]) {
      const controller = JSON.stringify(messages.privacy.sections.controller);
      expect(controller).not.toMatch(/@(?!\{)/); // มีแต่ placeholder {email} ไม่มีอีเมลจริง
    }
  });
});
