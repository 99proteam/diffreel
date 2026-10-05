import { bundledThemes, createHighlighter, type BundledLanguage } from "shiki";
import { isKnownLang } from "./lang.js";

/** A positioned, colored piece of code: a word, a number, or a single punctuation character. */
export interface CodeToken {
  text: string;
  color: string;
  /** Shiki font style bit flags: 1 italic, 2 bold, 4 underline, 8 strikethrough. */
  fontStyle: number;
  /** Zero-based line index. */
  line: number;
  /** Zero-based column (character cells, tabs already expanded). */
  col: number;
}

export interface CodeLine {
  /** Full line text (tabs expanded). Used for line-level diffing. */
  text: string;
  tokens: CodeToken[];
}

export interface ThemeInfo {
  name: string;
  type: "dark" | "light";
  fg: string;
  bg: string;
}

export interface HighlightedCode {
  lines: CodeLine[];
}

export const TAB_SIZE = 4;

/** Normalize line endings, expand tabs to tab stops and drop one trailing newline. */
export function normalizeCode(code: string, tabSize = TAB_SIZE): string {
  const text = code.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  return text
    .split("\n")
    .map((line) => {
      if (!line.includes("\t")) return line;
      let out = "";
      for (const ch of line) {
        if (ch === "\t") out += " ".repeat(tabSize - (out.length % tabSize));
        else out += ch;
      }
      return out;
    })
    .join("\n")
    .replace(/[ \t]+$/gm, "");
}

const PIECE = /\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]/gu;

/**
 * Split a highlighted run into animation pieces: identifier/number runs and single
 * punctuation characters. Whitespace is dropped (it is implied by column positions).
 */
export function splitPieces(text: string): Array<{ text: string; offset: number }> {
  const out: Array<{ text: string; offset: number }> = [];
  for (const m of text.matchAll(PIECE)) {
    if (/^\s+$/.test(m[0])) continue;
    out.push({ text: m[0], offset: m.index });
  }
  return out;
}

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;

export interface Tokenizer {
  theme: ThemeInfo;
  highlight(code: string, lang: string): HighlightedCode;
  dispose(): void;
}

export function listThemes(): string[] {
  return Object.keys(bundledThemes);
}

/** Load a Shiki highlighter for one theme and the given languages. */
export async function createTokenizer(theme: string, langs: string[]): Promise<Tokenizer> {
  if (!(theme in bundledThemes)) {
    throw new Error(`Unknown theme "${theme}". Available themes: ${listThemes().join(", ")}`);
  }
  for (const lang of langs) {
    if (!isKnownLang(lang)) {
      throw new Error(`Unknown language "${lang}". Use any Shiki language id, e.g. ts, tsx, python, sql, go, rust.`);
    }
  }
  const unique = [...new Set(langs.filter((l) => !["text", "txt", "plain", "plaintext"].includes(l)))];
  const highlighter: Highlighter = await createHighlighter({ themes: [theme], langs: unique });
  const t = highlighter.getTheme(theme);
  const info: ThemeInfo = {
    name: theme,
    type: t.type === "light" ? "light" : "dark",
    fg: t.fg,
    bg: t.bg,
  };
  return {
    theme: info,
    highlight(code, lang) {
      const normalized = normalizeCode(code);
      const plain = ["text", "txt", "plain", "plaintext"].includes(lang);
      const result = highlighter.codeToTokens(normalized, { lang: (plain ? "text" : lang) as BundledLanguage, theme });
      const rawLines = normalized.split("\n");
      const lines: CodeLine[] = result.tokens.map((lineTokens, line) => {
        const tokens: CodeToken[] = [];
        let col = 0;
        for (const token of lineTokens) {
          for (const piece of splitPieces(token.content)) {
            tokens.push({
              text: piece.text,
              color: token.color ?? info.fg,
              fontStyle: token.fontStyle ?? 0,
              line,
              col: col + charCount(token.content.slice(0, piece.offset)),
            });
          }
          col += charCount(token.content);
        }
        return { text: rawLines[line] ?? "", tokens };
      });
      return { lines };
    },
    dispose() {
      highlighter.dispose();
    },
  };
}

/** Count code points so surrogate pairs take one cell. */
export function charCount(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}
