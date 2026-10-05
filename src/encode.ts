import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import type { OutputFormat } from "./types.js";

const require = createRequire(import.meta.url);

/** Path to the ffmpeg binary: $DIFFREEL_FFMPEG_PATH, then ffmpeg-static, then "ffmpeg" on PATH. */
export function ffmpegPath(): string {
  if (process.env.DIFFREEL_FFMPEG_PATH) return process.env.DIFFREEL_FFMPEG_PATH;
  try {
    const p = require("ffmpeg-static") as string | null;
    if (p) return p;
  } catch {
    // fall through
  }
  return "ffmpeg";
}

export interface EncoderOptions {
  output: string;
  format: OutputFormat;
  fps: number;
  /** Final video size; input frames are scaled down to it (supersampling). */
  width: number;
  height: number;
}

export function ffmpegArgs(opts: EncoderOptions): string[] {
  const scale = `scale=${opts.width}:${opts.height}:flags=lanczos`;
  const input = ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(opts.fps), "-c:v", "png", "-i", "-"];
  switch (opts.format) {
    case "mp4":
      return [
        ...input,
        "-vf",
        `${scale},format=yuv420p`,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-tune",
        "animation",
        "-movflags",
        "+faststart",
        "-r",
        String(opts.fps),
        opts.output,
      ];
    case "webm":
      return [
        ...input,
        "-vf",
        `${scale},format=yuv420p`,
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        "30",
        "-row-mt",
        "1",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-r",
        String(opts.fps),
        opts.output,
      ];
    case "gif":
      return [
        ...input,
        "-filter_complex",
        `[0:v]${scale},split[a][b];[a]palettegen=stats_mode=diff:max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
        "-loop",
        "0",
        "-r",
        String(opts.fps),
        opts.output,
      ];
  }
}

export interface Encoder {
  write(frame: Buffer): Promise<void>;
  finish(): Promise<void>;
  abort(): void;
}

/** Spawn ffmpeg and stream PNG frames into it. */
export function createEncoder(opts: EncoderOptions): Encoder {
  const proc = spawn(ffmpegPath(), ffmpegArgs(opts), { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
    if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
  });
  let failure: Error | null = null;
  const exited = new Promise<void>((resolve, reject) => {
    proc.on("error", (error) => {
      failure = new Error(`Could not start ffmpeg (${ffmpegPath()}): ${error.message}`);
      reject(failure);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        failure = new Error(`ffmpeg exited with code ${code}${stderr ? `:\n${stderr.trim()}` : ""}`);
        reject(failure);
      }
    });
  });
  exited.catch(() => undefined);
  proc.stdin.on("error", () => undefined);

  return {
    async write(frame) {
      if (failure) throw failure;
      if (!proc.stdin.write(frame)) {
        await Promise.race([once(proc.stdin, "drain"), exited]);
      }
      if (failure) throw failure;
    },
    async finish() {
      proc.stdin.end();
      await exited;
    },
    abort() {
      proc.stdin.destroy();
      proc.kill("SIGKILL");
    },
  };
}
