import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import ffprobe from "ffprobe-static";
import { afterAll, describe, expect, it } from "vitest";
import { render } from "../src/index.js";

const outDir = join(import.meta.dirname, ".output");

function probe(file: string): { duration: number; width: number; height: number; codec: string } {
  const json = execFileSync(
    ffprobe.path,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name:format=duration", "-of", "json", file],
    { encoding: "utf8" },
  );
  const data = JSON.parse(json) as { streams: Array<{ width: number; height: number; codec_name: string }>; format: { duration: string } };
  const stream = data.streams[0]!;
  return { duration: Number(data.format.duration), width: stream.width, height: stream.height, codec: stream.codec_name };
}

describe("render (end to end)", () => {
  mkdirSync(outDir, { recursive: true });
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it(
    "renders a 2-second MP4 with the right duration and size",
    async () => {
      const output = join(outDir, "e2e.mp4");
      const result = await render({
        steps: [
          { code: "function add(a, b) {\n  return a + b;\n}", hold: 500 },
          { code: "function add(a: number, b: number): number {\n  return a + b;\n}\n\nadd(1, 2);", hold: 500, transition: 1000, caption: "Add types" },
        ],
        lang: "ts",
        output,
        size: "640x360",
        fps: 30,
        window: true,
        highlightChanges: true,
      });
      expect(result.durationMs).toBe(2000);
      expect(result.frames).toBe(60);
      expect(existsSync(output)).toBe(true);
      expect(statSync(output).size).toBeGreaterThan(1000);
      const info = probe(output);
      expect(info.codec).toBe("h264");
      expect(info.width).toBe(640);
      expect(info.height).toBe(360);
      expect(info.duration).toBeGreaterThan(1.95);
      expect(info.duration).toBeLessThan(2.05);
    },
    120_000,
  );
});
