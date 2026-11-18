// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import th from "../../../messages/th.json";
import { renderWithIntl } from "../test-utils";
import { OnboardingScreen } from "./onboarding-screen";

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  replace = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { ...window.location, replace });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const type = (label: string, value: string) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const sent = () => fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));

function fillStep1() {
  type(th.onboarding.step1.weight, "72.4");
  type(th.onboarding.step1.height, "168");
  type(th.onboarding.step1.birthYear, "1994");
}

describe("OnboardingScreen", () => {
  it("ขั้น 1: ปุ่ม 'ต่อไป' ปิดจนกว่าช่องบังคับครบ", () => {
    renderWithIntl(<OnboardingScreen />);
    const next = screen.getByRole("button", { name: th.onboarding.next }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fillStep1();
    expect(next.disabled).toBe(false);
  });

  it("ค่านอกช่วงบอกใต้ช่อง และปุ่มยังปิด", () => {
    renderWithIntl(<OnboardingScreen />);
    fillStep1();
    type(th.onboarding.step1.weight, "5");
    expect(screen.getByRole("alert").textContent).toBe(th.onboarding.errors.outOfRange);
    expect((screen.getByRole("button", { name: th.onboarding.next }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("สลับชุดหน่วยแล้วแปลงค่า ไม่ล้าง · กลับจากขั้น 2 ค่าไม่หาย", () => {
    renderWithIntl(<OnboardingScreen />);
    fillStep1();
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.units.imperial }));
    expect((screen.getByLabelText(th.onboarding.step1.weight) as HTMLInputElement).value).toBe("159.6");
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.next }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.back }));
    expect((screen.getByLabelText(th.onboarding.step1.weight) as HTMLInputElement).value).toBe("159.6");
  });

  it("ชิปสถานที่เติมชื่อให้ แก้ต่อได้ · ส่งครั้งเดียวทั้งสองขั้น", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    renderWithIntl(<OnboardingScreen />);
    fillStep1();
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.next }));
    // ขั้น 1 → 2 เปลี่ยนในเครื่องเท่านั้น
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.place.kinds.gym }));
    const name = screen.getByLabelText(th.onboarding.place.name) as HTMLInputElement;
    expect(name.value).toBe(th.onboarding.place.kinds.gym);
    fireEvent.change(name, { target: { value: "ยิมใกล้บ้าน" } });
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.goals.stronger }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.experience.some }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.start }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = sent()[0];
    expect(body.place.name).toBe("ยิมใกล้บ้าน");
    expect(body.profile).toMatchObject({ goals: ["stronger"], experience: "some", weightUnit: "kg" });
    expect(body.place.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ส่งไม่สำเร็จ: ค่ายังอยู่ ปุ่มเป็น 'ลองใหม่' ลองซ้ำด้วย id เดิม", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("down")).mockResolvedValueOnce(json(200, { ok: true }));
    renderWithIntl(<OnboardingScreen />);
    fillStep1();
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.next }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.place.kinds.home }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.start }));
    const retry = await screen.findByRole("button", { name: th.onboarding.retry });
    expect(screen.getByRole("alert").textContent).toBe(th.onboarding.saveFailed);
    expect((screen.getByLabelText(th.onboarding.place.name) as HTMLInputElement).value).toBe(th.onboarding.place.kinds.home);
    fireEvent.click(retry);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    const [first, second] = sent();
    expect(second.place.id).toBe(first.place.id);
    expect(second.bodyEntry.id).toBe(first.bodyEntry.id);
  });

  it("ระหว่างส่ง ปุ่มกดซ้ำไม่ได้ (ส่งคำขอเดียว)", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (finish = r)));
    renderWithIntl(<OnboardingScreen />);
    fillStep1();
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.next }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.place.kinds.gym }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.start }));
    const busy = await screen.findByRole("button", { name: th.onboarding.saving });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(json(200, { ok: true }));
  });

  it("error จากเซิร์ฟเวอร์ใต้ช่อง + พากลับไปขั้นที่มีช่องนั้น", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { code: "invalid_input", fields: { "profile.birthYear": "out_of_range" } }));
    renderWithIntl(<OnboardingScreen />);
    fillStep1();
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.next }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.place.kinds.gym }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.start }));
    expect(await screen.findByLabelText(th.onboarding.step1.birthYear)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(th.onboarding.errors.outOfRange);
    expect((screen.getByLabelText(th.onboarding.step1.weight) as HTMLInputElement).value).toBe("72.4");
  });

  it("ออฟไลน์: ปุ่ม 'เริ่มใช้' ปิด แต่ยังกรอกต่อได้ (แถบเน็ตหลุดอยู่ที่ AuthGate)", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderWithIntl(<OnboardingScreen />);
    fillStep1();
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.next }));
    fireEvent.click(screen.getByRole("button", { name: th.onboarding.place.kinds.gym }));
    expect((screen.getByRole("button", { name: th.onboarding.start }) as HTMLButtonElement).disabled).toBe(true);
  });
});
