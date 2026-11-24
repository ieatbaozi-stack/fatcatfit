// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalView, applySessionChange } from "@/lib/offline/client";
import { newSessionDraft } from "@/lib/offline/session";
import { renderWithIntl } from "../test-utils";
import { closeTestOffline, myExerciseRow, openTestOffline } from "../test-offline";
import { EditExerciseForm, NewExerciseForm, readPrefill } from "./exercise-form";
import { markInApp, resetInApp } from "./in-app-nav";
import { takeFlash } from "./flash";

const online = vi.hoisted(() => ({ value: true }));
const nav = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock("@/pwa/use-online", () => ({ useOnline: () => online.value }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/me/exercises/new" }));

const MINE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLACE_ID = "11111111-1111-4111-8111-111111111111";

const ops = () => getLocalView().ops.filter((o) => o.entity === "exercise");

beforeEach(async () => {
  resetInApp();
  online.value = true;
  nav.back.mockReset();
  nav.replace.mockReset();
  takeFlash();
  await openTestOffline({ snapshot: { my_exercises: [myExerciseRow()] } });
});
afterEach(() => {
  cleanup();
  closeTestOffline();
});

/** จอค้นส่งชื่อ/หมวดมาใน hash (ไม่ใช่ query string) */
function renderNew(name: string, category: string | null, session = false) {
  const p = new URLSearchParams();
  if (name) p.set("name", name);
  if (category) p.set("category", category);
  if (session) p.set("session", "1");
  window.history.replaceState(null, "", `/me/exercises/new${p.toString() ? `#${p.toString()}` : ""}`);
  return renderWithIntl(<NewExerciseForm />);
}

const saveBtn = () => screen.getByRole("button", { name: /^(บันทึก|กำลังบันทึก…|ลองใหม่|บันทึกและเพิ่มเข้าเซสชัน)$/ });

describe("NewExerciseForm", () => {
  it("เติมชื่อและหมวดจากจอค้น · บันทึกปิดจนเลือกชนิดการจด", async () => {
    renderNew("Cable fly", "chest");
    expect(((await screen.findByLabelText("ชื่อ")) as HTMLInputElement).value).toBe("Cable fly");
    expect(screen.getByRole("radio", { name: "อก" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
  });

  it("เลือกชนิดการจดแล้วบันทึก = เข้าคิวทั้งแถวตามสัญญา + ฝากข้อความ + กลับจอค้น · จอเห็นท่าทันที", async () => {
    renderNew("Cable fly", "chest");
    fireEvent.click(await screen.findByRole("radio", { name: /^ครั้งอย่างเดียว/ }));
    fireEvent.click(screen.getByRole("switch", { name: /จดข้างละ/ }));
    fireEvent.click(screen.getByRole("button", { name: "ยางยืด" }));
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/me/exercises"));
    const [op] = ops();
    expect(op).toMatchObject({
      entity: "exercise",
      action: "upsert",
      created: true,
      data: { name: "Cable fly", category: "chest", track_type: "reps_only", load_mode: "external", is_unilateral: true, equipment: "band", archived_at: null },
    });
    expect(op.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(takeFlash()).toMatchObject({ key: "saved" });
    expect(getLocalView().myExercises.some((e) => e.id === op.id)).toBe(true);
  });

  it("ออฟไลน์ก็บันทึกได้ (เข้าคิว) — ไม่มีบรรทัดต้องต่อเน็ต", async () => {
    online.value = false;
    renderNew("Row", "back");
    fireEvent.click(await screen.findByRole("radio", { name: /^เวลา/ }));
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/ต้องต่อเน็ต/)).toBeNull();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(ops()).toHaveLength(1));
  });

  it("มาจากหน้าจด (session=1): ปุ่มเป็น 'บันทึกและเพิ่มเข้าเซสชัน' → ท่าเข้าเซสชัน + กลับ /log", async () => {
    await applySessionChange({ draft: newSessionDraft({ id: "22222222-2222-4222-8222-222222222222", placeId: PLACE_ID, placeName: "Gym", now: Date.now() }), writes: [] });
    renderNew("ยกถังน้ำ", "other", true);
    fireEvent.click(await screen.findByRole("radio", { name: /^เวลา/ }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกและเพิ่มเข้าเซสชัน" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/log"));
    const d = getLocalView().activeSession;
    expect(d?.exercises).toHaveLength(1);
    expect(d?.exercises[0]).toMatchObject({ exercise_name: "ยกถังน้ำ", track_type: "duration", load_mode: "external" });
    // แถวเซ็ตแรก (ค่าแนะนำ ยังไม่ติ๊ก) ขึ้นให้เลย
    expect(d?.exercises[0].sets).toHaveLength(1);
    expect(d?.exercises[0].sets[0].completed_at).toBeNull();
  });

  it("ชนิดน้ำหนัก × ครั้ง ถามเรื่องน้ำหนักตัว · ชนิดอื่นไม่ถาม · ลู่วิ่งซ่อนสวิตช์ข้างละ", async () => {
    renderNew("x", "back");
    await screen.findByLabelText("ชื่อ");
    expect(screen.queryByRole("radiogroup", { name: "ใช้น้ำหนักตัวไหม" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /^น้ำหนัก × ครั้ง/ }));
    expect(screen.getByRole("radiogroup", { name: "ใช้น้ำหนักตัวไหม" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "เครื่องช่วยผ่อน" }));
    fireEvent.click(screen.getByRole("radio", { name: /^ลู่วิ่ง/ }));
    expect(screen.queryByRole("radiogroup", { name: "ใช้น้ำหนักตัวไหม" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("ลูกศรเปลี่ยนตัวเลือกในกลุ่มชนิดการจด", async () => {
    renderNew("x", "back");
    const group = await screen.findByRole("radiogroup", { name: "จดอะไร" });
    const first = within(group).getAllByRole("radio")[0];
    fireEvent.click(first);
    first.focus();
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(within(group).getAllByRole("radio")[1].getAttribute("aria-checked")).toBe("true");
  });

  it("ชื่อซ้ำกับท่าของฉัน = เตือน ไม่บล็อก · นับตัวอักษรเมื่อถึง 50", async () => {
    renderNew("", null);
    await screen.findByLabelText("ชื่อ");
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "curl" } });
    expect(await screen.findByText(/มีท่าของฉันชื่อนี้แล้ว/)).toBeTruthy();
    expect(screen.queryByText("4/60")).toBeNull();
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "ก".repeat(52) } });
    expect(screen.getByText("52/60")).toBeTruthy();
  });

  it("ครบ 300 ท่า = ข้อความเฉพาะ ปุ่มปิด", async () => {
    cleanup();
    closeTestOffline();
    await openTestOffline({ snapshot: { my_exercises: Array.from({ length: 300 }, (_, i) => myExerciseRow({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`, name: `Ex ${i}` })) } });
    renderNew("Row", "back");
    fireEvent.click(await screen.findByRole("radio", { name: /^เวลา/ }));
    expect(screen.getByText(/ท่าของฉันครบ 300 ท่าแล้ว/)).toBeTruthy();
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
  });

  it("✕ ตอนมีที่กรอก = ถามทิ้งไหม · ไม่มีอะไรเปลี่ยน = กลับเลย", async () => {
    renderNew("", null);
    fireEvent.click(await screen.findByRole("button", { name: "ปิด" }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    cleanup();
    nav.replace.mockReset();
    renderNew("", null);
    fireEvent.change(await screen.findByLabelText("ชื่อ"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "ปิด" }));
    expect(screen.getByRole("dialog", { name: "ทิ้งที่กรอกไว้ไหม" })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ทิ้ง" }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it("Enter ในช่องชื่อไม่ส่งฟอร์ม", async () => {
    renderNew("Row", "back");
    fireEvent.click(await screen.findByRole("radio", { name: /^เวลา/ }));
    fireEvent.keyDown(screen.getByLabelText("ชื่อ"), { key: "Enter" });
    expect(ops()).toHaveLength(0);
  });
});

describe("เติมค่าและทางกลับ", () => {
  it("readPrefill: ตัดช่องว่าง 60 ตัว · หมวดนอกรายการ = ไม่เลือก · session=1", () => {
    expect(readPrefill("#name=%20bench%20&category=chest")).toEqual({ name: "bench", category: "chest", session: false });
    expect(readPrefill("#category=nope")).toEqual({ name: "", category: null, session: false });
    expect(Array.from(readPrefill(`#name=${"z".repeat(80)}`).name)).toHaveLength(60);
    expect(readPrefill("")).toEqual({ name: "", category: null, session: false });
    expect(readPrefill("#name=a&session=1").session).toBe(true);
  });

  it("มาจากในแอป = router.back · เปิดตรงๆ = replace ไปจอค้น (ไม่ออกนอกแอป)", async () => {
    markInApp();
    renderNew("Row", "back");
    fireEvent.click(await screen.findByRole("button", { name: "ปิด" }));
    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
    cleanup();
    nav.back.mockReset();
    resetInApp();
    renderNew("Row", "back");
    fireEvent.click(await screen.findByRole("button", { name: "ปิด" }));
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith("/me/exercises");
  });

  it("ฟอร์มซ่อนแถบล่างตอนแสดงอยู่ และคืนเมื่อปิด", async () => {
    const { useTabsHidden } = await import("../nav/tabs-visibility");
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useTabsHidden());
      return null;
    }
    renderWithIntl(
      <>
        <Probe />
        <NewExerciseForm />
      </>,
    );
    await waitFor(() => expect(seen.at(-1)).toBe(true));
    cleanup();
    renderWithIntl(<Probe />);
    expect(seen.at(-1)).toBe(false);
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
    expect(ops()[0]).toMatchObject({ id: MINE_ID, action: "upsert", data: { name: "Hammer curl", track_type: "weight_reps", equipment: "dumbbell", archived_at: null } });
  });

  it("เก็บเข้ากรุทำทันที เข้าคิว archived_at + ข้อความมีเลิกทำ (เป็นข้อมูล เก็บข้ามหน้าได้) · ไม่มีท่า = ไม่เจอท่านี้", async () => {
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "เก็บเข้ากรุ" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(String(ops()[0].data?.archived_at)).toMatch(/^\d{4}-/);
    const flash = takeFlash();
    expect(flash).toMatchObject({ key: "archived", undo: { type: "unarchiveExercise", id: MINE_ID } });
    cleanup();
    renderWithIntl(<EditExerciseForm id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" />);
    expect(await screen.findByText(/ไม่เจอท่านี้/)).toBeTruthy();
  });

  it("ท่าในกรุ = ปุ่มเอาออกจากกรุ ส่ง archived_at เป็น null", async () => {
    cleanup();
    closeTestOffline();
    await openTestOffline({ snapshot: { my_exercises: [myExerciseRow({ archived_at: "2026-02-01T00:00:00.000Z" })] } });
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "เอาออกจากกรุ" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(ops()[0].data?.archived_at).toBeNull();
    expect(takeFlash()?.key).toBe("unarchived");
  });

  it("ลบ: แผ่นยืนยัน focus ที่ยกเลิก · ยืนยันแล้วเข้าคิว delete + ท่าหายจากจอทันที", async () => {
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "ลบท่านี้" }));
    const dialog = screen.getByRole("dialog", { name: 'ลบ "Curl" ไหม' });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "ยกเลิก" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "ลบ" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(ops()[0]).toMatchObject({ id: MINE_ID, action: "delete", data: null });
    expect(getLocalView().myExercises).toEqual([]);
    expect(takeFlash()?.key).toBe("deleted");
  });

  it("มีประวัติ (has_history): ชนิดการจดเป็นข้อความอ่านอย่างเดียว · ไม่มีปุ่มลบ · เก็บเข้ากรุได้ · แก้ชื่อได้", async () => {
    cleanup();
    closeTestOffline();
    await openTestOffline({ snapshot: { my_exercises: [myExerciseRow({ has_history: true, load_mode: "bodyweight_plus" })] } });
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    await screen.findByDisplayValue("Curl");
    expect(screen.getByText("ท่านี้มีประวัติแล้ว เปลี่ยนชนิดการจดไม่ได้")).toBeTruthy();
    expect(screen.getByText(/น้ำหนัก × ครั้ง · /)).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "จดอะไร" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ลบท่านี้" })).toBeNull();
    expect(screen.getByText(/ท่าที่มีประวัติลบไม่ได้/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "เก็บเข้ากรุ" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "Curl 2" } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(ops()[0].data).toMatchObject({ name: "Curl 2", track_type: "weight_reps", load_mode: "bodyweight_plus" });
  });

  it("เซ็ตที่ติ๊กแล้วในเครื่อง (ยังค้างส่ง) = มีประวัติ แม้ bootstrap ยังบอก false · ลบเซ็ตหมดแล้วกลับมาแก้ได้", async () => {
    const { addExercise, addSet, checkSet, EMPTY_SET_VALUES } = await import("@/lib/offline/session");
    let d = newSessionDraft({ id: "22222222-2222-4222-8222-222222222222", placeId: PLACE_ID, placeName: "Gym", now: Date.now() });
    d = addExercise(d, { id: "33333333-3333-4333-8333-333333333333", exercise_id: MINE_ID, exercise_name: "Curl", exercise_name_th: null, track_type: "weight_reps", load_mode: "external" }, Date.now()).draft!;
    d = addSet(d, "33333333-3333-4333-8333-333333333333", { id: "44444444-4444-4444-8444-444444444444", values: { ...EMPTY_SET_VALUES, weight_input: 10, weight_unit: "kg", reps: 5 } }, Date.now()).draft!;
    const ch = checkSet(d, "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", Date.now());
    await act(async () => void (await applySessionChange(ch)));
    renderWithIntl(<EditExerciseForm id={MINE_ID} />);
    await screen.findByDisplayValue("Curl");
    expect(screen.queryByRole("button", { name: "ลบท่านี้" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "จดอะไร" })).toBeNull();
  });
});
