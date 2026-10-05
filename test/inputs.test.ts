import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ffmpegArgs } from "../src/encode.js";
import { loadGitSteps, parseGitRange } from "../src/inputs/git.js";
import { resolveOutput } from "../src/render.js";
import { parseSize } from "../src/sizes.js";

describe("parseSize", () => {
  it("resolves presets", () => {
    expect(parseSize(undefined)).toEqual({ width: 1920, height: 1080 });
    expect(parseSize("youtube")).toEqual({ width: 1920, height: 1080 });
    expect(parseSize("reel")).toEqual({ width: 1080, height: 1920 });
    expect(parseSize("Square")).toEqual({ width: 1080, height: 1080 });
  });

  it("parses WxH and rounds to even pixels", () => {
    expect(parseSize("1280x720")).toEqual({ width: 1280, height: 720 });
    expect(parseSize("801x601")).toEqual({ width: 802, height: 602 });
    expect(parseSize({ width: 640, height: 360 })).toEqual({ width: 640, height: 360 });
  });

  it("rejects nonsense", () => {
    expect(() => parseSize("huge")).toThrow(/Invalid size/);
    expect(() => parseSize("10x10")).toThrow(/between/);
  });
});

describe("resolveOutput", () => {
  it("infers the format from the extension", () => {
    expect(resolveOutput("a.gif")).toEqual({ output: "a.gif", format: "gif" });
    expect(resolveOutput("a.WEBM")).toEqual({ output: "a.WEBM", format: "webm" });
    expect(resolveOutput("a")).toEqual({ output: "a.mp4", format: "mp4" });
  });

  it("lets an explicit format win", () => {
    expect(resolveOutput("clip", "gif")).toEqual({ output: "clip.gif", format: "gif" });
    expect(() => resolveOutput("a.mp4", "avi")).toThrow(/Invalid format/);
    expect(() => resolveOutput("a.mov")).toThrow(/Cannot infer format/);
  });
});

describe("ffmpegArgs", () => {
  const base = { output: "o", fps: 30, width: 1280, height: 720 };
  it("encodes mp4 with h264/yuv420p and downscales supersampled frames", () => {
    const args = ffmpegArgs({ ...base, format: "mp4" }).join(" ");
    expect(args).toContain("libx264");
    expect(args).toContain("scale=1280:720:flags=lanczos,format=yuv420p");
  });
  it("uses vp9 for webm and a palette for gif", () => {
    expect(ffmpegArgs({ ...base, format: "webm" })).toContain("libvpx-vp9");
    expect(ffmpegArgs({ ...base, format: "gif" }).join(" ")).toContain("palettegen");
  });
});

describe("parseGitRange", () => {
  it("parses ranges and single commits", () => {
    expect(parseGitRange("HEAD~1..HEAD")).toEqual({ from: "HEAD~1", to: "HEAD" });
    expect(parseGitRange("abc123")).toEqual({ from: "abc123~1", to: "abc123" });
    expect(parseGitRange("HEAD..")).toEqual({ from: "HEAD", to: null });
    expect(() => parseGitRange("a...b")).toThrow(/Three-dot/);
    expect(() => parseGitRange("")).toThrow();
  });
});

describe("loadGitSteps", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd, stdio: "pipe" }).toString();

  it("builds one step per commit that touched the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "diffreel-git-"));
    git(dir, "init", "-q");
    writeFileSync(join(dir, "app.ts"), "let a = 1;\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "first");
    writeFileSync(join(dir, "app.ts"), "let a = 2;\n");
    git(dir, "commit", "-q", "-am", "second");
    writeFileSync(join(dir, "other.txt"), "x");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "unrelated");
    writeFileSync(join(dir, "app.ts"), "let a = 3;\n");
    git(dir, "commit", "-q", "-am", "third");

    const steps = await loadGitSteps({ range: "HEAD~3..HEAD", file: "app.ts", cwd: dir, commitCaptions: true });
    expect(steps.map((s) => s.code)).toEqual(["let a = 1;\n", "let a = 2;\n", "let a = 3;\n"]);
    expect(steps.map((s) => s.caption)).toEqual([undefined, "second", "third"]);
    expect(steps[0]).toMatchObject({ lang: "typescript", filename: "app.ts" });

    const single = await loadGitSteps({ range: "HEAD", file: "app.ts", cwd: dir });
    expect(single.map((s) => s.code)).toEqual(["let a = 2;\n", "let a = 3;\n"]);

    writeFileSync(join(dir, "app.ts"), "let a = 4;\n");
    const working = await loadGitSteps({ range: "HEAD..", file: "app.ts", cwd: dir });
    expect(working.map((s) => s.code)).toEqual(["let a = 3;\n", "let a = 4;\n"]);

    await expect(loadGitSteps({ range: "nope..HEAD", file: "app.ts", cwd: dir })).rejects.toThrow(/Unknown git revision/);
  });
});
