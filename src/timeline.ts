import { planTransition, type TransitionPlan } from "./diff.js";
import { charCount, type CodeLine, type CodeToken } from "./highlight.js";
import { stepOffsetY, type Layout } from "./layout.js";

export interface TimelineStep {
  lines: CodeLine[];
  caption?: string;
  filename?: string;
  /** Hold time after this step's transition, ms. */
  hold: number;
  /** Transition into this step, ms (ignored for the first step). */
  transition: number;
}

export interface TimelineInput {
  steps: TimelineStep[];
  layout: Layout;
  typing?: boolean;
  /** Characters per second when typing. */
  typingSpeed?: number;
  highlightChanges?: boolean;
}

export interface SegmentToken {
  text: string;
  fontStyle: number;
}

interface StaticToken extends SegmentToken {
  x: number;
  y: number;
  color: string;
}

interface AnimToken extends SegmentToken {
  kind: "matched" | "removed" | "added";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color0: string;
  color1: string;
  /** Typing: characters typed before this token starts. */
  typeAt: number;
  length: number;
}

type Range = [number, number];

export interface HoldSegment {
  kind: "hold";
  step: number;
  start: number;
  duration: number;
  tokens: StaticToken[];
  offsetY: number;
  glowRows: number[];
  glowMs: number;
  caption?: string;
  filename?: string;
}

export interface TransitionSegment {
  kind: "transition";
  from: number;
  to: number;
  start: number;
  duration: number;
  tokens: AnimToken[];
  offsetFrom: number;
  offsetTo: number;
  exit: Range;
  move: Range;
  enter: Range;
  typing: boolean;
  typedChars: number;
  glowRows: number[];
  captionFrom?: string;
  captionTo?: string;
  filename?: string;
}

export type Segment = HoldSegment | TransitionSegment;

export interface Timeline {
  segments: Segment[];
  durationMs: number;
  layout: Layout;
  highlightChanges: boolean;
  plans: TransitionPlan[];
}

/** [x, y, opacity, visibleChars (-1 = all), color] */
export type ItemFrame = [number, number, number, number, string];

