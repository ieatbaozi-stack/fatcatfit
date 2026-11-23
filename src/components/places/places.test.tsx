// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/components/catalog/store";
import { renderWithIntl } from "../test-utils";
import { PlaceChip } from "./place-chip";
import { PlacesScreen } from "./places-screen";

const online = vi.hoisted(() => ({ value: true }));
vi.mock("@/pwa/use-online", () => ({ useOnline: () => online.value }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const place = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  last_used_at: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  client_updated_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

let places: Array<Record<string, unknown>>;
let fetchMock: ReturnType<typeof vi.fn>;
let pushStatus: "applied" | "fail" | "limit" | "invalid";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const pushed = () => fetchMock.mock.calls.filter((c) => c[0] === "/api/sync/push").map((c) => JSON.parse(String((c[1] as RequestInit).body)).ops[0]);

beforeEach(() => {
  resetStore();
  online.value = true;
  pushStatus = "applied";
  places = [place(ID_A, "Home", { last_used_at: "2026-02-01T00:00:00.000Z" }), place(ID_B, "Office gym", { created_at: "2026-01-05T00:00:00.000Z" })];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/bootstrap") return json({ profile: null, places, my_exercises: [], catalog_version: "1", server_time: "t" });
    if (url === "/api/sync/push") {
      if (pushStatus === "fail") return json({}, 500);
      if (pushStatus === "limit") return json({ results: [{ status: "rejected", code: "limit_reached" }] });
      if (pushStatus === "invalid") return json({ results: [{ status: "rejected", code: "invalid" }] });
      const op = JSON.parse(String(init?.body)).ops[0];
      const i = places.findIndex((p) => p.id === op.id);
      if (i >= 0) places[i] = { ...places[i], ...op.data };
      else places.push(place(op.id, op.data.name, op.data));
      return json({ results: [{ status: "applied" }] });
    }
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlaceChip (หน้าหลัก)", () => {
  it("แสดงที่ใช้ล่าสุด · แตะเปิดแผ่น · เลือกที่อื่น = ชิปเปลี่ยนทันที + push last_used_at", async () => {
    renderWithIntl(<PlaceChip />);
    const chip = await screen.findByRole("button", { name: "เล่นที่ Home · แตะเพื่อเปลี่ยน" });
    fireEvent.click(chip);
    const dialog = screen.getByRole("dialog", { name: "เล่นที่ไหน" });
    const rows = within(dialog).getAllByRole("button").filter((b) => b.textContent?.includes("Office gym") || b.textContent?.includes("Home"));
    expect(rows.map((r) => r.textContent)).toEqual(["Homeตอนนี้", "Office gym"]);
    expect(rows[0].getAttribute("aria-current")).toBe("true");
    fireEvent.click(rows[1]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByRole("button", { name: "เล่นที่ Office gym · แตะเพื่อเปลี่ยน" })).toBeTruthy();
    await waitFor(() => expect(pushed()).toHaveLength(1));
    expect(pushed()[0]).toMatchObject({ entity: "place", id: ID_B, action: "upsert", data: { name: "Office gym" } });
    expect(pushed()[0].data.last_used_at).toMatch(/^\d{4}-/);
  });
  it("แตะแถวปัจจุบัน = ปิดแผ่นเฉยๆ ไม่ส่งอะไร", async () => {
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ Home/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Home/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pushed()).toHaveLength(0);
  });
  it("เลือกไม่สำเร็จ = ชิปกลับที่เดิม + ข้อความ", async () => {
    pushStatus = "fail";
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ Home/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Office gym/ }));
    expect(await screen.findByText("เปลี่ยนที่ไม่ได้ · ลองอีกที")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^เล่นที่ Home/ })).toBeTruthy();
  });
  it("เพิ่มในแผ่น = สร้าง + เลือกทันที + ปิดแผ่น (Enter = เพิ่ม)", async () => {
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ Home/ }));
    const dialog = screen.getByRole("dialog");
    const add = within(dialog).getByRole("button", { name: "เพิ่ม" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("เพิ่มสถานที่"), { target: { value: "Park" } });
    fireEvent.submit(within(dialog).getByLabelText("เพิ่มสถานที่").closest("form")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("button", { name: "เล่นที่ Park · แตะเพื่อเปลี่ยน" })).toBeTruthy();
    expect(pushed()[0].data.name).toBe("Park");
    expect(pushed()[0].data.last_used_at).toBeTruthy();
  });
  it("เพิ่มล้ม = แผ่นยังเปิด ค่ายังอยู่ + ข้อความ · ชื่อซ้ำเตือนไม่บล็อก", async () => {
    pushStatus = "fail";
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ Home/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("เพิ่มสถานที่"), { target: { value: "home" } });
    expect(within(dialog).getByText(/มีสถานที่ชื่อนี้แล้ว/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "เพิ่ม" }));
    expect(await within(dialog).findByText("เพิ่มไม่ได้ · ลองอีกที")).toBeTruthy();
    expect((within(dialog).getByLabelText("เพิ่มสถานที่") as HTMLInputElement).value).toBe("home");
    expect(within(dialog).getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
  });
  it("ครบ 30 แห่ง = ซ่อนช่องเพิ่ม เหลือบรรทัดข้อความ · มีลิงก์จัดการสถานที่", async () => {
    places = Array.from({ length: 30 }, (_, i) => place(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `P${i}`));
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ P0/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("เพิ่มสถานที่")).toBeNull();
    expect(within(dialog).getByText("ครบ 30 แห่งแล้ว")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "จัดการสถานที่" }).getAttribute("href")).toBe("/me/places");
  });
  it("ออฟไลน์ = ชิปปิด (aria-disabled) + บรรทัดบอก · แตะแล้วไม่เปิดแผ่น", async () => {
    renderWithIntl(<PlaceChip />);
    await screen.findByRole("button", { name: /^เล่นที่ Home/ });
    cleanup();
    online.value = false;
    renderWithIntl(<PlaceChip />);
    const chip = await screen.findByRole("button", { name: /^เล่นที่ Home/ });
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("เปลี่ยนที่เล่นต้องต่อเน็ต")).toBeTruthy();
    fireEvent.click(chip);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("โหลดล้ม = ข้อความ + ลองใหม่", async () => {
    fetchMock.mockImplementation(async () => json({}, 500));
    renderWithIntl(<PlaceChip />);
    expect(await screen.findByText("โหลดสถานที่ไม่ได้")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
  });
});

