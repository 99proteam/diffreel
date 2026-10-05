#!/usr/bin/env node
// Render every example in examples/ to examples/output/, plus the README demo GIF.
// Usage: npm run examples            (all)
//        npm run examples -- sql     (only examples whose name contains "sql")
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
const ex = (...p) => join(root, "examples", ...p);
const out = (name) => join(root, "examples", "output", name);

const examples = [
  {
    name: "bug-fix",
    args: [ex("bug-fix", "before.js"), ex("bug-fix", "after.js"), "--title", "users.js", "--window", "--highlight-changes",
      "--caption", "Fix the off-by-one and the accidental assignment", "-o", out("bug-fix.mp4")],
  },
  {
    name: "refactor",
    args: [ex("refactor", "before.ts"), ex("refactor", "after.ts"), "--title", "profile.ts", "--theme", "one-dark-pro",
      "--window", "--transition", "1400", "--hold", "2500", "--caption", "Promise chains → async/await", "-o", out("refactor.mp4")],
  },
  {
    name: "react-component",
    args: [ex("react-component", "steps.json"), "-o", out("react-component.mp4")],
  },
  {
    name: "python-function",
    args: [ex("python-function", "before.py"), ex("python-function", "after.py"), "--title", "stats.py", "--theme", "catppuccin-mocha",
      "--size", "square", "--typing", "--highlight-changes", "--background", "linear-gradient(160deg, #1e1e2e, #45475a)", "-o", out("python-function.mp4")],
  },
  {
    name: "sql-query",
    args: [ex("sql-query", "steps.json"), "-o", out("sql-query.mp4")],
  },
  {
    name: "demo-gif",
    args: [ex("bug-fix", "before.js"), ex("bug-fix", "after.js"), "--title", "users.js", "--window", "--highlight-changes",
      "--size", "960x540", "--fps", "20", "--hold", "1500", "-o", join(root, "docs", "demo.gif")],
  },
];

const filter = process.argv[2];
mkdirSync(join(root, "examples", "output"), { recursive: true });
let failed = 0;
for (const example of examples) {
  if (filter && !example.name.includes(filter)) continue;
  console.log(`\n▶ ${example.name}`);
  const result = spawnSync(process.execPath, [cli, ...example.args], { stdio: "inherit", cwd: root });
  if (result.status !== 0) failed++;
}
if (failed) {
  console.error(`\n${failed} example(s) failed.`);
  process.exit(1);
}
