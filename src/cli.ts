import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { listThemes } from "./highlight.js";
import { loadGitSteps } from "./inputs/git.js";
import { loadStepsFile, stripBom, type StepsFileOptions } from "./inputs/steps-file.js";
import { detectLang } from "./lang.js";
import { DEFAULTS, render } from "./render.js";
import { SIZE_PRESETS } from "./sizes.js";
import type { OutputFormat, RenderOptions, Step } from "./types.js";

declare const __VERSION__: string | undefined;

const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : await readVersion();

async function readVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

function num(name: string, opts: { min?: number; integer?: boolean } = {}) {
  return (value: string): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < (opts.min ?? 0) || (opts.integer && !Number.isInteger(n))) {
      throw new InvalidArgumentError(`${name} must be a${opts.integer ? "n integer" : " number"} >= ${opts.min ?? 0}.`);
    }
    return n;
  };
}

interface CliOptions {
  output?: string;
  git?: string;
  file?: string;
  theme?: string;
  lang?: string;
  size?: string;
  fps?: number;
  fontSize?: number;
  fontFamily?: string;
  transition?: number;
  hold?: number;
  typing?: boolean;
  typingSpeed?: number;
  highlightChanges?: boolean;
  caption?: string;
  window?: boolean;
  title?: string;
  background?: string;
  format?: string;
  commitCaptions?: boolean;
  scale?: number;
  quiet?: boolean;
  listThemes?: boolean;
}

const program = new Command()
  .name("diffreel")
  .description("Turn code changes into smooth animated videos.")
  .version(VERSION, "-v, --version")
  .argument("[inputs...]", "two or more code files (before, after, ...) or one steps .json file")
  .option("-o, --output <file>", "output file; the extension picks the format", undefined)
  .option("--git <range>", "render a file's history from git, e.g. HEAD~1..HEAD, a commit, or HEAD.. for the working tree")
  .option("--file <path>", "file to follow with --git")
  .option("--theme <name>", `any Shiki theme (default ${DEFAULTS.theme})`)
  .option("--lang <id>", "language id (default: detected from the file extension)")
  .option("--size <size>", `preset (${Object.keys(SIZE_PRESETS).join(", ")}) or WIDTHxHEIGHT (default 1920x1080)`)
  .option("--fps <n>", `frames per second (default ${DEFAULTS.fps})`, num("--fps", { min: 1, integer: true }))
  .option("--font-size <px>", "code font size in px (default: auto-fit)", num("--font-size", { min: 4 }))
  .option("--font-family <name>", "code font family (JetBrains Mono is bundled)")
  .option("--transition <ms>", `transition duration in ms (default ${DEFAULTS.transition})`, num("--transition"))
  .option("--hold <ms>", `time each step stays on screen in ms (default ${DEFAULTS.hold})`, num("--hold"))
  .option("--typing", "type new code character by character instead of fading it in")
  .option("--no-typing", "fade new code in (overrides a steps file)")
  .option("--typing-speed <cps>", `typing speed in characters per second (default ${DEFAULTS.typingSpeed})`, num("--typing-speed", { min: 1 }))
  .option("--highlight-changes", "briefly glow changed lines after each transition")
  .option("--no-highlight-changes", "disable change highlighting (overrides a steps file)")
  .option("--caption <text>", "caption shown under the code (for steps without their own)")
  .option("--window", "draw a macOS-style window frame with a file name tab")
  .option("--no-window", "no window frame (overrides a steps file)")
  .option("--title <name>", "file name shown in the window tab")
  .option("--background <css>", "background color or CSS gradient")
  .option("--format <format>", "mp4, webm or gif (default: from the output extension, else mp4)")
  .option("--commit-captions", "with --git, use each commit message as the caption")
  .option("--scale <n>", `device scale factor for rendering (default ${DEFAULTS.scale})`, num("--scale", { min: 1 }))
  .option("-q, --quiet", "no progress output")
  .option("--list-themes", "print available themes and exit")
  .addHelpText(
    "after",
    `
Examples:
  $ diffreel before.ts after.ts -o out.mp4
  $ diffreel --git HEAD~1..HEAD --file src/app.ts -o out.mp4
  $ diffreel steps.json -o out.mp4 --size reel --window --typing
`,
  )
  .action(async (inputs: string[], opts: CliOptions) => {
    if (opts.listThemes) {
      console.log(listThemes().join("\n"));
      return;
    }
    await run(inputs, opts);
  });