describe("PlacesScreen", () => {
  it("รายการที่ไม่อยู่ในกรุ + ใช้ล่าสุดที่แถวปัจจุบัน + ในกรุพับไว้", async () => {
    places.push(place("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Old gym", { archived_at: "2026-02-02T00:00:00.000Z" }));
    renderWithIntl(<PlacesScreen />);
    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.getByText("ใช้ล่าสุด")).toBeTruthy();
    expect(screen.queryByText("Old gym")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ในกรุ · 1" }));
    expect(screen.getByText("Old gym")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "เอาออกจากกรุ" }));
    await waitFor(() => expect(pushed()).toHaveLength(1));
    expect(pushed()[0].data).toMatchObject({ name: "Old gym", archived_at: null });
    expect(await screen.findByText("เอาออกจากกรุแล้ว")).toBeTruthy();
  });
  it("เอาออกจากกรุตอนครบ 30 แห่ง = ข้อความเพดาน ไม่ใช่ข้อความทั่วไป", async () => {
    pushStatus = "limit";
    places.push(place("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Old gym", { archived_at: "2026-02-02T00:00:00.000Z" }));
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "ในกรุ · 1" }));
    fireEvent.click(screen.getByRole("button", { name: "เอาออกจากกรุ" }));
    expect(await screen.findByText("ครบ 30 แห่งแล้ว")).toBeTruthy();
    expect(screen.queryByText("ทำไม่สำเร็จ · ลองอีกที")).toBeNull();
  });
  it("แก้ชื่อ: บันทึกปิดจนเปลี่ยน · มีหมายเหตุประวัติเก่า · ส่ง name ใหม่", async () => {
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    const dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    expect(within(dialog).getByText("เปลี่ยนชื่อแล้ว ประวัติเก่าจะแสดงชื่อใหม่ด้วย")).toBeTruthy();
    const save = within(dialog).getByRole("button", { name: "บันทึก" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("ชื่อ"), { target: { value: "Gym 2" } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pushed()[0].data).toEqual({ name: "Gym 2" });
    expect(await screen.findByText("บันทึกแล้ว")).toBeTruthy();
    expect(screen.getByText("Gym 2")).toBeTruthy();
  });
  it("เก็บเข้ากรุทำทันที · เหลือแห่งเดียว = ปิด + ข้อความ (ไม่มีปุ่มลบที่ไหนเลย)", async () => {
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    expect(screen.queryByRole("button", { name: /ลบ/ })).toBeNull();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "เก็บเข้ากรุ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pushed()[0].data.archived_at).toMatch(/^\d{4}-/);
    expect(await screen.findByText("เก็บเข้ากรุแล้ว")).toBeTruthy();
    fireEvent.click(screen.getByText("Home"));
    const dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    expect((within(dialog).getByRole("button", { name: "เก็บเข้ากรุ" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText("ต้องมีสถานที่อย่างน้อย 1 แห่ง")).toBeTruthy();
  });
  it("เซิร์ฟเวอร์ตอบ invalid ตอนเก็บแห่งสุดท้าย = ข้อความเดียวกัน", async () => {
    pushStatus = "invalid";
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "เก็บเข้ากรุ" }));
    expect(await screen.findByText("ต้องมีสถานที่อย่างน้อย 1 แห่ง", { selector: "p[role=alert]" })).toBeTruthy();
  });
  it("เพิ่มสถานที่: ไม่เลือกให้ (ไม่ส่ง last_used_at) + ข้อความ", async () => {
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "+ เพิ่มสถานที่" }));
    const dialog = screen.getByRole("dialog", { name: "เพิ่มสถานที่" });
    fireEvent.change(within(dialog).getByLabelText("ชื่อ"), { target: { value: "Park" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "เพิ่ม" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pushed()[0].data).toEqual({ name: "Park" });
    expect(await screen.findByText("เพิ่มแล้ว")).toBeTruthy();
  });
  it("ครบ 30 แห่ง = ปุ่มเพิ่มปิด + ข้อความ", async () => {
    places = Array.from({ length: 30 }, (_, i) => place(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `P${i}`));
    renderWithIntl(<PlacesScreen />);
    expect(await screen.findByText("ครบ 30 แห่งแล้ว")).toBeTruthy();
    expect((screen.getByRole("button", { name: "+ เพิ่มสถานที่" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("ออฟไลน์ที่โหลดแล้ว = ดูได้ เพิ่มปิด + บรรทัดเตือน · ไม่เคยโหลด = ต้องต่อเน็ต", async () => {
    renderWithIntl(<PlacesScreen />);
    await screen.findByText("Home");
    cleanup();
    online.value = false;
    renderWithIntl(<PlacesScreen />);
    expect(await screen.findByText("เพิ่มและแก้สถานที่ต้องต่อเน็ต")).toBeTruthy();
    expect((screen.getByRole("button", { name: "+ เพิ่มสถานที่" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    resetStore();
    renderWithIntl(<PlacesScreen />);
    expect(screen.getByText("ดูสถานที่ต้องต่อเน็ต")).toBeTruthy();
  });
  it("EN: ป้ายภาษาอังกฤษ", async () => {
    renderWithIntl(<PlacesScreen />, "en");
    expect(await screen.findByText("Last used")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Add a place" })).toBeTruthy();
  });
});

