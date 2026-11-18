// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOnline, useOnline } from "./use-online";

function setOnLine(value: boolean, fire = true) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
  if (fire) {
    act(() => {
      window.dispatchEvent(new Event(value ? "online" : "offline"));
    });
  }
}

function Probe() {
  return <span data-testid="net">{useOnline() ? "online" : "offline"}</span>;
}

beforeEach(() => setOnLine(true, false));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useOnline", () => {
  it("ตามสถานะ navigator.onLine ตอน mount", () => {
    setOnLine(false, false);
    render(<Probe />);
    expect(screen.getByTestId("net").textContent).toBe("offline");
  });

  it("เปลี่ยนตามเหตุการณ์ offline/online", () => {
    render(<Probe />);
    expect(screen.getByTestId("net").textContent).toBe("online");
    setOnLine(false);
    expect(screen.getByTestId("net").textContent).toBe("offline");
    setOnLine(true);
    expect(screen.getByTestId("net").textContent).toBe("online");
  });

  it("ถอด listener เมื่อ unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Probe />);
    unmount();
    const names = remove.mock.calls.map((c) => c[0]);
    expect(names).toContain("online");
    expect(names).toContain("offline");
    remove.mockRestore();
  });

  it("SSR คืน true เสมอ (แม้เครื่องออฟไลน์)", () => {
    setOnLine(false, false);
    expect(renderToString(<Probe />)).toContain("online");
    expect(renderToString(<Probe />)).not.toContain("offline");
  });

  it("readOnline: ไม่มี navigator = ออนไลน์", () => {
    vi.stubGlobal("navigator", undefined);
    expect(readOnline()).toBe(true);
  });
});