export interface FrameState {
  segment: number;
  offsetY: number;
  items: ItemFrame[];
  /** [y, opacity] per highlighted row. */
  glow: Array<[number, number]>;
  /** [x, y, opacity] of the typing caret. */
  caret: [number, number, number] | null;
  /** [text, opacity] */
  captions: Array<[string, number]>;
  filename: string;
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function progress(t: number, [s, e]: Range): number {
  if (e <= s) return t >= s ? 1 : 0;
  return clamp01((t - s) / (e - s));
}

/** Interpolate two #rgb/#rrggbb(aa) colors; falls back to switching halfway. */
export function mixColor(a: string, b: string, t: number): string {
  if (a === b || t <= 0) return a;
  if (t >= 1) return b;
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  const c = pa.map((v, i) => Math.round(lerp(v, pb[i]!, t)));
  return `rgba(${c[0]},${c[1]},${c[2]},${(c[3]! / 255).toFixed(3)})`;
}

function parseHex(color: string): number[] | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
  if (hex.length === 6) hex += "ff";
  if (hex.length !== 8) return null;
  return [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** Changed lines worth highlighting (blank lines are skipped). */
function glowLines(plan: TransitionPlan, lines: CodeLine[]): number[] {
  return plan.changedLines.filter((l) => (lines[l]?.tokens.length ?? 0) > 0);
}

/** Line range worth keeping on screen after a transition. */
function focusRange(plan: TransitionPlan): [number, number] | null {
  const lines = [...plan.changedLines, ...plan.added.map((t) => t.line)];
  if (lines.length === 0) return null;
  return [Math.min(...lines), Math.max(...lines)];
}

export function buildTimeline(input: TimelineInput): Timeline {
  const { layout, steps } = input;
  if (steps.length === 0) throw new Error("At least one step is required.");
  const typing = input.typing ?? false;
  const typingSpeed = input.typingSpeed && input.typingSpeed > 0 ? input.typingSpeed : 40;
  const highlightChanges = input.highlightChanges ?? false;
  const maxLines = Math.max(...steps.map((s) => s.lines.length), 1);
  const lh = layout.lineHeight;
  const px = (t: Pick<CodeToken, "line" | "col">) => ({ x: layout.contentOffsetX + t.col * layout.charWidth, y: t.line * lh });

  const plans: TransitionPlan[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    let focus: [number, number] | null = null;
    if (i > 0) {
      const plan = planTransition(steps[i - 1]!.lines, step.lines);
      plans.push(plan);
      focus = focusRange(plan);
    }
    offsets.push(
      stepOffsetY({ layout, maxLines, stepLines: step.lines.length, focus, previous: offsets[i - 1] ?? 0 }),
    );
  }

  const segments: Segment[] = [];
  let time = 0;
  const pushHold = (i: number) => {
    const step = steps[i]!;
    const plan = i > 0 ? plans[i - 1] : undefined;
    const glowRows = highlightChanges && plan ? glowLines(plan, step.lines).map((l) => l * lh) : [];
    segments.push({
      kind: "hold",
      step: i,
      start: time,
      duration: Math.max(0, step.hold),
      tokens: step.lines.flatMap((line) =>
        line.tokens.map((t) => ({ text: t.text, fontStyle: t.fontStyle, color: t.color, ...px(t) })),
      ),
      offsetY: offsets[i]!,
      glowRows,
      glowMs: Math.min(1600, Math.max(0, step.hold)),
      caption: step.caption,
      filename: step.filename,
    });
    time += Math.max(0, step.hold);
  };

  pushHold(0);
  for (let i = 1; i < steps.length; i++) {
    const plan = plans[i - 1]!;
    const step = steps[i]!;
    const T = Math.max(0, step.transition);
    const hasExit = plan.removed.length > 0;
    const hasEnter = plan.added.length > 0;
    const overlap = 0.15;
    const e = hasExit ? 0.35 : 0;
    const n = hasEnter ? 0.35 : 0;
    const exit: Range = [0, e * T];
    const move: Range = [Math.max(0, e - overlap) * T, Math.min(1, 1 - n + (n > 0 ? overlap : 0)) * T];

    const tokens: AnimToken[] = [];
    for (const { from, to } of plan.matched) {
      const a = px(from);
      const b = px(to);
      tokens.push({
        kind: "matched",
        text: to.text,
        fontStyle: to.fontStyle,
        x0: a.x,
        y0: a.y,
        x1: b.x,
        y1: b.y,
        color0: from.color,
        color1: to.color,
        typeAt: 0,
        length: charCount(to.text),
      });
    }
    for (const t of plan.removed) {
      const a = px(t);
      tokens.push({
        kind: "removed",
        text: t.text,
        fontStyle: t.fontStyle,
        x0: a.x,
        y0: a.y,
        x1: a.x,
        y1: a.y,
        color0: t.color,
        color1: t.color,
        typeAt: 0,
        length: charCount(t.text),
      });
    }
    const added = [...plan.added].sort((p, q) => p.line - q.line || p.col - q.col);
    let typed = 0;
    let prev: CodeToken | null = null;
    for (const t of added) {
      if (prev) typed += prev.line === t.line ? Math.max(0, t.col - (prev.col + charCount(prev.text))) : 2;
      const b = px(t);
      tokens.push({
        kind: "added",
        text: t.text,
        fontStyle: t.fontStyle,
        x0: b.x,
        y0: b.y,
        x1: b.x,
        y1: b.y,
        color0: t.color,
        color1: t.color,
        typeAt: typed,
        length: charCount(t.text),
      });
      typed += charCount(t.text);
      prev = t;
    }

    let enter: Range;
    let duration: number;
    if (typing && hasEnter) {
      const typeMs = Math.max(200, (typed / typingSpeed) * 1000);
      enter = [move[1], move[1] + typeMs];
      duration = enter[1] + Math.min(300, T * 0.2);
    } else {
      enter = [(1 - n) * T, T];
      duration = T;
    }

    segments.push({
      kind: "transition",
      from: i - 1,
      to: i,
      start: time,
      duration,
      tokens,
      offsetFrom: offsets[i - 1]!,
      offsetTo: offsets[i]!,
      exit,
      move,
      enter,
      typing: typing && hasEnter,
      typedChars: typed,
      glowRows: highlightChanges ? glowLines(plan, step.lines).map((l) => l * lh) : [],
      captionFrom: steps[i - 1]!.caption,
      captionTo: step.caption,
      filename: step.filename ?? steps[i - 1]!.filename,
    });
    time += duration;
    pushHold(i);
  }

  return { segments, durationMs: time, layout, highlightChanges, plans };
}

/** Find the segment active at time t (ms). */
export function segmentAt(timeline: Timeline, t: number): number {
  const segs = timeline.segments;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (t < s.start + s.duration) return i;
  }
  return segs.length - 1;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Compute the full visual state at time t (ms). Pure: same input, same output. */
export function frameAt(timeline: Timeline, t: number): FrameState {
  const index = segmentAt(timeline, t);
  const seg = timeline.segments[index]!;
  const local = Math.max(0, t - seg.start);
  const lh = timeline.layout.lineHeight;
  const cw = timeline.layout.charWidth;

  if (seg.kind === "hold") {
    const g = seg.glowMs;
    let glowOpacity = 0;
    if (g > 0 && local < g) glowOpacity = local < g * 0.35 ? 1 : 1 - easeInOutCubic((local - g * 0.35) / (g * 0.65));
    return {
      segment: index,
      offsetY: r2(seg.offsetY),
      items: seg.tokens.map((tk) => [r2(tk.x), r2(tk.y), 1, -1, tk.color]),
      glow: glowOpacity > 0 ? seg.glowRows.map((y) => [y, r3(glowOpacity)]) : [],
      caret: null,
      captions: seg.caption ? [[seg.caption, 1]] : [],
      filename: seg.filename ?? "",
    };
  }

  const exitP = easeOutCubic(progress(local, seg.exit));
  const moveP = easeInOutCubic(progress(local, seg.move));
  const enterRaw = progress(local, seg.enter);
  const enterP = easeOutCubic(enterRaw);
  const typedNow = enterRaw * seg.typedChars;

  let caret: FrameState["caret"] = null;
  const items: ItemFrame[] = seg.tokens.map((tk) => {
    if (tk.kind === "matched") {
      return [r2(lerp(tk.x0, tk.x1, moveP)), r2(lerp(tk.y0, tk.y1, moveP)), 1, -1, mixColor(tk.color0, tk.color1, moveP)];
    }
    if (tk.kind === "removed") {
      return [r2(tk.x0), r2(tk.y0 - lh * 0.25 * exitP), r3(1 - exitP), -1, tk.color0];
    }
    if (seg.typing) {
      const visible = Math.max(0, Math.min(tk.length, Math.floor(typedNow - tk.typeAt)));
      if (enterRaw > 0 && enterRaw < 1 && typedNow >= tk.typeAt && typedNow <= tk.typeAt + tk.length + 0.999) {
        caret = [r2(tk.x1 + visible * cw), r2(tk.y1), 1];
      }
      return [r2(tk.x1), r2(tk.y1), visible > 0 ? 1 : 0, visible >= tk.length ? -1 : visible, tk.color1];
    }
    return [r2(tk.x1), r2(tk.y1 + lh * 0.25 * (1 - enterP)), r3(enterP), -1, tk.color1];
  });

  const captions: Array<[string, number]> = [];
  if (seg.captionFrom === seg.captionTo) {
    if (seg.captionTo) captions.push([seg.captionTo, 1]);
  } else {
    const p = local / Math.max(1, seg.duration);
    if (seg.captionFrom) captions.push([seg.captionFrom, r3(1 - progress(p, [0, 0.4]))]);
    if (seg.captionTo) captions.push([seg.captionTo, r3(progress(p, [0.6, 1]))]);
  }

  const glowStart = seg.typing ? seg.enter[1] : seg.duration * 0.7;
  const glowP = r3(easeOutCubic(progress(local, [glowStart, seg.duration])));

  return {
    segment: index,
    offsetY: r2(lerp(seg.offsetFrom, seg.offsetTo, moveP)),
    items,
    glow: glowP > 0 ? seg.glowRows.map((y) => [y, glowP]) : [],
    caret,
    captions,
    filename: seg.filename ?? "",
  };
}

/** Static text/style of each token element in a segment (sent to the browser once per segment). */
export function segmentTokens(seg: Segment): SegmentToken[] {
  return seg.tokens.map((t) => ({ text: t.text, fontStyle: t.fontStyle }));
}
