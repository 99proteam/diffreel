export type OutputFormat = "mp4" | "webm" | "gif";

export type SizePreset =
  | "youtube"
  | "landscape"
  | "1080p"
  | "720p"
  | "4k"
  | "reel"
  | "reels"
  | "shorts"
  | "tiktok"
  | "story"
  | "portrait"
  | "square"
  | "instagram";

/** A size preset name, a "WIDTHxHEIGHT" string, or explicit dimensions. */
export type SizeInput = SizePreset | `${number}x${number}` | { width: number; height: number } | string;

/** One code snapshot in the video. */
export interface Step {
  /** Source code shown at this step. */
  code: string;
  /** Shiki language id (e.g. "ts", "python"). Defaults to the render-level `lang`, then "text". */
  lang?: string;
  /** Text shown under the code while this step is on screen. */
  caption?: string;
  /** How long this step stays on screen after its transition, in ms. */
  hold?: number;
  /** Duration of the transition *into* this step, in ms. */
  transition?: number;
  /** File name shown in the window tab (with `window: true`). */
  filename?: string;
}

export interface RenderProgress {
  frame: number;
  totalFrames: number;
  /** 0..1 */
  ratio: number;
}

export interface RenderOptions {
  /** Ordered code snapshots. At least one is required. */
  steps: Step[];
  /** Output file path. The extension picks the format unless `format` is given. */
  output: string;
  /** mp4 (default), webm or gif. */
  format?: OutputFormat;
  /** Preset name ("youtube", "reel", "square", ...), "WxH", or { width, height }. Default 1920x1080. */
  size?: SizeInput;
  /** Frames per second. Default 30. */
  fps?: number;
  /** Any bundled Shiki theme. Default "github-dark". */
  theme?: string;
  /** Default language for steps without one. */
  lang?: string;
  /** Code font size in CSS pixels. Default: fit the longest line / the tallest step. */
  fontSize?: number;
  /** Code font family. JetBrains Mono is bundled and used as the fallback. */
  fontFamily?: string;
  /** Default transition duration in ms. Default 900. */
  transition?: number;
  /** Default time each step is held on screen, in ms. Default 2000. */
  hold?: number;
  /** Type new code character by character instead of fading it in. */
  typing?: boolean;
  /** Typing speed in characters per second (with `typing`). Default 40. */
  typingSpeed?: number;
  /** Briefly glow changed lines after each transition. */
  highlightChanges?: boolean;
  /** Caption used for steps that don't have their own. */
  caption?: string;
  /** Draw a macOS-style window frame with a file name tab. */
  window?: boolean;
  /** File name shown in the window tab when a step has none. */
  title?: string;
  /** Any CSS color or gradient for the frame background. */
  background?: string;
  /** Device scale factor used to render frames (text sharpness). Default 2. */
  scale?: number;
  /** Called after every encoded frame. */
  onProgress?: (progress: RenderProgress) => void;
}

export interface RenderResult {
  output: string;
  format: OutputFormat;
  width: number;
  height: number;
  fps: number;
  frames: number;
  durationMs: number;
}
