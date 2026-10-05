import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { detectLang } from "../lang.js";
import type { Step } from "../types.js";

const exec = promisify(execFile);

export interface GitRange {
  from: string;
  /** `null` means the working tree. */
  to: string | null;
}

/**
 * Parse a git range: "A..B" (B empty = working tree) or a single commit "X" (same as X~1..X).
 */
export function parseGitRange(spec: string): GitRange {
  const s = spec.trim();
  if (!s) throw new Error("--git needs a commit or range, e.g. HEAD~1..HEAD");
  if (s.includes("...")) throw new Error(`Three-dot ranges are not supported ("${spec}"). Use A..B.`);
  const parts = s.split("..");
  if (parts.length > 2) throw new Error(`Invalid git range "${spec}". Use A..B or a single commit.`);
  if (parts.length === 2) {
    const [from, to] = parts as [string, string];
    return { from: from || "HEAD", to: to || null };
  }
  return { from: `${s}~1`, to: s };
}

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return stdout;
  } catch (error) {
    const e = error as Error & { stderr?: string; code?: string };
    if (e.code === "ENOENT") throw new Error("git is not installed or not on PATH.", { cause: error });
    throw new Error(`git ${args.join(" ")} failed: ${(e.stderr || e.message).trim()}`, { cause: error });
  }
}

/**
 * Resolve symlinks and Windows 8.3 short names (e.g. /var -> /private/var on macOS,
 * RUNNER~1 -> runneradmin on Windows) so paths from git and from Node compare equal.
 */
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(resolve(path));
  } catch {
    return resolve(path);
  }
}

async function revExists(rev: string, cwd: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/** File content at a revision; empty string if the file did not exist there. */
async function contentAt(rev: string, path: string, cwd: string): Promise<string> {
  try {
    return await git(["show", `${rev}:${path}`], cwd);
  } catch (error) {
    if (await revExists(rev, cwd)) return "";
    throw new Error(`Unknown git revision "${rev}". ${(error as Error).message}`, { cause: error });
  }
}

export interface GitStepsOptions {
  range: string;
  file: string;
  cwd?: string;
  /** Use each commit's subject line as the caption of its step. */
  commitCaptions?: boolean;
}

/**
 * Build steps from git history: the file at the start of the range, then the file after every
 * commit in the range that touched it (or the working tree for "A..").
 */
export async function loadGitSteps(opts: GitStepsOptions): Promise<Step[]> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const range = parseGitRange(opts.range);
  const top = await canonical((await git(["rev-parse", "--show-toplevel"], cwd)).trim());
  const abs = resolve(cwd, opts.file);
  // The file may not exist in the working tree (deleted later), so canonicalize its directory.
  const canonicalAbs = join(await canonical(dirname(abs)), basename(abs));
  const rel = relative(top, canonicalAbs).replace(/\\/g, "/");
  if (rel.startsWith("..")) throw new Error(`--file "${opts.file}" is outside the git repository at ${top}.`);
  const lang = detectLang(rel);
  const filename = basename(rel);
  const base = (code: string, caption?: string): Step => ({
    code,
    filename,
    ...(lang !== "text" ? { lang } : {}),
    ...(caption ? { caption } : {}),
  });

  const steps: Step[] = [];
  const subject = async (rev: string) =>
    opts.commitCaptions ? (await git(["log", "-1", "--format=%s", rev], cwd)).trim() : undefined;

  steps.push(base(await contentAt(range.from, rel, cwd)));

  if (range.to === null) {
    const code = await readFile(abs, "utf8").catch(() => "");
    steps.push(base(code, opts.commitCaptions ? "Working tree" : undefined));
    return steps;
  }

  const commits = (await git(["rev-list", "--reverse", `${range.from}..${range.to}`, "--", rel], cwd))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (commits.length === 0) {
    steps.push(base(await contentAt(range.to, rel, cwd), await subject(range.to)));
  } else {
    for (const commit of commits) {
      steps.push(base(await contentAt(commit, rel, cwd), await subject(commit)));
    }
  }
  return steps;
}
