// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySessionChange, getLocalView } from "@/lib/offline/client";
import { newSessionDraft } from "@/lib/offline/session";
import { closeTestOffline, openTestOffline, placeRow } from "../test-offline";
import { renderWithIntl } from "../test-utils";
import { deletePlace } from "./place-actions";
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
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const place = (id: string, name: string, over: Partial<ReturnType<typeof placeRow>> = {}) => placeRow({ id, name, ...over });
const HOME = () => place(ID_A, "Home", { last_used_at: "2026-02-01T00:00:00.000Z" });
const GYM = () => place(ID_B, "Office gym", { created_at: "2026-01-05T00:00:00.000Z" });

/** การเขียนสถานที่ที่ค้างในคิว (ตรวจจากข้อมูลในเครื่อง — หน้าจอไม่ fetch เอง) */
const ops = () => getLocalView().ops.filter((o) => o.entity === "place");

async function open(places = [HOME(), GYM()]) {
  await openTestOffline({ snapshot: { places } });
}

beforeEach(() => {
  online.value = true;
});
afterEach(() => {
  cleanup();
  closeTestOffline();
});

describe("PlaceChip (หน้าหลัก)", () => {
  it("แสดงที่ใช้ล่าสุด · แตะเปิดแผ่น · เลือกที่อื่น = ชิปเปลี่ยนทันที + เข้าคิว last_used_at", async () => {
    await open();
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
    await waitFor(() => expect(ops()).toHaveLength(1));
    // ส่งทั้งแถว (คิวแทนที่ data ทั้งก้อนเมื่อแก้แถวเดิมซ้ำ)
    expect(ops()[0]).toMatchObject({ entity: "place", id: ID_B, action: "upsert", data: { name: "Office gym", map_url: null, archived_at: null } });
    expect(String(ops()[0].data?.last_used_at)).toMatch(/^\d{4}-/);
  });

  it("แตะแถวปัจจุบัน = ปิดแผ่นเฉยๆ ไม่เขียนอะไร", async () => {
    await open();
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ Home/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Home/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(ops()).toHaveLength(0);
  });

  it("เพิ่มในแผ่น = สร้าง + เลือกทันที + ปิดแผ่น (Enter = เพิ่ม)", async () => {
    await open();
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ Home/ }));
    const dialog = screen.getByRole("dialog");
    const add = within(dialog).getByRole("button", { name: "เพิ่ม" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("เพิ่มสถานที่"), { target: { value: "Park" } });
    fireEvent.submit(within(dialog).getByLabelText("เพิ่มสถานที่").closest("form")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("button", { name: "เล่นที่ Park · แตะเพื่อเปลี่ยน" })).toBeTruthy();
    expect(ops()[0]).toMatchObject({ created: true, data: { name: "Park" } });
    expect(ops()[0].data?.last_used_at).toBeTruthy();
  });

  it("ชื่อซ้ำเตือนไม่บล็อก", async () => {
    await open();
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ Home/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("เพิ่มสถานที่"), { target: { value: "home" } });
    expect(within(dialog).getByText(/มีสถานที่ชื่อนี้แล้ว/)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "เพิ่ม" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ครบ 30 แห่ง = ซ่อนช่องเพิ่ม เหลือบรรทัดข้อความ · มีลิงก์จัดการสถานที่", async () => {
    await open(Array.from({ length: 30 }, (_, i) => place(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `P${i}`)));
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ P0/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("เพิ่มสถานที่")).toBeNull();
    expect(within(dialog).getByText("ครบ 30 แห่งแล้ว")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "จัดการสถานที่" }).getAttribute("href")).toBe("/me/places");
  });

  it("ออฟไลน์ก็เลือกที่เล่นได้ (เข้าคิว) — ชิปไม่ปิด ไม่มีบรรทัดต้องต่อเน็ต", async () => {
    online.value = false;
    await open();
    renderWithIntl(<PlaceChip />);
    const chip = await screen.findByRole("button", { name: /^เล่นที่ Home/ });
    expect(chip.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByText("เปลี่ยนที่เล่นต้องต่อเน็ต")).toBeNull();
    fireEvent.click(chip);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Office gym/ }));
    expect(await screen.findByRole("button", { name: /^เล่นที่ Office gym/ })).toBeTruthy();
    expect(ops()).toHaveLength(1);
  });

  it("ยังไม่มีข้อมูลในเครื่องและดึงไม่ได้ = ข้อความ + ลองใหม่", async () => {
    await openTestOffline({ snapshot: null });
    renderWithIntl(<PlaceChip />);
    expect(await screen.findByText("โหลดสถานที่ไม่ได้")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
  });
});

