// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeTestOffline, openTestOffline } from "../test-offline";
import { renderWithIntl } from "../test-utils";
import { ExercisesScreen } from "./exercises-screen";

const online = vi.hoisted(() => ({ value: true }));
vi.mock("@/pwa/use-online", () => ({ useOnline: () => online.value }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const lib = (id: string, name: string, name_th: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  name_th,
  search_terms: null,
  track_type: "weight_reps",
  load_mode: "external",
  is_unilateral: false,
  category: "chest",
  equipment: "barbell",
  source_dataset: "free-exercise-db",
  source_ref: id,
  license: "Unlicense",
  attribution: "x",
  met: null,
  archived_at: null,
  ...extra,
});

const CATALOG = {
  catalog_version: "3-1",
  exercises: [
    lib("11111111-1111-4111-8111-111111111111", "Barbell Bench Press", "บาร์เบลเบนช์เพรส", { search_terms: "เบนช์|bench" }),
    lib("22222222-2222-4222-8222-222222222222", "Badminton", "แบดมินตัน", { category: "sport", track_type: "duration", equipment: null }),
    lib("33333333-3333-4333-8333-333333333333", "Plank", "แพลงก์", { category: "core", track_type: "duration" }),
  ],
};

const mineRow = (id: string, name: string, archived: string | null = null) => ({
  ...lib(id, name, ""),
  name_th: null,
  owner_user_id: "me",
  source_dataset: null,
  license: null,
  attribution: null,
  archived_at: archived,
  category: "arms",
  track_type: "reps_only",
  has_history: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  client_updated_at: "2026-01-01T00:00:00.000Z",
});

const MINE = [mineRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Curl ของฉัน"), mineRow("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "ท่าเก่า", "2026-01-01T00:00:00.000Z")];

beforeEach(async () => {
  online.value = true;
  window.history.replaceState(null, "", "/me/exercises");
  await openTestOffline({ snapshot: { my_exercises: MINE }, catalog: CATALOG });
});
afterEach(() => {
  cleanup();
  closeTestOffline();
});

async function loaded(locale: "th" | "en" = "th") {
  renderWithIntl(<ExercisesScreen />, locale);
  await screen.findByRole("searchbox");
  await screen.findByText("Curl ของฉัน");
}

describe("ExercisesScreen · หน้าแรก (D6)", () => {
  it("แสดงท่าของฉัน + แถวในกรุที่พับไว้ + ชิป 11 หมวด + ปุ่มสร้าง", async () => {
    await loaded();
    expect(screen.getByRole("heading", { name: "ท่าของฉัน · 1" })).toBeTruthy();
    expect(screen.getByText("Curl ของฉัน")).toBeTruthy();
    expect(screen.queryByText("ท่าเก่า")).toBeNull();
    const chips = within(screen.getByRole("group", { name: "หมวด" })).getAllByRole("button");
    expect(chips).toHaveLength(11);
    expect(chips.every((c) => c.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(screen.getByRole("link", { name: /สร้างท่าของฉัน/ }).getAttribute("href")).toBe("/me/exercises/new");
  });
  it("กางแถวในกรุแล้วเห็นท่าที่เก็บไว้ (ลิงก์ไปฟอร์มแก้)", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /ในกรุ 1 ท่า/ }));
    // หน้าแก้ใช้ path คงที่ (เปิดออฟไลน์ได้) — id ของท่าจำไว้ในเครื่องตอนแตะ
    const link = screen.getByText("ท่าเก่า").closest("a");
    expect(link?.getAttribute("href")).toBe("/me/exercises/edit");
    fireEvent.click(link as HTMLElement);
    expect(sessionStorage.getItem("fcf:edit-exercise")).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
  it("ไม่มีท่าของฉัน = บรรทัดเดียว ไม่มีแถวในกรุ", async () => {
    cleanup();
    closeTestOffline();
    await openTestOffline({ snapshot: { my_exercises: [] }, catalog: CATALOG });
    renderWithIntl(<ExercisesScreen />);
    expect(await screen.findByText("ยังไม่มีท่าของฉัน · หาไม่เจอก็สร้างเองได้")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ในกรุ/ })).toBeNull();
  });
});

