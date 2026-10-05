export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutInput {
  width: number;
  height: number;
  /** Longest line (in character cells) across all steps. */
  maxCols: number;
  /** Most lines in any step. */
  maxLines: number;
  hasCaption: boolean;
  window: boolean;
  /** Explicit code font size in CSS px; auto-fit when omitted. */
  fontSize?: number;
  /** Monospace advance width divided by font size (measured in the browser). */
  charRatio: number;
  lineHeightRatio?: number;
}

export interface Layout {
  width: number;
  height: number;
  window: boolean;
  fontSize: number;
  charWidth: number;
  lineHeight: number;
  /** Window card (equals the frame when `window` is false). */
  card: Rect;
  titleBarHeight: number;
  /** Clipping area for code, in frame coordinates. */
  viewport: Rect;
  /** Horizontal offset of column 0 inside the viewport (centers short code). */
  contentOffsetX: number;
  caption: Rect | null;
  captionFontSize: number;
  /** Corner radius of the window card. */
  radius: number;
}

export const LINE_HEIGHT_RATIO = 1.6;

const round2 = (n: number) => Math.round(n * 2) / 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Choose a font size: fit the widest line, fit all lines when that stays readable, else scroll. */
export function autoFontSize(opts: {
  availWidth: number;
  availHeight: number;
  maxCols: number;
  maxLines: number;
  charRatio: number;
  lineHeightRatio: number;
  shortSide: number;
}): number {
  const cols = Math.max(opts.maxCols, 24);
  const lines = Math.max(opts.maxLines, 1);
  const maxFs = opts.shortSide / 22;
  const readable = opts.shortSide / 42;
  const floor = opts.shortSide / 90;
  const widthFit = opts.availWidth / (cols * opts.charRatio);
  const heightFit = opts.availHeight / (lines * opts.lineHeightRatio);
  let fs = Math.min(widthFit, maxFs);
  if (heightFit < fs) fs = Math.max(heightFit, Math.min(fs, readable));
  return round2(Math.max(fs, floor));
}

export function computeLayout(input: LayoutInput): Layout {
  const { width: W, height: H } = input;
  const lhRatio = input.lineHeightRatio ?? LINE_HEIGHT_RATIO;
  const short = Math.min(W, H);
  const margin = Math.round(short * (input.window ? 0.07 : 0.06));
  const captionFontSize = Math.round(short * 0.032);
  const captionHeight = input.hasCaption ? Math.round(captionFontSize * 1.4 * 2) : 0;
  const gap = input.hasCaption ? Math.round(short * 0.03) : 0;

  const region: Rect = {
    x: margin,
    y: margin,
    width: W - 2 * margin,
    height: H - 2 * margin - captionHeight - gap,
  };
  const caption: Rect | null = input.hasCaption
    ? { x: margin, y: H - margin - captionHeight, width: W - 2 * margin, height: captionHeight }
    : null;

  const titleBarHeight = input.window ? Math.round(short * 0.048) : 0;
  const pad = input.window ? Math.round(short * 0.035) : 0;
  const availWidth = region.width - 2 * pad;
  const availHeight = region.height - titleBarHeight - 2 * pad;

  const fontSize =
    input.fontSize ??
    autoFontSize({
      availWidth,
      availHeight,
      maxCols: input.maxCols,
      maxLines: input.maxLines,
      charRatio: input.charRatio,
      lineHeightRatio: lhRatio,
      shortSide: short,
    });
  const charWidth = fontSize * input.charRatio;
  const lineHeight = Math.round(fontSize * lhRatio);
  const contentWidth = Math.max(input.maxCols, 1) * charWidth;
  const blockHeight = Math.max(input.maxLines, 1) * lineHeight;

  let card: Rect;
  let viewport: Rect;
  let contentOffsetX: number;
  if (input.window) {
    const innerW = clamp(contentWidth, Math.min(availWidth, short * 0.55), availWidth);
    const innerH = clamp(blockHeight, Math.min(availHeight, lineHeight * 3), availHeight);
    const cardW = innerW + 2 * pad;
    const cardH = innerH + titleBarHeight + 2 * pad;
    card = {
      x: Math.round(region.x + (region.width - cardW) / 2),
      y: Math.round(region.y + (region.height - cardH) / 2),
      width: Math.round(cardW),
      height: Math.round(cardH),
    };
    viewport = {
      x: card.x + pad,
      y: card.y + titleBarHeight + pad,
      width: Math.round(innerW),
      height: Math.round(innerH),
    };
    contentOffsetX = 0;
  } else {
    card = { x: 0, y: 0, width: W, height: H };
    viewport = { x: region.x, y: region.y, width: availWidth, height: availHeight };
    contentOffsetX = Math.max(0, Math.round((availWidth - contentWidth) / 2));
  }

  // Widen the clip area so line highlights extend a little past the code on both sides.
  const gutter = Math.round(Math.min(fontSize * 0.6, input.window ? pad * 0.7 : margin * 0.7));
  viewport = { ...viewport, x: viewport.x - gutter, width: viewport.width + 2 * gutter };
  contentOffsetX += gutter;

  return {
    width: W,
    height: H,
    window: input.window,
    fontSize,
    charWidth,
    lineHeight,
    card,
    titleBarHeight,
    viewport,
    contentOffsetX,
    caption,
    captionFontSize,
    radius: Math.round(short * 0.014),
  };
}

/**
 * Vertical offset of the code layer for one step. Short code is centered; long code scrolls so
 * the focused (changed) line range sits in the middle of the viewport.
 */
export function stepOffsetY(opts: {
  layout: Layout;
  maxLines: number;
  stepLines: number;
  focus: [number, number] | null;
  previous: number;
}): number {
  const { layout } = opts;
  const viewH = layout.viewport.height;
  const blockH = Math.max(opts.maxLines, 1) * layout.lineHeight;
  if (blockH <= viewH) return Math.round((viewH - blockH) / 2);
  const contentH = opts.stepLines * layout.lineHeight;
  const maxScroll = Math.max(0, contentH - viewH);
  if (!opts.focus) return -clamp(-opts.previous, 0, maxScroll);
  const top = opts.focus[0] * layout.lineHeight;
  const bottom = (opts.focus[1] + 1) * layout.lineHeight;
  const scroll = bottom - top > viewH * 0.8 ? top - viewH * 0.1 : (top + bottom) / 2 - viewH / 2;
  return -Math.round(clamp(scroll, 0, maxScroll));
}