describe("PlacesScreen", () => {
  it("รายการที่ไม่อยู่ในกรุ + ใช้ล่าสุดที่แถวปัจจุบัน + ในกรุพับไว้ · เอาออกจากกรุเข้าคิวทั้งแถว", async () => {
    await open([HOME(), GYM(), place(ID_C, "Old gym", { archived_at: "2026-02-02T00:00:00.000Z" })]);
    renderWithIntl(<PlacesScreen />);
    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.getByText("ใช้ล่าสุด")).toBeTruthy();
    expect(screen.queryByText("Old gym")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ในกรุ · 1" }));
    expect(screen.getByText("Old gym")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "เอาออกจากกรุ" }));
    await waitFor(() => expect(ops()).toHaveLength(1));
    expect(ops()[0].data).toMatchObject({ name: "Old gym", archived_at: null });
    expect(await screen.findByText("เอาออกจากกรุแล้ว")).toBeTruthy();
  });

  it("เอาออกจากกรุตอนครบ 30 แห่ง = ข้อความเพดาน ไม่เขียนอะไร", async () => {
    const full = Array.from({ length: 30 }, (_, i) => place(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `P${i}`));
    await open([...full, place(ID_C, "Old gym", { archived_at: "2026-02-02T00:00:00.000Z" })]);
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "ในกรุ · 1" }));
    fireEvent.click(screen.getByRole("button", { name: "เอาออกจากกรุ" }));
    expect(await screen.findAllByText("ครบ 30 แห่งแล้ว")).not.toHaveLength(0);
    expect(ops()).toHaveLength(0);
  });

  it("แก้ชื่อ: บันทึกปิดจนเปลี่ยน · มีหมายเหตุประวัติเก่า · เข้าคิวชื่อใหม่ (ออฟไลน์ก็ได้)", async () => {
    online.value = false;
    await open();
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    const dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    expect(within(dialog).getByText("เปลี่ยนชื่อแล้ว ประวัติเก่าจะแสดงชื่อใหม่ด้วย")).toBeTruthy();
    const save = within(dialog).getByRole("button", { name: "บันทึก" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("ชื่อ"), { target: { value: "Gym 2" } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(ops()[0].data).toMatchObject({ name: "Gym 2", map_url: null });
    expect(await screen.findByText("บันทึกแล้ว")).toBeTruthy();
    expect(screen.getByText("Gym 2")).toBeTruthy();
  });

  it("เก็บเข้ากรุทำทันที · เหลือแห่งเดียว = ปิด + ข้อความ ", async () => {
    await open();
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "เก็บเข้ากรุ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(String(ops()[0].data?.archived_at)).toMatch(/^\d{4}-/);
    expect(await screen.findByText("เก็บเข้ากรุแล้ว")).toBeTruthy();
    fireEvent.click(screen.getByText("Home"));
    const dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    expect((within(dialog).getByRole("button", { name: "เก็บเข้ากรุ" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText("ต้องมีสถานที่อย่างน้อย 1 แห่ง")).toBeTruthy();
  });

  it("เพิ่มสถานที่: ไม่เลือกให้ (last_used_at ว่าง) + ข้อความ", async () => {
    await open();
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "+ เพิ่มสถานที่" }));
    const dialog = screen.getByRole("dialog", { name: "เพิ่มสถานที่" });
    fireEvent.change(within(dialog).getByLabelText("ชื่อ"), { target: { value: "Park" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "เพิ่ม" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(ops()[0].data).toEqual({ name: "Park", map_url: null, last_used_at: null, archived_at: null });
    expect(await screen.findByText("เพิ่มแล้ว")).toBeTruthy();
  });

  it("ครบ 30 แห่ง = ปุ่มเพิ่มปิด + ข้อความ", async () => {
    await open(Array.from({ length: 30 }, (_, i) => place(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `P${i}`)));
    renderWithIntl(<PlacesScreen />);
    expect(await screen.findByText("ครบ 30 แห่งแล้ว")).toBeTruthy();
    expect((screen.getByRole("button", { name: "+ เพิ่มสถานที่" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ออฟไลน์ที่มีข้อมูลในเครื่อง = เพิ่ม/แก้ได้ · ไม่เคยโหลดเลย = ต้องต่อเน็ต", async () => {
    online.value = false;
    await open();
    renderWithIntl(<PlacesScreen />);
    await screen.findByText("Home");
    expect(screen.queryByText("เพิ่มและแก้สถานที่ต้องต่อเน็ต")).toBeNull();
    expect((screen.getByRole("button", { name: "+ เพิ่มสถานที่" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    closeTestOffline();
    await openTestOffline({ snapshot: null });
    renderWithIntl(<PlacesScreen />);
    expect(await screen.findByText("ดูสถานที่ต้องต่อเน็ต")).toBeTruthy();
  });

  it("EN: ป้ายภาษาอังกฤษ", async () => {
    await open();
    renderWithIntl(<PlacesScreen />, "en");
    expect(await screen.findByText("Last used")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Add a place" })).toBeTruthy();
  });
});

describe("D8 · สถานที่ที่มีเซสชัน", () => {
  it("has_sessions จากเซิร์ฟเวอร์ = ไม่มีปุ่มลบ มีบรรทัดอธิบาย · เก็บเข้ากรุยังได้", async () => {
    await open([HOME(), place(ID_B, "Office gym", { has_sessions: true })]);
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    const dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    expect(within(dialog).queryByRole("button", { name: "ลบสถานที่นี้" })).toBeNull();
    expect(within(dialog).getByText("สถานที่นี้มีเซสชันแล้ว ลบไม่ได้ · เก็บเข้ากรุแทนได้")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "เก็บเข้ากรุ" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("สถานที่ของเซสชันที่เล่นอยู่ = ไม่มีปุ่มลบ · เก็บเข้ากรุปิด + 'กำลังเล่นที่นี่อยู่'", async () => {
    await open();
    await applySessionChange({ draft: newSessionDraft({ id: "22222222-2222-4222-8222-222222222222", placeId: ID_B, placeName: "Office gym", now: Date.now() }), writes: [] });
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    const dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    expect(within(dialog).queryByRole("button", { name: "ลบสถานที่นี้" })).toBeNull();
    expect((within(dialog).getByRole("button", { name: "เก็บเข้ากรุ" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText("กำลังเล่นที่นี่อยู่ · จบเซสชันก่อน")).toBeTruthy();
  });
});

const MAPS = "https://maps.app.goo.gl/abc123";

describe("CR3 · ลิงก์ Google Maps", () => {
  it("แถวที่มี map_url มีไอคอนหมุดเปิดแท็บใหม่ (noopener noreferrer) · ที่ไม่มี/ลิงก์ผิดไม่มี", async () => {
    await open([place(ID_A, "Home", { map_url: MAPS, last_used_at: "2026-02-01T00:00:00.000Z" }), GYM(), place(ID_C, "Bad", { map_url: "javascript:alert(1)" })]);
    renderWithIntl(<PlacesScreen />);
    await screen.findByText("Home");
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-label")?.startsWith("เปิดแผนที่"));
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(MAPS);
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[0].getAttribute("aria-label")).toBe("เปิดแผนที่ของ Home");
  });

  it("EN: ป้ายของไอคอนหมุด", async () => {
    await open([place(ID_A, "Home", { map_url: MAPS }), place(ID_B, "Gym")]);
    renderWithIntl(<PlacesScreen />, "en");
    expect(await screen.findByRole("link", { name: "Open map for Home" })).toBeTruthy();
  });

  it("แผ่นเลือกสถานที่บนหน้าหลักมีไอคอนหมุดด้วย", async () => {
    await open([place(ID_A, "Home", { map_url: MAPS, last_used_at: "2026-02-01T00:00:00.000Z" }), GYM()]);
    renderWithIntl(<PlaceChip />);
    fireEvent.click(await screen.findByRole("button", { name: /^เล่นที่ Home/ }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "เปิดแผนที่ของ Home" }).getAttribute("href")).toBe(MAPS);
  });

  it("แผ่นแก้: ช่องลิงก์มีคำแนะนำ · ลิงก์ผิดขึ้นข้อความใต้ช่องหลังออกจากช่อง และบันทึกไม่ได้", async () => {
    await open();
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    const dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    expect(within(dialog).getByText("คัดลอกจากปุ่มแชร์ใน Google Maps")).toBeTruthy();
    const field = within(dialog).getByLabelText("ลิงก์ Google Maps (ไม่บังคับ)");
    fireEvent.change(field, { target: { value: "http://maps.app.goo.gl/x" } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.blur(field);
    expect(within(dialog).getByRole("alert").textContent).toContain("ใช้ได้เฉพาะลิงก์ Google Maps");
    expect((within(dialog).getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("วางลิงก์แล้วบันทึก = เข้าคิว name + map_url (ตัดช่องว่าง) · ล้างลิงก์ = null", async () => {
    await open();
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    let dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    fireEvent.change(within(dialog).getByLabelText("ลิงก์ Google Maps (ไม่บังคับ)"), { target: { value: `  ${MAPS}  ` } });
    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(ops()[0].data).toMatchObject({ name: "Office gym", map_url: MAPS });
    expect(await screen.findByRole("link", { name: "เปิดแผนที่ของ Office gym" })).toBeTruthy();

    fireEvent.click(screen.getByText("Office gym"));
    dialog = screen.getByRole("dialog", { name: "แก้สถานที่" });
    fireEvent.change(within(dialog).getByLabelText("ลิงก์ Google Maps (ไม่บังคับ)"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(ops()[0].data?.map_url).toBeNull());
  });

  it("เปลี่ยนแต่ชื่อ = map_url เดิมไปด้วย (ส่งทั้งแถว)", async () => {
    await open([HOME(), place(ID_B, "Office gym", { map_url: MAPS })]);
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("ชื่อ"), { target: { value: "Gym 2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(ops()).toHaveLength(1));
    expect(ops()[0].data).toMatchObject({ name: "Gym 2", map_url: MAPS });
  });

  it("แผ่นเพิ่ม: ใส่ลิงก์ได้ · ลิงก์ผิดปิดปุ่มเพิ่ม", async () => {
    await open();
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "+ เพิ่มสถานที่" }));
    const dialog = screen.getByRole("dialog", { name: "เพิ่มสถานที่" });
    fireEvent.change(within(dialog).getByLabelText("ชื่อ"), { target: { value: "Park" } });
    const field = within(dialog).getByLabelText("ลิงก์ Google Maps (ไม่บังคับ)");
    fireEvent.change(field, { target: { value: "https://evil.com/maps/x" } });
    expect((within(dialog).getByRole("button", { name: "เพิ่ม" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: MAPS } });
    fireEvent.click(within(dialog).getByRole("button", { name: "เพิ่ม" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(ops()[0].data).toMatchObject({ name: "Park", map_url: MAPS });
  });
});

describe("CR3 · ลบสถานที่", () => {
  it("ลบ → หน้าต่างยืนยัน (ยกเลิกเป็นค่าเริ่ม) → เข้าคิว delete → หายจากรายการ + ข้อความ", async () => {
    await open();
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ลบสถานที่นี้" }));
    const confirm = screen.getByRole("dialog", { name: 'ลบ "Office gym"?' });
    expect(within(confirm).getByText(/ลบแล้วกู้คืนไม่ได้/)).toBeTruthy();
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "ยกเลิก" }));
    expect(ops()).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "ลบ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(ops()[0]).toMatchObject({ entity: "place", id: ID_B, action: "delete", data: null });
    expect(await screen.findByText("ลบแล้ว")).toBeTruthy();
    expect(screen.queryByText("Office gym")).toBeNull();
  });

  it("ยกเลิกในหน้าต่างยืนยัน = กลับแผ่นแก้ที่ยังมีค่าที่พิมพ์ไว้", async () => {
    await open();
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Office gym"));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("ชื่อ"), { target: { value: "Typed" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ลบสถานที่นี้" }));
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect((screen.getByLabelText("ชื่อ") as HTMLInputElement).value).toBe("Typed");
    expect(ops()).toHaveLength(0);
  });

  it("เหลือที่ใช้งานแห่งเดียว = ปุ่มลบปิด (กติกาเดียวกับเก็บเข้ากรุ)", async () => {
    await open([place(ID_A, "Home")]);
    renderWithIntl(<PlacesScreen />);
    fireEvent.click(await screen.findByText("Home"));
    expect((within(screen.getByRole("dialog")).getByRole("button", { name: "ลบสถานที่นี้" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ลบที่ที่ชิปหน้าหลักใช้อยู่ = ชิปย้ายไปที่ใช้ล่าสุดถัดไป", async () => {
    const places = [place(ID_A, "Home", { last_used_at: "2026-03-01T00:00:00.000Z" }), place(ID_B, "Office gym", { last_used_at: "2026-02-01T00:00:00.000Z" }), place(ID_C, "Park")];
    await open(places);
    renderWithIntl(<PlaceChip />);
    await screen.findByRole("button", { name: /^เล่นที่ Home/ });
    await act(async () => {
      const r = await deletePlace(places[0]);
      expect(r.ok).toBe(true);
    });
    expect(await screen.findByRole("button", { name: /^เล่นที่ Office gym/ })).toBeTruthy();
  });
});
