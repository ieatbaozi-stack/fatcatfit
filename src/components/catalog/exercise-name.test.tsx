// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { renderWithIntl } from "../test-utils";
import { TrainingSection } from "./me-sections";
import { ExerciseName } from "./exercise-name";
import { resetStore } from "./store";

vi.mock("@/pwa/use-online", () => ({ useOnline: () => false }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const libEx = { name: "Barbell Bench Press", name_th: "บาร์เบลเบนช์เพรส", owner_user_id: null, category: "chest", track_type: "weight_reps" };
const mineEx = { name: "ท่าฉัน", name_th: null, owner_user_id: "u", category: "legs", track_type: "duration" };

describe("ExerciseName (D3)", () => {
  it("ไทย: ท่าคลังมี 2 บรรทัด ไทยบน อังกฤษใต้", () => {
    renderWithIntl(<ExerciseName exercise={libEx} />, "th");
    expect(screen.getByText("บาร์เบลเบนช์เพรส")).toBeTruthy();
    expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
  });
  it("อังกฤษ: ท่าคลังอังกฤษอย่างเดียว", () => {
    renderWithIntl(<ExerciseName exercise={libEx} />, "en");
    expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
    expect(screen.queryByText("บาร์เบลเบนช์เพรส")).toBeNull();
  });
  it("ท่าของฉัน: ชื่อที่พิมพ์ + บรรทัดรองตามภาษา", () => {
    const { unmount } = renderWithIntl(<ExerciseName exercise={mineEx} />, "th");
    expect(screen.getByText("ท่าฉัน")).toBeTruthy();
    expect(screen.getByText("ของฉัน · ขา/ก้น · เวลา")).toBeTruthy();
    unmount();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ExerciseName exercise={mineEx} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Mine · Legs & glutes · Time")).toBeTruthy();
  });
  it("ท่าในกรุ (muted) ใช้สี ink-3", () => {
    renderWithIntl(<ExerciseName exercise={mineEx} muted />);
    expect(screen.getByText("ท่าฉัน").className).toContain("text-ink-3");
  });
});

describe("หน้า ฉัน · ส่วนออกกำลังกาย", () => {
  it("ลิงก์ไปท่า/สถานที่ ไม่มีป้ายจำนวนระหว่างยังไม่โหลด", () => {
    resetStore();
    renderWithIntl(<TrainingSection />);
    expect(screen.getByRole("link", { name: "ท่าออกกำลังกาย" }).getAttribute("href")).toBe("/me/exercises");
    const places = screen.getByRole("link", { name: "สถานที่" });
    expect(places.getAttribute("href")).toBe("/me/places");
    expect(places.textContent).toBe("สถานที่");
  });
});

describe("ข้อความ R2 ครบสองภาษา", () => {
  it("ทุกหมวด อุปกรณ์ และชนิดการจดมีป้ายและตัวอย่าง", () => {
    for (const m of [th, en]) {
      expect(Object.keys(m.exercise.category)).toHaveLength(11);
      expect(Object.keys(m.exercise.equipment)).toHaveLength(9);
      expect(Object.keys(m.exercise.track)).toHaveLength(6);
      expect(Object.keys(m.exercise.trackExample)).toHaveLength(6);
    }
  });
});