async function isStepsJson(path: string): Promise<boolean> {
  if (!path.toLowerCase().endsWith(".json")) return false;
  try {
    const data: unknown = JSON.parse(stripBom(await readFile(path, "utf8")));
    return Array.isArray(data) || (typeof data === "object" && data !== null && "steps" in data);
  } catch {
    return true; // let the steps parser report the JSON error
  }
}

async function run(inputs: string[], opts: CliOptions): Promise<void> {
  let steps: Step[];
  let fileOptions: StepsFileOptions = {};
  let defaultTitle: string | undefined;
  let defaultOutput = "diffreel";

  if (opts.git) {
    const file = opts.file ?? (inputs.length === 1 ? inputs[0] : undefined);
    if (!file || inputs.length > 1 || (opts.file && inputs.length > 0)) {
      throw new Error("--git needs exactly one file: --git <range> --file <path>");
    }
    steps = await loadGitSteps({ range: opts.git, file, commitCaptions: opts.commitCaptions });
    defaultTitle = basename(file);
    defaultOutput = basename(file).replace(/\.[^.]+$/, "") || defaultOutput;
  } else if (inputs.length === 1 && (await isStepsJson(inputs[0]!))) {
    const parsed = await loadStepsFile(inputs[0]!);
    steps = parsed.steps;
    fileOptions = parsed.options;
    defaultOutput = basename(inputs[0]!).replace(/\.json$/i, "");
  } else if (inputs.length >= 1) {
    steps = await Promise.all(
      inputs.map(async (path) => {
        const code = await readFile(path, "utf8").catch((error: Error) => {
          throw new Error(`Cannot read "${path}": ${error.message}`);
        });
        const lang = detectLang(path);
        return { code, ...(lang !== "text" ? { lang } : {}) };
      }),
    );
    defaultTitle = basename(inputs[inputs.length - 1]!);
    defaultOutput = basename(inputs[inputs.length - 1]!).replace(/\.[^.]+$/, "") || defaultOutput;
  } else {
    return program.help({ error: true });
  }

  // CLI flags win over the steps file; a --lang flag also wins over extension detection.
  if (opts.lang) steps = steps.map((s) => ({ ...s, lang: opts.lang }));
  const title = opts.title ?? fileOptions.title ?? defaultTitle;
  const fileLang = fileOptions.lang ?? (fileOptions.title ? detectLang(fileOptions.title) : undefined);
  const format = (opts.format ?? (opts.output ? undefined : fileOptions.format)) as OutputFormat | undefined;
  const output = opts.output ?? `${defaultOutput}.${format ?? "mp4"}`;

  const options: RenderOptions = {
    ...fileOptions,
    steps,
    output,
    format,
    lang: opts.lang ?? (fileLang && fileLang !== "text" ? fileLang : undefined),
    title,
  };
  const overrides: Partial<RenderOptions> = {
    theme: opts.theme,
    size: opts.size,
    fps: opts.fps,
    fontSize: opts.fontSize,
    fontFamily: opts.fontFamily,
    transition: opts.transition,
    hold: opts.hold,
    typing: opts.typing,
    typingSpeed: opts.typingSpeed,
    highlightChanges: opts.highlightChanges,
    caption: opts.caption,
    window: opts.window,
    background: opts.background,
    scale: opts.scale,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) (options as unknown as Record<string, unknown>)[key] = value;
  }

  const showProgress = !opts.quiet && process.stderr.isTTY;
  const started = Date.now();
  let lastDraw = 0;
  options.onProgress = showProgress
    ? ({ frame, totalFrames, ratio }) => {
        const now = Date.now();
        if (now - lastDraw < 80 && frame < totalFrames) return;
        lastDraw = now;
        const width = 28;
        const filled = Math.round(ratio * width);
        process.stderr.write(
          `\r  rendering ${"█".repeat(filled)}${"░".repeat(width - filled)} ${String(Math.round(ratio * 100)).padStart(3)}%  ${frame}/${totalFrames} frames`,
        );
      }
    : undefined;

  if (!opts.quiet) process.stderr.write(`diffreel: ${steps.length} step${steps.length === 1 ? "" : "s"} → ${output}\n`);
  const result = await render(options);
  if (showProgress) process.stderr.write("\n");
  if (!opts.quiet) {
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    process.stderr.write(
      `✔ ${relative(process.cwd(), result.output) || result.output}  ${result.width}x${result.height} @ ${result.fps}fps, ${(result.durationMs / 1000).toFixed(2)}s video, rendered in ${secs}s\n`,
    );
  }
}

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`\n✖ ${(error as Error).message ?? String(error)}\n`);
  process.exit(1);
});
