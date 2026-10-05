import type { SizeInput } from "./types.js";

export interface Size {
  width: number;
  height: number;
}

export const SIZE_PRESETS: Readonly<Record<string, Size>> = Object.freeze({
  youtube: { width: 1920, height: 1080 },
  landscape: { width: 1920, height: 1080 },
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
  "4k": { width: 3840, height: 2160 },
  reel: { width: 1080, height: 1920 },
  reels: { width: 1080, height: 1920 },
  shorts: { width: 1080, height: 1920 },
  tiktok: { width: 1080, height: 1920 },
  story: { width: 1080, height: 1920 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  instagram: { width: 1080, height: 1080 },
});

export const DEFAULT_SIZE: Size = { width: 1920, height: 1080 };

const MIN_SIDE = 64;
const MAX_SIDE = 7680;

/** Resolve a preset name, "WxH" string or object to even pixel dimensions (required by yuv420p). */
export function parseSize(input: SizeInput | undefined): Size {
  if (input === undefined) return { ...DEFAULT_SIZE };
  let size: Size;
  if (typeof input === "object") {
    size = { width: input.width, height: input.height };
  } else {
    const key = input.trim().toLowerCase();
    const preset = SIZE_PRESETS[key];
    if (preset) {
      size = { ...preset };
    } else {
      const match = /^(\d+)\s*[x×]\s*(\d+)$/.exec(key);
      if (!match) {
        throw new Error(
          `Invalid size "${input}". Use WIDTHxHEIGHT (e.g. 1280x720) or a preset: ${Object.keys(SIZE_PRESETS).join(", ")}.`,
        );
      }
      size = { width: Number(match[1]), height: Number(match[2]) };
    }
  }
  for (const side of [size.width, size.height]) {
    if (!Number.isFinite(side) || side < MIN_SIDE || side > MAX_SIDE) {
      throw new Error(`Invalid size ${size.width}x${size.height}: each side must be between ${MIN_SIDE} and ${MAX_SIDE} pixels.`);
    }
  }
  return { width: even(size.width), height: even(size.height) };
}

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}
