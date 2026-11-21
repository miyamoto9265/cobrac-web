// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_STORAGE, clampSidebarWidth, readSidebarWidth, sidebarWidthForKey } from "../src/lib/sidebarWidth";

describe("sidebar width", () => {
  afterEach(() => localStorage.clear());

  it("keeps the width between the minimum and the maximum", () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_WIDTH.min);
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_WIDTH.max);
    expect(clampSidebarWidth(300.4)).toBe(300);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH.default);
  });

  it("reads the remembered width, or the standard one when none or a broken one is stored", () => {
    expect(readSidebarWidth()).toBe(SIDEBAR_WIDTH.default);
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE, "320");
    expect(readSidebarWidth()).toBe(320);
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE, "abc");
    expect(readSidebarWidth()).toBe(SIDEBAR_WIDTH.default);
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE, "2000");
    expect(readSidebarWidth()).toBe(SIDEBAR_WIDTH.max);
  });

  it("moves with the arrow keys and jumps with Home, End and Enter", () => {
    expect(sidebarWidthForKey(256, "ArrowRight")).toBe(272);
    expect(sidebarWidthForKey(256, "ArrowLeft", true)).toBe(SIDEBAR_WIDTH.min);
    expect(sidebarWidthForKey(300, "Home")).toBe(SIDEBAR_WIDTH.min);
    expect(sidebarWidthForKey(300, "End")).toBe(SIDEBAR_WIDTH.max);
    expect(sidebarWidthForKey(300, "Enter")).toBe(SIDEBAR_WIDTH.default);
    expect(sidebarWidthForKey(300, "a")).toBeNull();
  });
});
