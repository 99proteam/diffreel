import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStepsFile, parseSteps, StepsFileError } from "../src/inputs/steps-file.js";

const ctx = { baseDir: "/project", readFile: (p: string) => `// contents of ${p.replace(/\\/g, "/").split("/").pop()}` };

describe("parseSteps", () => {
  it("parses steps with code, captions and hold times", () => {
    const result = parseSteps(
      {
        lang: "ts",
        steps: [
          { code: "let a = 1;", caption: "Start", hold: 1500 },
          { code: ["let a = 1;", "let b = 2;"], transition: 600 },
        ],
      },
      ctx,
    );
    expect(result.options).toEqual({ lang: "ts" });
    expect(result.steps).toEqual([
      { code: "let a = 1;", caption: "Start", hold: 1500 },
      { code: "let a = 1;\nlet b = 2;", transition: 600 },
    ]);
  });

  it("accepts a bare array and plain string steps", () => {
    const result = parseSteps(["a", { code: "b" }], ctx);
    expect(result.steps.map((s) => s.code)).toEqual(["a", "b"]);
  });

  it("loads `file` steps relative to the steps file and detects their language", () => {
    const result = parseSteps({ steps: [{ file: "src/one.py" }] }, ctx);
    expect(result.steps[0]).toEqual({ code: "// contents of one.py", lang: "python", filename: "one.py" });
  });

  it("reads top-level render options", () => {
    const result = parseSteps(
      { steps: ["x"], theme: "nord", size: "reel", fps: 60, typing: true, window: true, filename: "app.tsx", format: "gif" },
      ctx,
    );
    expect(result.options).toEqual({ theme: "nord", size: "reel", fps: 60, typing: true, window: true, title: "app.tsx", format: "gif" });
  });

  it.each([
    [{}, /non-empty array/],
    [{ steps: [] }, /non-empty array/],
    [42, /JSON object/],
    [{ steps: [{}] }, /exactly one of "code" or "file"/],
    [{ steps: [{ code: "a", file: "b" }] }, /exactly one of/],
    [{ steps: [{ code: 5 }] }, /steps\[0\]\.code must be a string/],
    [{ steps: [{ code: "a", hold: -1 }] }, /steps\[0\]\.hold must be a non-negative number/],
    [{ steps: [{ code: "a", colour: "red" }] }, /unknown field "colour"/],
    [{ steps: ["a"], typing: "yes" }, /"typing" must be true or false/],
    [{ steps: ["a"], fps: 0 }, /"fps" must be a positive number/],
    [{ steps: ["a"], format: "avi" }, /"format" must be mp4, webm or gif/],
    [{ steps: ["a"], bogus: 1 }, /Unknown top-level field "bogus"/],
  ])("rejects invalid input %j", (input, message) => {
    expect(() => parseSteps(input, ctx)).toThrow(StepsFileError);
    expect(() => parseSteps(input, ctx)).toThrow(message);
  });

  it("reports unreadable files with the step index", () => {
    const failing = { baseDir: "/", readFile: () => { throw new Error("ENOENT"); } };
    expect(() => parseSteps({ steps: [{ file: "missing.ts" }] }, failing)).toThrow(/steps\[0\]\.file: cannot read "missing.ts"/);
  });
});

describe("loadStepsFile", () => {
  it("reads JSON from disk and resolves files next to it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "diffreel-steps-"));
    writeFileSync(join(dir, "v1.ts"), "export const v = 1;\n");
    writeFileSync(join(dir, "steps.json"), JSON.stringify({ steps: [{ file: "v1.ts" }, { code: "export const v = 2;" }] }));
    const result = await loadStepsFile(join(dir, "steps.json"));
    expect(result.steps[0]).toMatchObject({ code: "export const v = 1;\n", lang: "typescript" });
    expect(result.steps).toHaveLength(2);
  });

  it("explains invalid JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "diffreel-steps-"));
    writeFileSync(join(dir, "bad.json"), "{ steps: ");
    await expect(loadStepsFile(join(dir, "bad.json"))).rejects.toThrow(/not valid JSON/);
  });
});
