#!/usr/bin/env node
// Build the static website (landing page + live playground) into site-dist/.
// Example videos are copied from examples/output/ when present (run `npm run examples` first).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "site-dist");
const read = (...p) => readFileSync(join(root, ...p), "utf8");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "assets"), { recursive: true });

// ---- examples embedded in the playground ----
const fromStepsFile = (id, name, file) => {
  const data = JSON.parse(read("examples", id, file));
  return {
    id,
    name,
    lang: data.lang,
    theme: data.theme ?? "github-dark",
    size: data.size ?? "youtube",
    window: data.window ?? false,
    typing: data.typing ?? false,
    highlightChanges: data.highlightChanges ?? false,
    transition: data.transition ?? 900,
    hold: data.hold ?? 2000,
    filename: data.filename ?? "",
    background: data.background,
    steps: data.steps.map((s) => ({ code: Array.isArray(s.code) ? s.code.join("\n") : s.code, caption: s.caption })),
  };
};
const examples = [
  {
    id: "bug-fix",
    name: "Bug fix (JavaScript)",
    lang: "javascript",
    theme: "github-dark",
    size: "youtube",
    window: true,
    typing: false,
    highlightChanges: true,
    transition: 900,
    hold: 1800,
    filename: "users.js",
    steps: [
      { code: read("examples", "bug-fix", "before.js"), caption: "Two bugs hiding in plain sight" },
      { code: read("examples", "bug-fix", "after.js"), caption: "Fix the off-by-one and the accidental assignment" },
    ],
  },
  {
    id: "refactor",
    name: "Refactor to async/await (TypeScript)",
    lang: "typescript",
    theme: "one-dark-pro",
    size: "youtube",
    window: true,
    typing: false,
    highlightChanges: false,
    transition: 1400,
    hold: 2200,
    filename: "profile.ts",
    steps: [
      { code: read("examples", "refactor", "before.ts"), caption: "Promise chains" },
      { code: read("examples", "refactor", "after.ts"), caption: "async/await" },
    ],
  },
  fromStepsFile("react-component", "React component, step by step (Reel)", "steps.json"),
  {
    id: "python-function",
    name: "Python function with typing effect",
    lang: "python",
    theme: "catppuccin-mocha",
    size: "square",
    window: false,
    typing: true,
    highlightChanges: true,
    transition: 900,
    hold: 1800,
    filename: "stats.py",
    background: "linear-gradient(160deg, #1e1e2e, #45475a)",
    steps: [{ code: read("examples", "python-function", "before.py") }, { code: read("examples", "python-function", "after.py") }],
  },
  fromStepsFile("sql-query", "SQL query, clause by clause (light theme)", "steps.json"),
];

await build({
  entryPoints: [join(root, "site", "src", "playground.ts")],
  outdir: join(out, "assets"),
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  chunkNames: "chunks/[name]-[hash]",
  define: { __EXAMPLES__: JSON.stringify(examples) },
  logLevel: "warning",
});

// ---- static files ----
for (const f of ["index.html", "styles.css", "favicon.svg"]) copyFileSync(join(root, "site", f), join(out, f));
copyFileSync(join(root, "docs", "demo.gif"), join(out, "demo.gif"));
writeFileSync(join(out, ".nojekyll"), "");

// ---- fonts: the same JetBrains Mono + Inter files the CLI embeds ----
mkdirSync(join(out, "fonts", "files"), { recursive: true });
let fontCss = "";
for (const [pkg, sheets] of [
  ["@fontsource/jetbrains-mono", ["400.css", "700.css", "400-italic.css", "700-italic.css"]],
  ["@fontsource/inter", ["400.css", "500.css", "600.css", "700.css"]],
]) {
  const dir = dirname(require.resolve(`${pkg}/package.json`));
  for (const sheet of sheets) {
    const css = readFileSync(join(dir, sheet), "utf8").replace(/src:\s*([^;]+);/g, (_m, src) => {
      const woff2 = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(src);
      if (!woff2) return `src: ${src};`;
      copyFileSync(join(dir, "files", woff2[1]), join(out, "fonts", "files", woff2[1]));
      return `src: url(files/${woff2[1]}) format('woff2');`;
    });
    fontCss += css.replace(/font-display:\s*swap/g, "font-display: block") + "\n";
  }
}
writeFileSync(join(out, "fonts", "fonts.css"), fontCss);

// ---- example videos + poster frames ----
const ffmpeg = require("ffmpeg-static");
const videos = ["bug-fix", "refactor", "react-component", "python-function", "sql-query"];
let copied = 0;
mkdirSync(join(out, "videos"), { recursive: true });
for (const name of videos) {
  const src = join(root, "examples", "output", `${name}.mp4`);
  if (!existsSync(src)) continue;
  copyFileSync(src, join(out, "videos", `${name}.mp4`));
  spawnSync(ffmpeg, ["-loglevel", "error", "-y", "-sseof", "-0.5", "-i", src, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", join(out, "videos", `${name}.jpg`)]);
  copied++;
}
const og = join(root, "examples", "output", "bug-fix.mp4");
if (existsSync(og)) {
  spawnSync(ffmpeg, ["-loglevel", "error", "-y", "-sseof", "-0.5", "-i", og, "-frames:v", "1", "-vf", "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630", join(out, "og.png")]);
}

console.log(`site-dist ready (${copied}/${videos.length} example videos${copied < videos.length ? "; run `npm run examples` for the rest" : ""})`);
