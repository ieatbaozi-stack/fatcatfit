// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { renderWithIntl } from "../test-utils";
import { InvitesScreen } from "./invites-screen";

const reload = vi.hoisted(() => vi.fn());
vi.mock("./invite-api", async (orig) => ({ ...(await orig<typeof import("./invite-api")>()), reloadPage: reload }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  label: "เพื่อนที่ออฟฟิศ",
  status: "active",
  usesCount: 0,
  maxUses: 1,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  createdAt: new Date().toISOString(),
  ...over,
});

const CREATED = {
  id: "new1",
  code: "ABCD-2345",
  label: "ป้ายใหม่",
  maxUses: 1,
  expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
};

let fetchMock: ReturnType<typeof vi.fn>;
let invites: unknown[];
const t = th.admin.invites;

function route(handlers: Record<string, () => Response | Promise<Response>> = {}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    if (handlers[key]) return handlers[key]();
    if (key === "GET /api/admin/invites") return json(200, { invites });
    throw new Error(`unexpected ${key}`);
  });
}
const calls = (key: string) =>
  fetchMock.mock.calls.filter((c) => `${(c[1] as RequestInit | undefined)?.method ?? "GET"} ${c[0]}` === key);
const writeText = () => navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>;

function stubNavigator(extra: Record<string, unknown> = {}) {
  vi.stubGlobal("navigator", {
    ...window.navigator,
    userAgent: window.navigator.userAgent,
    onLine: true,
    clipboard: { writeText: vi.fn(async () => {}) },
    ...extra,
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  invites = [];
  reload.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  stubNavigator();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fillAndCreate(label = "ป้ายใหม่") {
  fireEvent.change(await screen.findByLabelText(t.form.label), { target: { value: label } });
  fireEvent.click(screen.getByRole("button", { name: t.form.submit }));
}

describe("InvitesScreen · ฟอร์ม", () => {
  it("ปุ่มออกโค้ดปิดจนกว่าจะมีป้าย · ค่าเริ่ม 3 วัน / 1 คน · ชิปเป็น radiogroup", async () => {
    route();
    renderWithIntl(<InvitesScreen />);
    const submit = (await screen.findByRole("button", { name: t.form.submit })) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false"]);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.form.label), { target: { value: "  " } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(t.form.label), { target: { value: "เพื่อน" } });
    expect(submit.disabled).toBe(false);
  });

  it("ลูกศรเปลี่ยนชิปวัน", async () => {
    route();
    renderWithIntl(<InvitesScreen />);
    const radios = await screen.findAllByRole("radio");
    radios[1].focus();
    fireEvent.keyDown(radios[1], { key: "ArrowRight" });
    expect(screen.getAllByRole("radio")[2].getAttribute("aria-checked")).toBe("true");
  });

  it("ตัวนับขึ้นเมื่อพิมพ์ถึง 30 ตัว", async () => {
    route();
    renderWithIntl(<InvitesScreen />);
    const field = await screen.findByLabelText(t.form.label);
    fireEvent.change(field, { target: { value: "ก".repeat(29) } });
    expect(screen.queryByText("29/40")).toBeNull();
    fireEvent.change(field, { target: { value: "ก".repeat(32) } });
    expect(screen.getByText("32/40")).toBeTruthy();
  });

  it("ส่ง label/days/maxUses ตามที่เลือก แล้วแสดงกรอบครั้งเดียว + แถวใหม่บนสุด", async () => {
    route({
      "POST /api/admin/invites": () => {
        invites = [row({ id: "new1", label: "ป้ายใหม่" })];
        return json(201, CREATED);
      },
    });
    renderWithIntl(<InvitesScreen />);
    fireEvent.click((await screen.findAllByRole("radio"))[2]); // 7 วัน
    fireEvent.click(screen.getByRole("button", { name: new RegExp(th.ui.increase) }));
    await fillAndCreate("  ป้ายใหม่  ");
    expect(await screen.findByText(t.result.title)).toBeTruthy();
    expect(JSON.parse(String(calls("POST /api/admin/invites")[0][1].body))).toEqual({ label: "ป้ายใหม่", days: 7, maxUses: 2 });
    expect(screen.getByText("ABCD-2345")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe(t.result.title);
    expect(screen.queryByLabelText(t.form.label)).toBeNull(); // ฟอร์มถูกแทนที่
    await waitFor(() => expect(document.getElementById("invite-row-new1")).toBeTruthy());
  });

  it("ออกอีกอัน = ฟอร์มเปล่าค่าเริ่ม", async () => {
    route({ "POST /api/admin/invites": () => json(201, CREATED) });
    renderWithIntl(<InvitesScreen />);
    await fillAndCreate();
    fireEvent.click(await screen.findByRole("button", { name: t.result.another }));
    const field = (await screen.findByLabelText(t.form.label)) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(screen.getAllByRole("radio")[1].getAttribute("aria-checked")).toBe("true");
  });

  it("ผิดพลาด: ข้อความ + ค่าที่กรอกยังอยู่ + ปุ่มเป็นลองใหม่", async () => {
    route({ "POST /api/admin/invites": () => json(500, { code: "x" }) });
    renderWithIntl(<InvitesScreen />);
    await fillAndCreate("ป้ายเดิม");
    expect(await screen.findByText(t.form.failed)).toBeTruthy();
    expect((screen.getByLabelText(t.form.label) as HTMLInputElement).value).toBe("ป้ายเดิม");
    expect(screen.getByRole("button", { name: t.form.retry })).toBeTruthy();
  });

  it("429: บอกเวลารอจาก X-Retry-After และปิดปุ่ม", async () => {
    route({ "POST /api/admin/invites": () => json(429, { code: "too_many_requests" }, { "X-Retry-After": "7500" }) });
    renderWithIntl(<InvitesScreen />);
    await fillAndCreate();
    expect(await screen.findByText(t.form.rateLimited.replace("{time}", "2 ชม. 5 นาที"))).toBeTruthy();
    expect((screen.getByRole("button", { name: t.form.submit }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("API ตอบ 404 = reload", async () => {
    route({ "POST /api/admin/invites": () => json(404, { code: "not_found" }) });
    renderWithIntl(<InvitesScreen />);
    await fillAndCreate();
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("รายการตอบ 404 = reload", async () => {
    route({ "GET /api/admin/invites": () => json(404, { code: "not_found" }) });
    renderWithIntl(<InvitesScreen />);
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});

describe("InvitesScreen · แชร์และคัดลอก", () => {
  async function reachResult(nav: Record<string, unknown>) {
    stubNavigator(nav);
    route({ "POST /api/admin/invites": () => json(201, CREATED) });
    renderWithIntl(<InvitesScreen />);
    await fillAndCreate();
    await screen.findByText(t.result.title);
  }

  it("มี share: เรียก share({ text }) อย่างเดียว · ข้อความมีลิงก์+โค้ด ไม่มีป้าย", async () => {
    const share = vi.fn(async () => {});
    await reachResult({ share });
    fireEvent.click(screen.getByRole("button", { name: t.result.share }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = (share.mock.calls[0] as unknown[])[0] as Record<string, string>;
    expect(Object.keys(arg)).toEqual(["text"]);
    expect(arg.text).toContain(`${window.location.origin}/welcome#invite=ABCD-2345`);
    expect(arg.text).not.toContain("ป้ายใหม่");
  });

  it("ผู้ใช้ยกเลิก (AbortError) = เงียบ ไม่คัดลอก ไม่ toast", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("x", "AbortError");
    });
    await reachResult({ share });
    fireEvent.click(screen.getByRole("button", { name: t.result.share }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    await act(async () => {});
    expect(writeText()).not.toHaveBeenCalled();
    expect(screen.queryByText(t.toast.messageCopied)).toBeNull();
  });

  it("share reject แบบอื่น = คัดลอกข้อความเชิญ + toast", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("x", "NotAllowedError");
    });
    await reachResult({ share });
    fireEvent.click(screen.getByRole("button", { name: t.result.share }));
    expect(await screen.findByText(t.toast.messageCopied)).toBeTruthy();
    expect(writeText().mock.calls[0][0]).toContain("ABCD-2345");
  });

  it("ไม่มี share: ปุ่มหลักเป็นคัดลอกข้อความเชิญ · คัดลอกลิงก์/โค้ดได้เนื้อหาถูก", async () => {
    await reachResult({ share: undefined });
    expect(screen.queryByRole("button", { name: t.result.share })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.result.copyMessage }));
    expect(await screen.findByText(t.toast.messageCopied)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.result.copyLink }));
    await waitFor(() => expect(writeText().mock.calls[1][0]).toBe(`${window.location.origin}/welcome#invite=ABCD-2345`));
    fireEvent.click(screen.getByRole("button", { name: t.result.copyCode }));
    await waitFor(() => expect(writeText().mock.calls[2][0]).toBe("ABCD-2345"));
  });

  it("คัดลอกไม่ได้ = toast บอก", async () => {
    await reachResult({ share: undefined, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("no"))) } });
    fireEvent.click(screen.getByRole("button", { name: t.result.copyCode }));
    expect(await screen.findByText(t.toast.copyFailed)).toBeTruthy();
  });

  it("ข้อความแชร์ภาษา EN ตามภาษาของแอป", async () => {
    stubNavigator({ share: undefined });
    route({ "POST /api/admin/invites": () => json(201, CREATED) });
    renderWithIntl(<InvitesScreen />, "en");
    fireEvent.change(await screen.findByLabelText(en.admin.invites.form.label), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: en.admin.invites.form.submit }));
    fireEvent.click(await screen.findByRole("button", { name: en.admin.invites.result.copyMessage }));
    await waitFor(() => expect(writeText().mock.calls[0][0]).toMatch(/^Join me on Fat Cat Fit/));
  });

  it("ไม่เก็บโค้ดใน storage ใดๆ", async () => {
    await reachResult({ share: undefined });
    for (const s of [window.localStorage, window.sessionStorage]) {
      expect(JSON.stringify({ ...s })).not.toContain("ABCD");
    }
  });
});

describe("InvitesScreen · back/forward cache", () => {
  async function reachResult() {
    route({ "POST /api/admin/invites": () => json(201, CREATED) });
    renderWithIntl(<InvitesScreen />);
    await fillAndCreate();
    await screen.findByText("ABCD-2345");
  }

  it("pageshow ที่ persisted = ล้างโค้ดที่เพิ่งออก กลับเป็นฟอร์มเปล่า และโหลดรายการใหม่", async () => {
    await reachResult();
    await waitFor(() => expect(calls("GET /api/admin/invites").length).toBeGreaterThanOrEqual(2));
    const before = calls("GET /api/admin/invites").length;
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    expect(screen.queryByText("ABCD-2345")).toBeNull();
    expect(((await screen.findByLabelText(t.form.label)) as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(calls("GET /api/admin/invites").length).toBeGreaterThan(before));
  });

  it("pageshow ปกติ (ไม่ persisted) ไม่แตะโค้ด", async () => {
    await reachResult();
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    });
    expect(screen.getByText("ABCD-2345")).toBeTruthy();
  });

  it("pagehide ที่ persisted = ล้างโค้ดก่อนหน้าถูกแช่แข็ง", async () => {
    await reachResult();
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    });
    expect(screen.queryByText("ABCD-2345")).toBeNull();
  });
});

