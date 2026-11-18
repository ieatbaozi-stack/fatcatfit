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
    expect(th.privacy.sections.backup.paragraphs[0]).toContain("สำเนาสำรอง");
    expect(en.privacy.sections.backup.paragraphs[0]).toContain("backup");
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
