/**
 * Parse a step's `focus` into sorted, zero-based line indexes. Accepts 1-based line numbers as a
 * string ("3", "2-4, 8", "10-") or an array of numbers ([2, 3, 4]). Lines past `lineCount` are
 * dropped, so a focus written for a longer step can't point at nothing.
 */
export function parseFocus(spec: string | number[], lineCount: number): number[] {
  const out = new Set<number>();
  const add = (n: number) => {
    if (n >= 1 && n <= lineCount) out.add(n - 1);
  };
  if (Array.isArray(spec)) {
    for (const n of spec) {
      if (!Number.isInteger(n) || n < 1) throw new Error(`focus lines must be whole numbers >= 1, got ${JSON.stringify(n)}.`);
      add(n);
    }
  } else {
    const parts = spec
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) throw new Error('focus must name at least one line, e.g. "3" or "2-4, 8".');
    for (const part of parts) {
      const m = /^(\d+)\s*(?:[-–]\s*(\d*))?$/.exec(part);
      if (!m) throw new Error(`focus "${part}" is not a line or range like "2-4".`);
      const start = Number(m[1]);
      const isRange = /[-–]/.test(part);
      const end = isRange ? (m[2] ? Number(m[2]) : lineCount) : start;
      if (start < 1) throw new Error("focus lines start at 1.");
      if (end < start) throw new Error(`focus "${part}" goes backwards; use ${end}-${start}.`);
      for (let n = start; n <= Math.min(end, lineCount); n++) add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Columns reserved for line numbers: the widest number plus two spaces before the code. */
export function gutterColumns(maxLines: number): number {
  return String(Math.max(1, maxLines)).length + 2;
}