describe("InvitesScreen · รายการและเพิกถอน", () => {
  it("แสดงสถานะเป็นคำ · ปุ่มเพิกถอนเฉพาะ active", async () => {
    invites = [
      row({ id: "a", label: "แถวหนึ่ง", status: "active" }),
      row({ id: "b", label: "ครบ", status: "exhausted", usesCount: 1 }),
      row({ id: "c", label: "หมด", status: "expired" }),
      row({ id: "d", label: "ถอน", status: "revoked" }),
    ];
    route();
    renderWithIntl(<InvitesScreen />);
    for (const w of [t.status.active, t.status.exhausted, t.status.expired, t.status.revoked]) {
      expect((await screen.findAllByText(w)).length).toBeGreaterThan(0);
    }
    const revokes = screen.getAllByRole("button", { name: /^เพิกถอน / });
    expect(revokes).toHaveLength(1);
    expect(revokes[0].getAttribute("aria-label")).toBe("เพิกถอน แถวหนึ่ง");
  });

  it("โหลดไม่ได้ = ข้อความ + ลองใหม่ (ฟอร์มยังใช้ได้) · ว่าง = ข้อความว่าง", async () => {
    route({ "GET /api/admin/invites": () => json(500) });
    renderWithIntl(<InvitesScreen />);
    expect(await screen.findByText(t.list.loadFailed)).toBeTruthy();
    expect(screen.getByLabelText(t.form.label)).toBeTruthy();
    invites = [];
    route();
    fireEvent.click(screen.getByRole("button", { name: t.list.retry }));
    expect(await screen.findByText(t.list.empty)).toBeTruthy();
  });

  it("เพิกถอน: แผ่นยืนยัน focus เริ่มที่ยกเลิก · ยืนยัน → เพิกถอนแล้ว + toast", async () => {
    invites = [row({ id: "a", label: "เพื่อน" })];
    route({ "POST /api/admin/invites/a/revoke": () => json(200, { result: "revoked" }) });
    renderWithIntl(<InvitesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "เพิกถอน เพื่อน" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(t.revoke.title.replace("{label}", "เพื่อน"))).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: t.revoke.cancel }));
    fireEvent.click(within(dialog).getByRole("button", { name: t.revoke.confirm }));
    // toast + สถานะในแถว ใช้คำเดียวกัน (เพิกถอนแล้ว)
    await waitFor(() => expect(screen.getAllByText(t.toast.revoked)).toHaveLength(2));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(document.getElementById("invite-row-a")!).getByText(t.status.revoked)).toBeTruthy();
  });

  it("Esc ปิดแผ่นโดยไม่เรียก API", async () => {
    invites = [row({ id: "a", label: "เพื่อน" })];
    route();
    renderWithIntl(<InvitesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "เพิกถอน เพื่อน" }));
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls("POST /api/admin/invites/a/revoke")).toHaveLength(0);
  });

  it("ล้มเหลว: แผ่นยังเปิด + ลองใหม่ · unchanged: toast และโหลดรายการใหม่", async () => {
    invites = [row({ id: "a", label: "เพื่อน" })];
    route({ "POST /api/admin/invites/a/revoke": () => json(500) });
    renderWithIntl(<InvitesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "เพิกถอน เพื่อน" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: t.revoke.confirm }));
    expect(await screen.findByText(t.revoke.failed)).toBeTruthy();
    route({ "POST /api/admin/invites/a/revoke": () => json(200, { result: "unchanged" }) });
    fireEvent.click(screen.getByRole("button", { name: t.revoke.retry }));
    expect(await screen.findByText(t.toast.alreadyInactive)).toBeTruthy();
    await waitFor(() => expect(calls("GET /api/admin/invites").length).toBeGreaterThanOrEqual(2));
  });

  it("เพิกถอนตอบ 404 = reload", async () => {
    invites = [row({ id: "a", label: "เพื่อน" })];
    route({ "POST /api/admin/invites/a/revoke": () => json(404, { code: "not_found" }) });
    renderWithIntl(<InvitesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "เพิกถอน เพื่อน" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: t.revoke.confirm }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});

