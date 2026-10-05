import { mkdir, rm } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { openBrowser, type FrameBrowser } from "./browser.js";
import { createEncoder, type Encoder } from "./encode.js";
import { fontFaceCss } from "./fonts.js";
import { charCount, createTokenizer, type CodeLine } from "./highlight.js";
import { computeLayout } from "./layout.js";
import { buildHtml, measureHtml, MEASURE_SCRIPT } from "./page.js";
import { parseSize } from "./sizes.js";
import { buildTimeline, frameAt, segmentTokens, type FrameState } from "./timeline.js";
import type { OutputFormat, RenderOptions, RenderResult } from "./types.js";

export const DEFAULTS = {
  theme: "github-dark",
  fps: 30,
  transition: 900,
  hold: 2000,
  typingSpeed: 40,
  scale: 2,
} as const;

const FORMATS: readonly OutputFormat[] = ["mp4", "webm", "gif"];

/** Pick the output format from an explicit option or the file extension, and make the extension match. */
export function resolveOutput(output: string, format?: string): { output: string; format: OutputFormat } {
  const ext = extname(output).slice(1).toLowerCase();
  if (format !== undefined) {
    const f = format.toLowerCase() as OutputFormat;
    if (!FORMATS.includes(f)) throw new Error(`Invalid format "${format}". Use one of: ${FORMATS.join(", ")}.`);
    return { output: ext === f ? output : ext ? output : `${output}.${f}`, format: f };
  }
  if (FORMATS.includes(ext as OutputFormat)) return { output, format: ext as OutputFormat };
  if (ext) throw new Error(`Cannot infer format from "${output}". Use .mp4, .webm or .gif, or pass --format.`);
  return { output: `${output}.mp4`, format: "mp4" };
}

function positiveNumber(name: string, value: number | undefined, fallback: number, opts: { min?: number; max?: number } = {}): number {
  if (value === undefined) return fallback;
  const min = opts.min ?? 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || (opts.max !== undefined && value > opts.max)) {
    throw new Error(`Invalid ${name}: ${value}. Expected a number${opts.max !== undefined ? ` between ${min} and ${opts.max}` : ` >= ${min}`}.`);
  }
  return value;
}

