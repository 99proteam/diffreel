import { describe, expect, it } from "vitest";
import { alignLines, matchTokens, planTransition } from "../src/diff.js";
import { lines } from "./helpers.js";

describe("alignLines", () => {
  it("matches identical snapshots line by line", () => {
    const a = ["a", "b", "c"];
    const result = alignLines(a, a);
    expect(result.common).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(result.blocks).toEqual([]);
    expect(result.moved).toEqual([]);
  });

  it("records an insertion as an added-only block and shifts later lines", () => {
    const result = alignLines(["a", "c"], ["a", "b", "c"]);
    expect(result.common).toEqual([
      [0, 0],
      [1, 2],
    ]);
    expect(result.blocks).toEqual([{ removed: [], added: [1] }]);
  });

  it("records a deletion as a removed-only block", () => {
    const result = alignLines(["a", "b", "c"], ["a", "c"]);
    expect(result.blocks).toEqual([{ removed: [1], added: [] }]);
  });

  it("groups adjacent removals and additions into one replacement block", () => {
    const result = alignLines(["head", "old 1", "old 2", "tail"], ["head", "new 1", "tail"]);
    expect(result.common).toEqual([
      [0, 0],
      [3, 2],
    ]);
    expect(result.blocks).toEqual([{ removed: [1, 2], added: [1] }]);
  });

  it("detects lines that only changed indentation as moved", () => {
    const before = ["doWork();", "done();"];
    const after = ["if (ready) {", "  doWork();", "}", "done();"];
    const result = alignLines(before, after);
    expect(result.moved).toEqual([[0, 1]]);
    expect(result.blocks).toEqual([{ removed: [], added: [0, 2] }]);
  });

  it("detects lines moved to another place in the file", () => {
    const before = ["const a = 1;", "const b = 2;", "const c = 3;"];
    const after = ["const b = 2;", "const c = 3;", "const a = 1;"];
    const result = alignLines(before, after);
    expect(result.moved).toEqual([[0, 2]]);
    expect(result.blocks).toEqual([]);
  });

  it("does not treat trivial lines like braces as moved", () => {
    const result = alignLines(["}", "x();"], ["x();", "}"]);
    expect(result.moved).toEqual([]);
  });
});

describe("matchTokens", () => {
  const toks = (s: string) => s.split(" ").map((text) => ({ text }));

  it("pairs common tokens in order and reports the rest", () => {
    const result = matchTokens(toks("let total = 0"), toks("let sum = 0"));
    expect(result.pairs).toEqual([
      [0, 0],
      [2, 2],
      [3, 3],
    ]);
    expect(result.removed).toEqual([1]);
    expect(result.added).toEqual([1]);
  });

  it("can require matching colors so code never matches text inside strings", () => {
    const before = [{ text: "for", color: "#f00" }];
    const after = [{ text: "for", color: "#0f0" }];
    expect(matchTokens(before, after).pairs).toEqual([[0, 0]]);
    expect(matchTokens(before, after, { byColor: true })).toEqual({ pairs: [], removed: [0], added: [0] });
  });

  it("drops punctuation matches that have no matched neighbor when anchoring", () => {
    const before = toks("a ( b ; c");
    const after = toks("x ( y z ; c");
    const anchored = matchTokens(before, after, { anchorPunctuation: true });
    // "(" has no matched neighbor; "; c" anchor each other.
    expect(anchored.pairs).toEqual([
      [3, 4],
      [4, 5],
    ]);
    expect(anchored.removed).toEqual([0, 1, 2]);
  });

  it("handles empty sequences", () => {
    expect(matchTokens([], toks("a b"))).toEqual({ pairs: [], removed: [], added: [0, 1] });
    expect(matchTokens(toks("a b"), [])).toEqual({ pairs: [], removed: [0, 1], added: [] });
  });
});

describe("planTransition", () => {
  it("moves matching tokens inside a changed line instead of retyping it", () => {
    const plan = planTransition(lines("for (i = 0; i <= n; i++)"), lines("for (i = 0; i < n; i++)"));
    expect(plan.removed.map((t) => t.text)).toEqual(["="]);
    expect(plan.added).toEqual([]);
    const n = plan.matched.find((p) => p.from.text === "n")!;
    expect(n.from.col).toBe(17);
    expect(n.to.col).toBe(16);
    expect(plan.changedLines).toEqual([0]);
  });

  it("slides unchanged lines to their new rows when code is inserted above", () => {
    const plan = planTransition(lines("a();\nb();"), lines("setup();\na();\nb();"));
    const b = plan.matched.find((p) => p.from.text === "b")!;
    expect(b.from.line).toBe(1);
    expect(b.to.line).toBe(2);
    expect(plan.added.map((t) => t.text)).toEqual(["setup", "(", ")", ";"]);
    expect(plan.changedLines).toEqual([0]);
  });

  it("keeps re-indented lines as moved tokens", () => {
    const plan = planTransition(lines("run();"), lines("if (ok) {\n  run();\n}"));
    const run = plan.matched.find((p) => p.from.text === "run")!;
    expect(run.from).toMatchObject({ line: 0, col: 0 });
    expect(run.to).toMatchObject({ line: 1, col: 2 });
    expect(plan.removed).toEqual([]);
  });

  it("accounts for every token exactly once", () => {
    const before = lines("function add(a, b) {\n  return a + b;\n}");
    const after = lines("const add = (a: number, b: number) =>\n  a + b;");
    const plan = planTransition(before, after);
    const beforeCount = before.reduce((n, l) => n + l.tokens.length, 0);
    const afterCount = after.reduce((n, l) => n + l.tokens.length, 0);
    expect(plan.matched.length + plan.removed.length).toBe(beforeCount);
    expect(plan.matched.length + plan.added.length).toBe(afterCount);
  });

  it("reports nothing changed for identical code", () => {
    const code = lines("x = 1\ny = 2");
    const plan = planTransition(code, code);
    expect(plan.removed).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.changedLines).toEqual([]);
  });
});
