import { describe, expect, it } from "vitest";
import { gutterColumns, parseFocus } from "../src/focus.js";
import { computeLayout } from "../src/layout.js";
import { buildTimeline, DIM_AMOUNT, frameAt, type Timeline } from "../src/timeline.js";
import { lines } from "./helpers.js";

describe("parseFocus", () => {
  it("parses 1-based lines and ranges into sorted 0-based indexes", () => {
    expect(parseFocus("3", 10)).toEqual([2]);
    expect(parseFocus("8, 2-4", 10)).toEqual([1, 2, 3, 7]);
    expect(parseFocus("9-", 10)).toEqual([8, 9]);
    expect(parseFocus([4, 2, 2], 10)).toEqual([1, 3]);
  });

  it("drops lines past the end of the step", () => {
    expect(parseFocus("2-20", 3)).toEqual([1, 2]);
    expect(parseFocus([7], 3)).toEqual([]);
  });

  it.each([
    ["", /at least one line/],
    ["a-b", /not a line or range/],
    ["0", /start at 1/],
    ["5-2", /backwards/],
  ])("rejects %j", (spec, message) => {
    expect(() => parseFocus(spec, 10)).toThrow(message);
  });

  it("rejects non-integer arrays", () => {
    expect(() => parseFocus([1.5], 10)).toThrow(/whole numbers/);
  });
});

describe("gutterColumns", () => {
  it("fits the widest number plus two spaces", () => {
    expect(gutterColumns(9)).toBe(3);
    expect(gutterColumns(10)).toBe(4);
    expect(gutterColumns(120)).toBe(5);
  });
});

const layout = computeLayout({ width: 1280, height: 720, maxCols: 40, maxLines: 5, hasCaption: false, window: false, charRatio: 0.6, fontSize: 20 });
const twoSteps = [
  { lines: lines("a = 1\nb = 2\nc = 3"), hold: 1000, transition: 0 },
  { lines: lines("a = 1\nb = 20\nc = 3\nd = 4"), hold: 1000, transition: 1000 },
];

/** Opacity of every token on `line` in a hold segment's frame. */
function holdOpacities(tl: Timeline, segment: number, t: number, line: number): number[] {
  const seg = tl.segments[segment]!;
  if (seg.kind !== "hold") throw new Error("expected hold");
  return frameAt(tl, t)
    .items.filter((_, i) => seg.tokens[i]!.line === line)
    .map((i) => i[2]);
}

describe("line numbers", () => {
  it("shifts code right by the gutter and numbers every line", () => {
    const plain = buildTimeline({ steps: twoSteps, layout });
    const numbered = buildTimeline({ steps: twoSteps, layout, lineNumbers: true });
    expect(numbered.lineNumberDigits).toBe(1);
    const x0 = frameAt(plain, 0).items[0]![0];
    const x1 = frameAt(numbered, 0).items[0]![0];
    expect(x1 - x0).toBeCloseTo(3 * layout.charWidth, 1);
    expect(frameAt(numbered, 0).lineNumbers).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(frameAt(plain, 0).lineNumbers).toEqual([]);
  });

  it("fades in the numbers of new lines during a transition", () => {
    const tl = buildTimeline({ steps: twoSteps, layout, lineNumbers: true });
    const seg = tl.segments[1]!;
    const start = frameAt(tl, seg.start).lineNumbers;
    const end = frameAt(tl, seg.start + seg.duration - 1).lineNumbers;
    expect(start).toHaveLength(4);
    expect(start[3]![1]).toBe(0);
    expect(end[3]![1]).toBeGreaterThan(0.95);
    expect(frameAt(tl, tl.durationMs - 1).lineNumbers).toHaveLength(4);
  });
});

describe("focus and dim", () => {
  const dimmed = Number((1 - DIM_AMOUNT).toFixed(3));

  it("dims lines outside an explicit focus while the step is held", () => {
    const tl = buildTimeline({ steps: [{ ...twoSteps[0]!, focus: [1] }], layout, lineNumbers: true });
    // Dimming eases in, so the first frame is still fully bright.
    expect(Math.min(...frameAt(tl, 0).items.map((i) => i[2]))).toBe(1);
    expect(holdOpacities(tl, 0, 900, 1).every((o) => o === 1)).toBe(true);
    expect(holdOpacities(tl, 0, 900, 0).every((o) => o === dimmed)).toBe(true);
    expect(frameAt(tl, 900).lineNumbers.map((n) => n[1])).toEqual([dimmed, 1, dimmed]);
  });

  it("focuses changed lines automatically with focusChanges", () => {
    const tl = buildTimeline({ steps: twoSteps, layout, focusChanges: true });
    const [first, , last] = tl.segments;
    if (first?.kind !== "hold" || last?.kind !== "hold") throw new Error("expected holds");
    // The first step has nothing to compare against, so nothing is dimmed.
    expect(first.focus).toBeNull();
    expect(last.focus).toEqual([1, 3]);
  });

  it("brings dimmed lines back at the start of the next transition", () => {
    const tl = buildTimeline({ steps: [{ ...twoSteps[0]!, focus: [0] }, twoSteps[1]!], layout });
    const seg = tl.segments[1]!;
    if (seg.kind !== "transition") throw new Error("expected transition");
    const matched = (t: number) => frameAt(tl, t).items.filter((_, i) => seg.tokens[i]!.kind === "matched").map((i) => i[2]);
    expect(Math.min(...matched(seg.start))).toBeLessThan(0.5);
    expect(matched(seg.start + 400).every((o) => o === 1)).toBe(true);
  });
});