describe("ExercisesScreen · ค้นหา", () => {
  it("พิมพ์อังกฤษและทับศัพท์ไทย เจอท่าเดียวกัน · โหมดไทยชื่อไทยบนอังกฤษใต้", async () => {
    await loaded();
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "bench" } });
    expect(screen.getByText("บาร์เบลเบนช์เพรส")).toBeTruthy();
    expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
    fireEvent.change(box, { target: { value: "เบ็นช์" } });
    expect(screen.getByText("บาร์เบลเบนช์เพรส")).toBeTruthy();
    expect(window.location.search).toBe("?q=%E0%B9%80%E0%B8%9A%E0%B9%87%E0%B8%99%E0%B8%8A%E0%B9%8C");
  });
  it("โหมดอังกฤษแสดงชื่ออังกฤษอย่างเดียว", async () => {
    await loaded("en");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bench" } });
    expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
    expect(screen.queryByText("บาร์เบลเบนช์เพรส")).toBeNull();
  });
  it("มีคำค้นแต่ยังไม่เลือกชิป = ซ่อนชิป · ท้ายผลมีลิงก์สร้างพร้อมคำค้น", async () => {
    await loaded();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "plank" } });
    expect(screen.queryByRole("group", { name: "หมวด" })).toBeNull();
    const create = screen.getByRole("link", { name: /สร้าง "plank" เป็นท่าของฉัน/ });
    expect(create.getAttribute("href")).toBe("/me/exercises/new#name=plank");
  });
  it("ค้นไม่เจอ = ข้อความ + ปุ่มหลักสร้าง (ตัดคำค้นไม่เกิน 60 ตัว)", async () => {
    await loaded();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: `  ${"z".repeat(70)}  ` } });
    expect(screen.getByText(/^ไม่เจอ/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /^\+ สร้าง "z+" เป็นท่าของฉัน$/ });
    expect(link.getAttribute("href")).toBe(`/me/exercises/new#name=${"z".repeat(60)}`);
  });
  it("ล้างคำค้นด้วยปุ่ม ✕", async () => {
    await loaded();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "ล้างคำค้น" }));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });
});

describe("ExercisesScreen · ชิปหมวด", () => {
  it("แตะชิป = กรอง + หัวส่วนนับท่า · แตะซ้ำ = เลิกเลือก · ลิงก์สร้างพกหมวดไปด้วย", async () => {
    await loaded();
    const chip = within(screen.getByRole("group", { name: "หมวด" })).getByRole("button", { name: "กีฬา" });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "กีฬา · 1 ท่า" })).toBeTruthy();
    expect(screen.getByText("แบดมินตัน")).toBeTruthy();
    expect(screen.queryByText("บาร์เบลเบนช์เพรส")).toBeNull();
    expect(screen.getByRole("link", { name: /สร้างท่าของฉัน/ }).getAttribute("href")).toBe("/me/exercises/new#category=sport");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("heading", { name: "ท่าของฉัน · 1" })).toBeTruthy();
  });
  it("คำค้นไม่เจอในหมวดที่เลือก = ลิงก์ค้นทุกหมวด", async () => {
    await loaded();
    fireEvent.click(within(screen.getByRole("group", { name: "หมวด" })).getByRole("button", { name: "กีฬา" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bench" } });
    expect(screen.getByText('ไม่เจอ "bench" ในหมวดกีฬา')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ค้นทุกหมวด" }));
    expect(screen.getByText("บาร์เบลเบนช์เพรส")).toBeTruthy();
  });
});

describe("ExercisesScreen · รายละเอียดท่าคลัง", () => {
  it("แตะท่าคลัง = แผ่นอ่านอย่างเดียว · ปิดด้วยปุ่ม/Esc", async () => {
    await loaded();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "plank" } });
    fireEvent.click(screen.getByText("แพลงก์"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("แกนกลาง")).toBeTruthy();
    expect(within(dialog).getByText("เวลา")).toBeTruthy();
    expect(within(dialog).getByText(/เครดิตข้อมูลท่า/)).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ExercisesScreen · สถานะ", () => {
  it("ออนไลน์แต่ยังไม่มีข้อมูลในเครื่องและดึงไม่ได้ = ข้อความ + ลองใหม่", async () => {
    cleanup();
    closeTestOffline();
    await openTestOffline({ snapshot: null, catalog: null });
    renderWithIntl(<ExercisesScreen />);
    expect(await screen.findByText("โหลดคลังท่าไม่ได้")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
  });
  it("ออฟไลน์และยังไม่เคยโหลด = ดูคลังท่าต้องต่อเน็ต", async () => {
    cleanup();
    closeTestOffline();
    await openTestOffline({ snapshot: null, catalog: null });
    online.value = false;
    renderWithIntl(<ExercisesScreen />);
    expect(await screen.findByText("ดูคลังท่าต้องต่อเน็ต")).toBeTruthy();
  });
  it("ออฟไลน์แต่มีข้อมูลในเครื่อง = ค้นได้ สร้างได้ (R3a เขียนผ่านคิว) ไม่มีบรรทัดต้องต่อเน็ต", async () => {
    online.value = false;
    await loaded();
    expect(screen.queryByText("สร้างและแก้ท่าต้องต่อเน็ต")).toBeNull();
    expect(screen.getByRole("link", { name: /สร้างท่าของฉัน/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bench" } });
    expect(screen.getByText("บาร์เบลเบนช์เพรส")).toBeTruthy();
  });
});
