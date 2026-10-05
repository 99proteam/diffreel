import { bundledLanguages } from "shiki";

const EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  py: "python",
  pyw: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  ps1: "powershell",
  json: "json",
  jsonc: "jsonc",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "mdx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  dart: "dart",
  lua: "lua",
  r: "r",
  scala: "scala",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  ml: "ocaml",
  clj: "clojure",
  zig: "zig",
  nim: "nim",
  pl: "perl",
  graphql: "graphql",
  gql: "graphql",
  prisma: "prisma",
  proto: "proto",
  tf: "terraform",
  xml: "xml",
  svg: "xml",
};

const FILENAMES: Record<string, string> = {
  dockerfile: "docker",
  makefile: "make",
  gemfile: "ruby",
  rakefile: "ruby",
};

/** Guess a Shiki language id from a file name. Returns "text" when unknown. */
export function detectLang(filename: string | undefined): string {
  if (!filename) return "text";
  const base = filename.replace(/\\/g, "/").split("/").pop()!.toLowerCase();
  const byName = FILENAMES[base];
  if (byName) return byName;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "text";
  const ext = base.slice(dot + 1);
  const mapped = EXTENSIONS[ext];
  if (mapped) return mapped;
  if (ext in bundledLanguages) return ext;
  return "text";
}

const PLAIN = new Set(["text", "txt", "plain", "plaintext", "ansi"]);

/** Whether Shiki can highlight this language id (aliases included). */
export function isKnownLang(lang: string): boolean {
  return PLAIN.has(lang) || lang in bundledLanguages;
}
