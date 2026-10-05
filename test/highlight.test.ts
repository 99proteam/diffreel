import { describe, expect, it } from "vitest";
import { createTokenizer, normalizeCode, splitPieces } from "../src/highlight.js";
import { detectLang, isKnownLang } from "../src/lang.js";

describe("normalizeCode", () => {
  it("normalizes line endings, drops one trailing newline and trailing spaces", () => {
    expect(normalizeCode("a  \r\nb\r\n")).toBe("a\nb");
  });

  it("expands tabs to tab stops", () => {
    expect(normalizeCode("\tx")).toBe("    x");
    expect(normalizeCode("ab\tc")).toBe("ab  c");
  });
});

describe("splitPieces", () => {
  it("splits identifiers, numbers and single punctuation, skipping whitespace", () => {
    expect(splitPieces("  foo.bar(42);").map((p) => p.text)).toEqual(["foo", ".", "bar", "(", "42", ")", ";"]);
  });

  it("keeps offsets into the original text", () => {
    expect(splitPieces("a  =>  b")).toEqual([
      { text: "a", offset: 0 },
      { text: "=", offset: 3 },
      { text: ">", offset: 4 },
      { text: "b", offset: 7 },
    ]);
  });

  it("treats unicode letters as identifier characters", () => {
    expect(splitPieces("naïve_变量").map((p) => p.text)).toEqual(["naïve_变量"]);
  });
});

describe("createTokenizer", () => {
  it("produces colored tokens with line/column positions", async () => {
    const tokenizer = await createTokenizer("github-dark", ["ts"]);
    try {
      expect(tokenizer.theme).toMatchObject({ type: "dark", bg: "#24292e" });
      const { lines } = tokenizer.highlight("const a = 1;\n\treturn a;", "ts");
      expect(lines).toHaveLength(2);
      expect(lines[0]!.tokens.map((t) => [t.text, t.col])).toEqual([
        ["const", 0],
        ["a", 6],
        ["=", 8],
        ["1", 10],
        [";", 11],
      ]);
      expect(lines[1]!.text).toBe("    return a;");
      expect(lines[1]!.tokens[0]).toMatchObject({ text: "return", line: 1, col: 4 });
      const keyword = lines[0]!.tokens[0]!.color;
      expect(keyword).toMatch(/^#[0-9a-f]{6}/i);
      expect(keyword).not.toBe(lines[0]!.tokens[1]!.color);
    } finally {
      tokenizer.dispose();
    }
  });

  it("rejects unknown themes and languages with a helpful message", async () => {
    await expect(createTokenizer("nope-theme", ["ts"])).rejects.toThrow(/Unknown theme "nope-theme"/);
    await expect(createTokenizer("github-dark", ["klingon"])).rejects.toThrow(/Unknown language "klingon"/);
  });

  it("highlights plain text", async () => {
    const tokenizer = await createTokenizer("github-light", ["text"]);
    const { lines } = tokenizer.highlight("hello world", "text");
    expect(lines[0]!.tokens.map((t) => t.text)).toEqual(["hello", "world"]);
    tokenizer.dispose();
  });
});

describe("detectLang", () => {
  it("maps extensions and special file names", () => {
    expect(detectLang("src/app.ts")).toBe("typescript");
    expect(detectLang("C:\\code\\Button.tsx")).toBe("tsx");
    expect(detectLang("main.py")).toBe("python");
    expect(detectLang("query.sql")).toBe("sql");
    expect(detectLang("Dockerfile")).toBe("docker");
    expect(detectLang("notes")).toBe("text");
    expect(detectLang("weird.zzz")).toBe("text");
  });

  it("knows Shiki languages and aliases", () => {
    expect(isKnownLang("ts")).toBe(true);
    expect(isKnownLang("python")).toBe(true);
    expect(isKnownLang("text")).toBe(true);
    expect(isKnownLang("klingon")).toBe(false);
  });
});