describe("InvitesScreen · ออฟไลน์", () => {
  it("ออฟไลน์ ยังไม่มีอะไรให้ดู = จอแมว #24 ไม่มีฟอร์ม ไม่เรียก API", async () => {
    stubNavigator({ onLine: false });
    route();
    const { container } = renderWithIntl(<InvitesScreen />);
    expect(await screen.findByText(t.offline.title)).toBeTruthy();
    expect(container.querySelector("svg[data-pose]")?.getAttribute("data-pose")).toBe("offline");
    expect(screen.queryByLabelText(t.form.label)).toBeNull();
    expect(screen.getAllByRole("link", { name: t.offline.back }).every((a) => a.getAttribute("href") === "/me")).toBe(true);
    expect(calls("GET /api/admin/invites")).toHaveLength(0);
  });
});

describe("หน้า server", () => {
  it("ใต้ (admin)/admin/invites มีแค่ page.tsx · ตรวจสิทธิ์แล้ว notFound · ไม่มี Suspense", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(import.meta.dirname, "../../app/(admin)/admin/invites");
    expect(readdirSync(dir)).toEqual(["page.tsx"]);
    const page = readFileSync(path.join(dir, "page.tsx"), "utf8");
    expect(page).toContain("requireAdmin(");
    expect(page).toContain("notFound()");
    const code = page
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/Suspense/);
  });

  it("layout (admin): ตรวจ cookie แล้ว 307 /welcome · ไม่มีแถบล่าง · ไม่มี loading/not-found/Suspense", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../../app/(admin)");
    expect(readdirSync(root).sort()).toEqual(["admin", "layout.tsx"]);
    const layout = readFileSync(path.join(root, "layout.tsx"), "utf8");
    const code = layout
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).toContain('redirect("/welcome")');
    expect(code).not.toMatch(/BottomTabs|Suspense/);
  });
});
