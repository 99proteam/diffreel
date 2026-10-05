import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Inline a fontsource stylesheet, replacing file URLs with woff2 data URIs. */
function inlineFontsource(pkg: string, sheets: string[]): string {
  const dir = dirname(require.resolve(`${pkg}/package.json`));
  return sheets
    .map((sheet) => {
      const css = readFileSync(join(dir, sheet), "utf8");
      return css.replace(/src:\s*([^;]+);/g, (_match, src: string) => {
        const woff2 = /url\(\.\/(files\/[^)]+\.woff2)\)/.exec(src);
        if (!woff2) return `src: ${src};`;
        const data = readFileSync(join(dir, woff2[1]!)).toString("base64");
        return `src: url(data:font/woff2;base64,${data}) format('woff2');`;
      });
    })
    .join("\n");
}

let cached: string | null = null;

/** @font-face rules for the bundled code font (JetBrains Mono) and caption font (Inter). */
export function fontFaceCss(): string {
  cached ??=
    inlineFontsource("@fontsource/jetbrains-mono", ["400.css", "700.css", "400-italic.css", "700-italic.css"]) +
    "\n" +
    inlineFontsource("@fontsource/inter", ["500.css", "600.css"]);
  return cached;
}
