import { describe, expect, it } from "vitest";
import { autoFontSize, computeLayout, stepOffsetY } from "../src/layout.js";
import { parseSize } from "../src/sizes.js";

const base = { width: 1920, height: 1080, hasCaption: false, window: false, charRatio: 0.6 };

describe("computeLayout", () => {
  it("keeps the code inside the frame", () => {
    const L = computeLayout({ ...base, maxCols: 80, maxLines: 20 });
    expect(L.viewport.x).toBeGreaterThanOrEqual(0);
    expect(L.viewport.y).toBeGreaterThanOrEqual(0);
    expect(L.viewport.x + L.viewport.width).toBeLessThanOrEqual(1920);
    expect(L.viewport.y + L.viewport.height).toBeLessThanOrEqual(1080);
    // The longest line fits horizontally.
    expect(L.contentOffsetX + 80 * L.charWidth).toBeLessThanOrEqual(L.viewport.width + 0.5);
  });

  it("uses an explicit font size and derives char width and line height from it", () => {
    const L = computeLayout({ ...base, maxCols: 40, maxLines: 10, fontSize: 30 });
    expect(L.fontSize).toBe(30);
    expect(L.charWidth).toBeCloseTo(18);
    expect(L.lineHeight).toBe(48);
  });

  it("shrinks the font for longer lines", () => {
    const short = computeLayout({ ...base, maxCols: 40, maxLines: 10 });
    const long = computeLayout({ ...base, maxCols: 120, maxLines: 10 });
    expect(long.fontSize).toBeLessThan(short.fontSize);
  });

  it("reserves space for captions below the code", () => {
    const L = computeLayout({ ...base, maxCols: 40, maxLines: 10, hasCaption: true });
    expect(L.caption).not.toBeNull();
    expect(L.viewport.y + L.viewport.height).toBeLessThanOrEqual(L.caption!.y);
  });

  it("sizes and centers a window card around the code", () => {
    const L = computeLayout({ ...base, window: true, maxCols: 30, maxLines: 6 });
    expect(L.titleBarHeight).toBeGreaterThan(0);
    expect(L.card.width).toBeLessThan(1920);
    expect(Math.abs(L.card.x + L.card.width / 2 - 960)).toBeLessThanOrEqual(1);
    expect(L.viewport.y).toBeGreaterThanOrEqual(L.card.y + L.titleBarHeight);
  });

  it("works for portrait reels", () => {
    const { width, height } = parseSize("reel");
    const L = computeLayout({ ...base, width, height, maxCols: 50, maxLines: 30 });
    expect(L.viewport.x + L.viewport.width).toBeLessThanOrEqual(width);
    expect(L.fontSize).toBeGreaterThan(10);
  });
});

describe("autoFontSize", () => {
  const opts = { availWidth: 1000, availHeight: 600, charRatio: 0.6, lineHeightRatio: 1.6, shortSide: 1080 };

  it("fits all lines when that stays readable", () => {
    const fs = autoFontSize({ ...opts, maxCols: 30, maxLines: 12 });
    expect(12 * fs * 1.6).toBeLessThanOrEqual(600 + 1);
    expect(fs).toBeGreaterThan(30);
  });

  it("keeps a readable size and scrolls instead of shrinking for very long files", () => {
    const fs = autoFontSize({ ...opts, maxCols: 30, maxLines: 400 });
    expect(fs).toBeGreaterThanOrEqual(1080 / 42 - 0.5);
  });
});

describe("stepOffsetY", () => {
  const L = computeLayout({ ...base, maxCols: 40, maxLines: 10, fontSize: 20 });

  it("centers code that fits", () => {
    const y = stepOffsetY({ layout: L, maxLines: 10, stepLines: 10, focus: null, previous: 0 });
    expect(y).toBe(Math.round((L.viewport.height - 10 * L.lineHeight) / 2));
  });

  it("scrolls long code so the focused lines are centered", () => {
    const lines = 200;
    const y = stepOffsetY({ layout: L, maxLines: lines, stepLines: lines, focus: [100, 102], previous: 0 });
    const focusCenter = 101.5 * L.lineHeight + y;
    expect(Math.abs(focusCenter - L.viewport.height / 2)).toBeLessThanOrEqual(1);
  });

  it("never scrolls past the start or end", () => {
    const top = stepOffsetY({ layout: L, maxLines: 200, stepLines: 200, focus: [0, 0], previous: 0 });
    expect(top).toBe(-0);
    const bottom = stepOffsetY({ layout: L, maxLines: 200, stepLines: 200, focus: [199, 199], previous: 0 });
    expect(bottom).toBe(-(200 * L.lineHeight - L.viewport.height));
  });

  it("keeps the previous scroll position when nothing changed", () => {
    const y = stepOffsetY({ layout: L, maxLines: 200, stepLines: 200, focus: null, previous: -300 });
    expect(y).toBe(-300);
  });
});
