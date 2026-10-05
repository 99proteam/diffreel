import { describe, expect, it } from "vitest";
import { computeLayout } from "../src/layout.js";
import { buildTimeline, frameAt, mixColor, progress } from "../src/timeline.js";
import { lines } from "./helpers.js";

const layout = computeLayout({ width: 1280, height: 720, maxCols: 40, maxLines: 5, hasCaption: true, window: false, charRatio: 0.6, fontSize: 20 });

const steps = [
  { lines: lines("let x = 1;"), hold: 500, transition: 0, caption: "before" },
  { lines: lines("let x = 1;\nlet y = 2;"), hold: 500, transition: 1000, caption: "after" },
];

describe("buildTimeline", () => {
  it("lays out hold, transition, hold with the right total duration", () => {
    const tl = buildTimeline({ steps, layout });
    expect(tl.segments.map((s) => s.kind)).toEqual(["hold", "transition", "hold"]);
    expect(tl.durationMs).toBe(2000);
  });

  it("extends the transition when typing long additions", () => {
    const tl = buildTimeline({ steps, layout, typing: true, typingSpeed: 10 });
    const transition = tl.segments[1]!;
    expect(transition.duration).toBeGreaterThan(1000);
  });

  it("throws without steps", () => {
    expect(() => buildTimeline({ steps: [], layout })).toThrow();
  });
});

describe("frameAt", () => {
  const tl = buildTimeline({ steps, layout, highlightChanges: true });

  it("shows the first step fully at t=0", () => {
    const f = frameAt(tl, 0);
    expect(f.segment).toBe(0);
    expect(f.items.every((i) => i[2] === 1)).toBe(true);
    expect(f.captions).toEqual([["before", 1]]);
  });

  it("fades new tokens in during the transition", () => {
    const start = frameAt(tl, 500);
    const mid = frameAt(tl, 1300);
    const end = frameAt(tl, 1499);
    const added = (f: typeof start) => f.items.filter((_, i) => i >= 5).map((i) => i[2]);
    expect(Math.max(...added(start))).toBe(0);
    expect(Math.max(...added(mid))).toBeGreaterThan(0);
    expect(Math.min(...added(end))).toBeGreaterThan(0.95);
  });

  it("cross-fades captions", () => {
    const f = frameAt(tl, 1000);
    expect(f.captions.map((c) => c[0])).toEqual(["before", "after"]);
  });

  it("glows changed lines after the transition and fades the glow out", () => {
    const early = frameAt(tl, 1550);
    expect(early.glow).toEqual([[layout.lineHeight, 1]]);
    const late = frameAt(tl, 1999);
    expect(late.glow.length === 0 || late.glow[0]![1] < 0.2).toBe(true);
  });

  it("is deterministic", () => {
    expect(frameAt(tl, 1234)).toEqual(frameAt(tl, 1234));
  });

  it("moves matched tokens with easing from start to end positions", () => {
    const tl2 = buildTimeline({ steps: [{ lines: lines("b"), hold: 0, transition: 0 }, { lines: lines("a\nb"), hold: 0, transition: 1000 }], layout });
    const seg = tl2.segments[1]!;
    if (seg.kind !== "transition") throw new Error("expected transition");
    const idx = seg.tokens.findIndex((t) => t.kind === "matched");
    const y0 = frameAt(tl2, seg.start)!.items[idx]![1];
    const y1 = frameAt(tl2, seg.start + seg.duration - 0.001)!.items[idx]![1];
    expect(y0).toBe(0);
    expect(y1).toBeCloseTo(layout.lineHeight, 0);
  });

  it("types added tokens character by character with a caret", () => {
    const tl3 = buildTimeline({ steps, layout, typing: true, typingSpeed: 10 });
    const seg = tl3.segments[1]!;
    if (seg.kind !== "transition") throw new Error("expected transition");
    const mid = frameAt(tl3, seg.start + (seg.enter[0] + seg.enter[1]) / 2);
    expect(mid.caret).not.toBeNull();
    const partial = mid.items.filter((i) => i[3] >= 0);
    expect(partial.length).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("progress clamps to [0, 1]", () => {
    expect(progress(-5, [0, 10])).toBe(0);
    expect(progress(5, [0, 10])).toBe(0.5);
    expect(progress(50, [0, 10])).toBe(1);
    expect(progress(3, [3, 3])).toBe(1);
  });

  it("mixColor interpolates hex colors", () => {
    expect(mixColor("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixColor("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixColor("#000000", "#ffffff", 0.5)).toBe("rgba(128,128,128,1.000)");
    expect(mixColor("red", "blue", 0.4)).toBe("red");
  });
});
