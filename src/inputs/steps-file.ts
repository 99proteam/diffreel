import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { detectLang } from "../lang.js";
import type { RenderOptions, Step } from "../types.js";

export class StepsFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepsFileError";
  }
}

/** Render options that a steps file may set at the top level. */
export type StepsFileOptions = Pick<
  RenderOptions,
  | "theme"
  | "lang"
  | "size"
  | "fps"
  | "fontSize"
  | "fontFamily"
  | "transition"
  | "hold"
  | "typing"
  | "typingSpeed"
  | "highlightChanges"
  | "caption"
  | "window"
  | "title"
  | "background"
  | "format"
>;

export interface ParsedStepsFile {
  steps: Step[];
  options: StepsFileOptions;
}

export interface ParseContext {
  /** Directory that `file` references resolve against. */
  baseDir: string;
  /** Reads a referenced file (injectable for tests). */
  readFile?: (path: string) => string;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const STRING_OPTIONS = ["theme", "lang", "fontFamily", "caption", "title", "background"] as const;
const NUMBER_OPTIONS = ["fps", "fontSize", "transition", "hold", "typingSpeed"] as const;
const BOOLEAN_OPTIONS = ["typing", "highlightChanges", "window"] as const;
const STEP_KEYS = new Set(["code", "file", "lang", "caption", "hold", "transition", "filename", "title"]);
const TOP_KEYS = new Set<string>([
  "steps",
  "filename",
  "size",
  "format",
  "$schema",
  ...STRING_OPTIONS,
  ...NUMBER_OPTIONS,
  ...BOOLEAN_OPTIONS,
]);

function nonNegative(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new StepsFileError(`${where} must be a non-negative number (milliseconds), got ${JSON.stringify(value)}.`);
  }
  return value;
}

function str(value: unknown, where: string): string {
  if (typeof value !== "string") throw new StepsFileError(`${where} must be a string, got ${JSON.stringify(value)}.`);
  return value;
}

/**
 * Validate a parsed steps file. Accepts either `{ steps: [...], ...options }` or a bare array of steps.
 * Each step has `code` (string or array of lines) or `file` (path relative to the steps file).
 */
export function parseSteps(data: unknown, ctx: ParseContext): ParsedStepsFile {
  const read = ctx.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const root: Json = Array.isArray(data) ? { steps: data } : isObject(data) ? data : {};
  if (!Array.isArray(data) && !isObject(data)) {
    throw new StepsFileError('A steps file must be a JSON object with a "steps" array, or an array of steps.');
  }
  for (const key of Object.keys(root)) {
    if (!TOP_KEYS.has(key)) throw new StepsFileError(`Unknown top-level field "${key}".`);
  }
  if (!Array.isArray(root.steps) || root.steps.length === 0) {
    throw new StepsFileError('"steps" must be a non-empty array.');
  }

  const options: StepsFileOptions = {};
  for (const key of STRING_OPTIONS) {
    if (root[key] !== undefined) options[key] = str(root[key], `"${key}"`);
  }
  if (root.filename !== undefined) options.title = str(root.filename, '"filename"');
  for (const key of NUMBER_OPTIONS) {
    const v = root[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new StepsFileError(`"${key}" must be a positive number, got ${JSON.stringify(v)}.`);
    }
    options[key] = v;
  }
  for (const key of BOOLEAN_OPTIONS) {
    const v = root[key];
    if (v === undefined) continue;
    if (typeof v !== "boolean") throw new StepsFileError(`"${key}" must be true or false, got ${JSON.stringify(v)}.`);
    options[key] = v;
  }
  if (root.size !== undefined) {
    const s = root.size;
    if (typeof s === "string") options.size = s;
    else if (isObject(s) && typeof s.width === "number" && typeof s.height === "number") options.size = { width: s.width, height: s.height };
    else throw new StepsFileError('"size" must be a preset name, "WIDTHxHEIGHT", or { "width": n, "height": n }.');
  }
  if (root.format !== undefined) {
    const f = str(root.format, '"format"');
    if (f !== "mp4" && f !== "webm" && f !== "gif") throw new StepsFileError(`"format" must be mp4, webm or gif, got "${f}".`);
    options.format = f;
  }

  const steps: Step[] = root.steps.map((raw, i) => {
    const where = `steps[${i}]`;
    if (typeof raw === "string") return { code: raw };
    if (!isObject(raw)) throw new StepsFileError(`${where} must be an object or a string of code.`);
    for (const key of Object.keys(raw)) {
      if (!STEP_KEYS.has(key)) throw new StepsFileError(`${where} has unknown field "${key}".`);
    }
    const hasCode = raw.code !== undefined;
    const hasFile = raw.file !== undefined;
    if (hasCode === hasFile) throw new StepsFileError(`${where} needs exactly one of "code" or "file".`);

    const step: Step = { code: "" };
    if (hasCode) {
      if (typeof raw.code === "string") step.code = raw.code;
      else if (Array.isArray(raw.code) && raw.code.every((l) => typeof l === "string")) step.code = raw.code.join("\n");
      else throw new StepsFileError(`${where}.code must be a string or an array of strings.`);
    } else {
      const rel = str(raw.file, `${where}.file`);
      const path = resolve(ctx.baseDir, rel);
      try {
        step.code = read(path);
      } catch (error) {
        throw new StepsFileError(`${where}.file: cannot read "${rel}" (${(error as Error).message}).`);
      }
      const detected = detectLang(rel);
      if (raw.lang === undefined && detected !== "text") step.lang = detected;
      step.filename = basename(rel);
    }
    if (raw.lang !== undefined) step.lang = str(raw.lang, `${where}.lang`);
    if (raw.caption !== undefined) step.caption = str(raw.caption, `${where}.caption`);
    if (raw.filename !== undefined) step.filename = str(raw.filename, `${where}.filename`);
    if (raw.title !== undefined) step.filename = str(raw.title, `${where}.title`);
    if (raw.hold !== undefined) step.hold = nonNegative(raw.hold, `${where}.hold`);
    if (raw.transition !== undefined) step.transition = nonNegative(raw.transition, `${where}.transition`);
    return step;
  });

  return { steps, options };
}

/** Read and validate a steps JSON file. */
export async function loadStepsFile(path: string): Promise<ParsedStepsFile> {
  const abs = resolve(path);
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch (error) {
    throw new StepsFileError(`Cannot read steps file "${path}": ${(error as Error).message}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text));
  } catch (error) {
    throw new StepsFileError(`Steps file "${path}" is not valid JSON: ${(error as Error).message}`);
  }
  return parseSteps(data, { baseDir: dirname(abs) });
}

/** Drop a leading byte order mark, which JSON.parse rejects. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
