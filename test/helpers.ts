import { charCount, splitPieces, type CodeLine } from "../src/highlight.js";

/** Build CodeLines without Shiki: every token gets the same color. */
export function lines(code: string, color = "#ffffff"): CodeLine[] {
  return code.split("\n").map((text, line) => ({
    text,
    tokens: splitPieces(text).map((p) => ({
      text: p.text,
      color,
      fontStyle: 0,
      line,
      col: charCount(text.slice(0, p.offset)),
    })),
  }));
}
