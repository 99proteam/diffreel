import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
    sourcemap: true,
    clean: true,
    target: "node20",
    shims: true,
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    sourcemap: true,
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
    define: { __VERSION__: JSON.stringify(version) },
  },
]);
