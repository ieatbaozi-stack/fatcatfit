// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../test-utils";
import { EditExerciseForm, NewExerciseForm } from "./exercise-form";
import { takeFlash } from "./flash";
import { getStoreState, resetStore } from "./store";

const online = vi.hoisted(() => ({ value: true }));
const nav = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock("@/pwa/use-online", () => ({ useOnline: () => online.value }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/components/auth/auth-gate", () => ({ useMe: () => ({ me: { user: { id: "me-1" } }, refresh: async () => {} }) }));

const MINE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mine = (over: Record<string, unknown> = {}) => ({
  id: MINE_ID,
  owner_user_id: "me-1",
  name: "Curl",
  name_th: null,
  search_terms: null,
  track_type: "weight_reps",
  load_mode: "external",
  is_unilateral: false,
  category: "arms",
  equipment: "dumbbell",
  source_dataset: null,
  source_ref: null,
  license: null,
  attribution: null,
  met: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  client_updated_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
let pushResult: (op: { id: string; action: string; data?: Record<string, unknown> }) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let existing: Array<Record<string, unknown>>;
/** เซิร์ฟเวอร์จำลองที่จำผลเขียน (ให้การถามข้อมูลซ้ำเงียบๆ หลังบันทึกได้ค่าตรงกับที่ส่ง) */
const applied: typeof pushResult = (op) => {
  existing = op.action === "delete" ? existing.filter((e) => e.id !== op.id) : existing.some((e) => e.id === op.id) ? existing.map((e) => (e.id === op.id ? { ...e, ...op.data } : e)) : [...existing, { ...mine(), id: op.id, ...op.data }];
  return json({ results: [{ op_id: "o", status: "applied" }], server_time: "t" });
};

const pushBodies = () =>
  fetchMock.mock.calls.filter((c) => c[0] === "/api/sync/push").map((c) => JSON.parse(String((c[1] as RequestInit).body)).ops[0]);

beforeEach(() => {
  resetStore();
  online.value = true;
  nav.back.mockReset();
  nav.replace.mockReset();
  takeFlash();
  existing = [mine()];
  pushResult = applied;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/bootstrap") return json({ profile: null, places: [], my_exercises: existing, catalog_version: "1", server_time: "t" });
    if (url === "/api/sync/push") return pushResult(JSON.parse(String((init as RequestInit).body)).ops[0]);
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const saveBtn = () => screen.getByRole("button", { name: /^(บันทึก|กำลังบันทึก…|ลองใหม่)$/ });

describe("NewExerciseForm", () => {
  it("เติมชื่อและหมวดจากจอค้น · บันทึกปิดจนเลือกชนิดการจด", () => {
    renderWithIntl(<NewExerciseForm initialName="Cable fly" initialCategory="chest" />);
    expect((screen.getByLabelText("ชื่อ") as HTMLInputElement).value).toBe("Cable fly");
    expect(screen.getByRole("radio", { name: "อก" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
  });
  it("เลือกชนิดการจดแล้วบันทึก = push exercise ตามสัญญา + ฝากข้อความ + กลับจอค้น", async () => {
    renderWithIntl(<NewExerciseForm initialName="Cable fly" initialCategory="chest" />);
    fireEvent.click(screen.getByRole("radio", { name: /^ครั้งอย่างเดียว/ }));
    fireEvent.click(screen.getByRole("switch", { name: /จดข้างละ/ }));
    fireEvent.click(screen.getByRole("button", { name: "ยางยืด" }));
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/me/exercises"));
    const [op] = pushBodies();
    expect(op).toMatchObject({
      entity: "exercise",
      action: "upsert",
      data: { name: "Cable fly", category: "chest", track_type: "reps_only", load_mode: "external", is_unilateral: true, equipment: "band" },
    });
    expect(op.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(takeFlash()).toMatchObject({ key: "saved" });
    expect(getStoreState().bootstrap.data?.my_exercises.some((e) => e.id === op.id)).toBe(true);
  });
  it("ชนิดน้ำหนัก × ครั้ง ถามเรื่องน้ำหนักตัว · ชนิดอื่นไม่ถาม · ลู่วิ่งซ่อนสวิตช์ข้างละ", () => {
    renderWithIntl(<NewExerciseForm initialName="x" initialCategory="back" />);
    expect(screen.queryByRole("radiogroup", { name: "ใช้น้ำหนักตัวไหม" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /^น้ำหนัก × ครั้ง/ }));
    expect(screen.getByRole("radiogroup", { name: "ใช้น้ำหนักตัวไหม" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "เครื่องช่วยผ่อน" }));
    fireEvent.click(screen.getByRole("radio", { name: /^ลู่วิ่ง/ }));
    expect(screen.queryByRole("radiogroup", { name: "ใช้น้ำหนักตัวไหม" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it("ลูกศรเปลี่ยนตัวเลือกในกลุ่มชนิดการจด", () => {
    renderWithIntl(<NewExerciseForm initialName="x" initialCategory="back" />);
    const group = screen.getByRole("radiogroup", { name: "จดอะไร" });
    const first = within(group).getAllByRole("radio")[0];
    fireEvent.click(first);
    first.focus();
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(within(group).getAllByRole("radio")[1].getAttribute("aria-checked")).toBe("true");
  });
  it("ชื่อซ้ำกับท่าของฉัน = เตือน ไม่บล็อก · นับตัวอักษรเมื่อถึง 50", async () => {
    renderWithIntl(<NewExerciseForm initialName="" initialCategory={null} />);
    await screen.findByLabelText("ชื่อ");
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "curl" } });
    expect(await screen.findByText(/มีท่าของฉันชื่อนี้แล้ว/)).toBeTruthy();
    expect(screen.queryByText("4/60")).toBeNull();
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "ก".repeat(52) } });
    expect(screen.getByText("52/60")).toBeTruthy();
  });
  it("บันทึกล้ม = ค่ายังอยู่ + ข้อความ + ปุ่มเป็นลองใหม่ · ลองใหม่ส่ง id เดิม", async () => {
    pushResult = () => json({}, 500);
    renderWithIntl(<NewExerciseForm initialName="Row" initialCategory="back" />);
    fireEvent.click(screen.getByRole("radio", { name: /^เวลา/ }));
    fireEvent.click(saveBtn());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("ยังบันทึกไม่ได้");
    expect((screen.getByLabelText("ชื่อ") as HTMLInputElement).value).toBe("Row");
    expect(saveBtn().textContent).toBe("ลองใหม่");
    pushResult = applied;
    fireEvent.click(saveBtn());
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const ops = pushBodies();
    expect(ops).toHaveLength(2);
    expect(ops[1].id).toBe(ops[0].id);
  });
  it("เกินจำนวน (limit_reached) = ข้อความเฉพาะ ปุ่มปิด", async () => {
    pushResult = () => json({ results: [{ status: "rejected", code: "limit_reached" }] });
    renderWithIntl(<NewExerciseForm initialName="Row" initialCategory="back" />);
    fireEvent.click(screen.getByRole("radio", { name: /^เวลา/ }));
    fireEvent.click(saveBtn());
    expect(await screen.findByText(/ท่าของฉันครบ 300 ท่าแล้ว/)).toBeTruthy();
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
  });
  it("✕ ตอนมีที่กรอก = ถามทิ้งไหม · ไม่มีอะไรเปลี่ยน = กลับเลย", () => {
    renderWithIntl(<NewExerciseForm initialName="" initialCategory={null} />);
    fireEvent.click(screen.getByRole("button", { name: "ปิด" }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    cleanup();
    nav.replace.mockReset();
    renderWithIntl(<NewExerciseForm initialName="" initialCategory={null} />);
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "ปิด" }));
    expect(screen.getByRole("dialog", { name: "ทิ้งที่กรอกไว้ไหม" })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ทิ้ง" }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });
  it("Enter ในช่องชื่อไม่ส่งฟอร์ม", () => {
    renderWithIntl(<NewExerciseForm initialName="Row" initialCategory="back" />);
    fireEvent.click(screen.getByRole("radio", { name: /^เวลา/ }));
    fireEvent.keyDown(screen.getByLabelText("ชื่อ"), { key: "Enter" });
    expect(pushBodies()).toHaveLength(0);
  });
  it("ออฟไลน์ = บันทึกปิด + บรรทัดเตือน", () => {
    online.value = false;
    renderWithIntl(<NewExerciseForm initialName="Row" initialCategory="back" />);
    fireEvent.click(screen.getByRole("radio", { name: /^เวลา/ }));
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("สร้างและแก้ท่าต้องต่อเน็ต")).toBeTruthy();
  });
});

describe("EditExerciseForm", () => {
  it("เติมค่าเดิม · บันทึกปิดจนมีอะไรเปลี่ยน · แก้แล้วส่งทั้งแถว", async () => {
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    expect(await screen.findByDisplayValue("Curl")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^น้ำหนัก × ครั้ง/ }).getAttribute("aria-checked")).toBe("true");
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "Hammer curl" } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(pushBodies()[0]).toMatchObject({ id: MINE_ID, action: "upsert", data: { name: "Hammer curl", track_type: "weight_reps", equipment: "dumbbell" } });
    expect("archived_at" in pushBodies()[0].data).toBe(false);
  });
  it("เก็บเข้ากรุทำทันที ส่ง archived_at + ข้อความมีเลิกทำ · ไม่มีท่า = ไม่เจอท่านี้", async () => {
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "เก็บเข้ากรุ" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const op = pushBodies()[0];
    expect(op.data.archived_at).toMatch(/^\d{4}-/);
    const flash = takeFlash();
    expect(flash?.key).toBe("archived");
    expect(typeof flash?.undo).toBe("function");
    cleanup();
    resetStore();
    renderWithIntl(<EditExerciseForm id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" />);
    expect(await screen.findByText(/ไม่เจอท่านี้/)).toBeTruthy();
  });
  it("ท่าในกรุ = ปุ่มเอาออกจากกรุ ส่ง archived_at เป็น null", async () => {
    existing = [mine({ archived_at: "2026-02-01T00:00:00.000Z" })];
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "เอาออกจากกรุ" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(pushBodies()[0].data.archived_at).toBeNull();
    expect(takeFlash()?.key).toBe("unarchived");
  });
  it("ลบ: แผ่นยืนยัน focus ที่ยกเลิก · ยืนยันแล้ว push delete + เอาออกจากข้อมูลในแท็บ", async () => {
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "ลบท่านี้" }));
    const dialog = screen.getByRole("dialog", { name: 'ลบ "Curl" ไหม' });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "ยกเลิก" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "ลบ" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(pushBodies()[0]).toMatchObject({ id: MINE_ID, action: "delete" });
    expect("data" in pushBodies()[0]).toBe(false);
    expect(getStoreState().bootstrap.data?.my_exercises).toEqual([]);
    expect(takeFlash()?.key).toBe("deleted");
  });
  it("ลบล้ม = แผ่นยังเปิด + ข้อความ + ลองใหม่", async () => {
    pushResult = () => json({}, 500);
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "ลบท่านี้" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ลบ" }));
    expect(await screen.findByText("ลบไม่ได้ · ลองอีกที")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
  });
  it("stale = โหลดค่าล่าสุดแล้วเติมใหม่ + บอกผู้ใช้", async () => {
    pushResult = () => json({ results: [{ status: "stale" }] });
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.change(await screen.findByLabelText("ชื่อ"), { target: { value: "Mine edited" } });
    existing = [mine({ name: "Changed elsewhere" })];
    fireEvent.click(saveBtn());
    expect(await screen.findByText(/ท่านี้ถูกแก้จากเครื่องอื่น/)).toBeTruthy();
    expect((screen.getByLabelText("ชื่อ") as HTMLInputElement).value).toBe("Changed elsewhere");
    expect(nav.replace).not.toHaveBeenCalled();
  });
  it("ออฟไลน์: เปิดได้ แต่บันทึก/เก็บเข้ากรุ/ลบปิด", async () => {
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    await screen.findByDisplayValue("Curl");
    cleanup();
    online.value = false;
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.change(await screen.findByLabelText("ชื่อ"), { target: { value: "x" } });
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "เก็บเข้ากรุ" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "ลบท่านี้" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