/** Render code steps to a video file. */
export async function render(options: RenderOptions): Promise<RenderResult> {
  if (!options || !Array.isArray(options.steps) || options.steps.length === 0) {
    throw new Error("render() needs at least one step: { steps: [{ code }] }.");
  }
  if (!options.output) throw new Error("render() needs an output path.");
  options.steps.forEach((step, i) => {
    if (typeof step?.code !== "string") throw new Error(`steps[${i}].code must be a string.`);
  });

  const { output: outPath, format } = resolveOutput(options.output, options.format);
  const output = resolve(outPath);
  const size = parseSize(options.size);
  const fps = positiveNumber("fps", options.fps, DEFAULTS.fps, { min: 1, max: 120 });
  const transition = positiveNumber("transition", options.transition, DEFAULTS.transition);
  const hold = positiveNumber("hold", options.hold, DEFAULTS.hold);
  const typingSpeed = positiveNumber("typingSpeed", options.typingSpeed, DEFAULTS.typingSpeed, { min: 1 });
  const fontSize = options.fontSize === undefined ? undefined : positiveNumber("fontSize", options.fontSize, 0, { min: 4, max: 400 });
  // Keep the supersampled frame inside Chromium's texture limits.
  const maxScale = Math.max(1, Math.floor(8192 / Math.max(size.width, size.height)));
  const scale = Math.min(positiveNumber("scale", options.scale, DEFAULTS.scale, { min: 1, max: 4 }), maxScale);
  const theme = options.theme ?? DEFAULTS.theme;

  const steps = options.steps.map((step) => ({
    ...step,
    lang: step.lang ?? options.lang ?? "text",
    caption: step.caption ?? options.caption,
    filename: step.filename ?? options.title,
    hold: positiveNumber("hold", step.hold, hold),
    transition: positiveNumber("transition", step.transition, transition),
  }));

  const tokenizer = await createTokenizer(
    theme,
    steps.map((s) => s.lang),
  );
  let lines: CodeLine[][];
  try {
    lines = steps.map((s) => tokenizer.highlight(s.code, s.lang).lines);
  } finally {
    tokenizer.dispose();
  }
  const maxCols = Math.max(1, ...lines.flatMap((step) => step.map((l) => charCount(l.text))));
  const maxLines = Math.max(1, ...lines.map((step) => step.length));
  const hasCaption = steps.some((s) => Boolean(s.caption));

  await mkdir(dirname(output), { recursive: true });

  let browser: FrameBrowser | undefined;
  let encoder: Encoder | undefined;
  try {
    browser = await openBrowser({ width: size.width, height: size.height, scale });
    const { page } = browser;
    const fontCss = fontFaceCss();
    await page.setContent(measureHtml(fontCss, options.fontFamily));
    const charRatio = (await page.evaluate(`(${MEASURE_SCRIPT})()`)) as number;
    if (!Number.isFinite(charRatio) || charRatio <= 0) throw new Error("Could not measure the code font.");

    const layout = computeLayout({
      width: size.width,
      height: size.height,
      maxCols,
      maxLines,
      hasCaption,
      window: options.window ?? false,
      fontSize,
      charRatio,
    });
    await page.setContent(
      buildHtml({ layout, fontCss, theme: tokenizer.theme, fontFamily: options.fontFamily, background: options.background }),
    );
    await page.evaluate(`(${MEASURE_FONTS_READY})()`);

    const timeline = buildTimeline({
      steps: steps.map((s, i) => ({ lines: lines[i]!, caption: s.caption, filename: s.filename, hold: s.hold, transition: s.transition })),
      layout,
      typing: options.typing ?? false,
      typingSpeed,
      highlightChanges: options.highlightChanges ?? false,
    });

    const totalFrames = Math.max(1, Math.round((timeline.durationMs * fps) / 1000));
    encoder = createEncoder({ output, format, fps, width: size.width, height: size.height });

    let segment = -1;
    let lastKey = "";
    let lastFrame: Buffer | null = null;
    for (let frame = 0; frame < totalFrames; frame++) {
      const state: FrameState = frameAt(timeline, (frame * 1000) / fps);
      if (state.segment !== segment) {
        segment = state.segment;
        await page.evaluate((list) => (window as unknown as DiffreelWindow).__diffreel.setSegment(list), segmentTokens(timeline.segments[segment]!));
        lastKey = "";
      }
      const key = JSON.stringify(state.items) + JSON.stringify([state.offsetY, state.glow, state.caret, state.captions, state.filename]);
      if (key !== lastKey || !lastFrame) {
        await page.evaluate((s) => (window as unknown as DiffreelWindow).__diffreel.frame(s), state);
        lastFrame = await browser.capture();
        lastKey = key;
      }
      await encoder.write(lastFrame);
      options.onProgress?.({ frame: frame + 1, totalFrames, ratio: (frame + 1) / totalFrames });
    }
    await encoder.finish();
    encoder = undefined;

    return {
      output,
      format,
      width: size.width,
      height: size.height,
      fps,
      frames: totalFrames,
      durationMs: (totalFrames * 1000) / fps,
    };
  } catch (error) {
    encoder?.abort();
    await rm(output, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser?.close();
  }
}

const MEASURE_FONTS_READY = `async () => {
  await document.fonts.ready;
  const probe = document.createElement('span');
  probe.className = 't';
  document.body.appendChild(probe);
  const fam = getComputedStyle(probe).fontFamily;
  probe.remove();
  await Promise.all(['400 16px', '700 16px', 'italic 400 16px', 'italic 700 16px', '500 16px Inter', '600 16px Inter'].map((f) => document.fonts.load(f.includes('Inter') ? f : f + ' ' + fam).catch(() => null)));
}`;

interface DiffreelWindow {
  __diffreel: {
    setSegment(list: unknown): void;
    frame(state: unknown): void;
  };
}
