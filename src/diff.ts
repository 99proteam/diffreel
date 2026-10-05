import { diffArrays } from "diff";
import type { CodeLine, CodeToken } from "./highlight.js";

export interface ChangeBlock {
  /** Line indexes in the "before" snapshot. */
  removed: number[];
  /** Line indexes in the "after" snapshot. */
  added: number[];
}

export interface LineAlignment {
  /** Lines that are identical and kept in order: [beforeIndex, afterIndex]. */
  common: Array<[number, number]>;
  /** Lines whose content (ignoring indentation) re-appears elsewhere: [beforeIndex, afterIndex]. */
  moved: Array<[number, number]>;
  /** Remaining changed regions. Lines in `moved` are excluded from these. */
  blocks: ChangeBlock[];
}

/** Minimum content a line needs before it can be treated as "moved" rather than retyped. */
function movable(text: string): boolean {
  const t = text.trim();
  return t.length >= 3 && /[\p{L}\p{N}]/u.test(t);
}

/**
 * Align two snapshots line by line. Identical lines become `common`, lines that changed only
 * by indentation or position become `moved`, and everything else is grouped into change blocks.
 */
export function alignLines(before: string[], after: string[]): LineAlignment {
  const common: Array<[number, number]> = [];
  const rawBlocks: ChangeBlock[] = [];
  let a = 0;
  let b = 0;
  let current: ChangeBlock | null = null;

  for (const change of diffArrays(before, after)) {
    const count = change.count ?? change.value.length;
    if (change.added) {
      current ??= { removed: [], added: [] };
      for (let i = 0; i < count; i++) current.added.push(b++);
    } else if (change.removed) {
      current ??= { removed: [], added: [] };
      for (let i = 0; i < count; i++) current.removed.push(a++);
    } else {
      if (current) rawBlocks.push(current);
      current = null;
      for (let i = 0; i < count; i++) common.push([a++, b++]);
    }
  }
  if (current) rawBlocks.push(current);

  // Pair removed and added lines with the same trimmed content anywhere in the file.
  const moved: Array<[number, number]> = [];
  const addedByText = new Map<string, number[]>();
  for (const block of rawBlocks) {
    for (const j of block.added) {
      const key = (after[j] ?? "").trim();
      if (!movable(key)) continue;
      const list = addedByText.get(key);
      if (list) list.push(j);
      else addedByText.set(key, [j]);
    }
  }
  const movedBefore = new Set<number>();
  const movedAfter = new Set<number>();
  for (const block of rawBlocks) {
    for (const i of block.removed) {
      const key = (before[i] ?? "").trim();
      const candidates = addedByText.get(key);
      if (!candidates || candidates.length === 0) continue;
      const j = candidates.shift()!;
      moved.push([i, j]);
      movedBefore.add(i);
      movedAfter.add(j);
    }
  }

  const blocks = rawBlocks
    .map((block) => ({
      removed: block.removed.filter((i) => !movedBefore.has(i)),
      added: block.added.filter((j) => !movedAfter.has(j)),
    }))
    .filter((block) => block.removed.length > 0 || block.added.length > 0);

  return { common, moved, blocks };
}

export interface TokenMatch {
  /** [beforeIndex, afterIndex] into the token arrays passed in. */
  pairs: Array<[number, number]>;
  removed: number[];
  added: number[];
}

export interface MatchOptions {
  /** Only match tokens that also share a color, so `for` in code never matches `for` inside a string. */
  byColor?: boolean;
  /** Drop punctuation matches that have no matched neighbor; lone `(` or `;` flying across a rewrite looks noisy. */
  anchorPunctuation?: boolean;
}

const isPunctuation = (text: string) => !/[\p{L}\p{N}_$]/u.test(text);

/** Longest-common-subsequence match of two token sequences by text (and optionally color). */
export function matchTokens(
  before: Array<Pick<CodeToken, "text"> & Partial<Pick<CodeToken, "color">>>,
  after: Array<Pick<CodeToken, "text"> & Partial<Pick<CodeToken, "color">>>,
  options: MatchOptions = {},
): TokenMatch {
  const key = (t: { text: string; color?: string }) => (options.byColor ? `${t.color ?? ""}:${t.text}` : t.text);
  let pairs: Array<[number, number]> = [];
  let a = 0;
  let b = 0;
  for (const change of diffArrays(before.map(key), after.map(key))) {
    const count = change.count ?? change.value.length;
    if (change.added) b += count;
    else if (change.removed) a += count;
    else for (let i = 0; i < count; i++) pairs.push([a++, b++]);
  }

  if (options.anchorPunctuation) {
    const has = new Set(pairs.map(([x, y]) => `${x},${y}`));
    pairs = pairs.filter(
      ([x, y]) => !isPunctuation(before[x]!.text) || has.has(`${x - 1},${y - 1}`) || has.has(`${x + 1},${y + 1}`),
    );
  }

  const matchedBefore = new Set(pairs.map(([x]) => x));
  const matchedAfter = new Set(pairs.map(([, y]) => y));
  return {
    pairs,
    removed: before.map((_, i) => i).filter((i) => !matchedBefore.has(i)),
    added: after.map((_, i) => i).filter((i) => !matchedAfter.has(i)),
  };
}

export interface TokenPair {
  from: CodeToken;
  to: CodeToken;
}

/** Everything the animation needs to morph one snapshot into the next. */
export interface TransitionPlan {
  /** Tokens present in both snapshots; they slide from `from` to `to`. */
  matched: TokenPair[];
  /** Tokens that disappear. */
  removed: CodeToken[];
  /** Tokens that appear. */
  added: CodeToken[];
  /** "After" line indexes that changed (contain added tokens or were rewritten). */
  changedLines: number[];
}

/** Diff two highlighted snapshots at line level, then at token level inside changed blocks. */
export function planTransition(before: CodeLine[], after: CodeLine[]): TransitionPlan {
  const alignment = alignLines(
    before.map((l) => l.text),
    after.map((l) => l.text),
  );
  const matched: TokenPair[] = [];
  const removed: CodeToken[] = [];
  const added: CodeToken[] = [];
  const changed = new Set<number>();

  const pairLines = (i: number, j: number) => {
    const from = before[i]?.tokens ?? [];
    const to = after[j]?.tokens ?? [];
    const m = matchTokens(from, to);
    for (const [x, y] of m.pairs) matched.push({ from: from[x]!, to: to[y]! });
    for (const x of m.removed) removed.push(from[x]!);
    for (const y of m.added) added.push(to[y]!);
    if (m.removed.length > 0 || m.added.length > 0) changed.add(j);
  };

  for (const [i, j] of alignment.common) pairLines(i, j);
  for (const [i, j] of alignment.moved) pairLines(i, j);

  for (const block of alignment.blocks) {
    const from = block.removed.flatMap((i) => before[i]?.tokens ?? []);
    const to = block.added.flatMap((j) => after[j]?.tokens ?? []);
    const m = matchTokens(from, to, { byColor: true, anchorPunctuation: true });
    for (const [x, y] of m.pairs) matched.push({ from: from[x]!, to: to[y]! });
    for (const x of m.removed) removed.push(from[x]!);
    for (const y of m.added) added.push(to[y]!);
    for (const j of block.added) changed.add(j);
  }

  return {
    matched,
    removed,
    added,
    changedLines: [...changed].sort((x, y) => x - y),
  };
}
