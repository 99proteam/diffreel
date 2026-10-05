<h1 align="center">diffreel</h1>

<p align="center"><b>Turn code changes into smooth animated videos.</b></p>

<p align="center">
  <a href="https://99proteam.github.io/diffreel/"><b>🎮 Live playground</b></a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#options">Options</a> ·
  <a href="examples">Examples</a> ·
  <a href="https://www.npmjs.com/package/diffreel">npm</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/diffreel"><img src="https://img.shields.io/npm/v/diffreel.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/diffreel"><img src="https://img.shields.io/npm/dm/diffreel.svg" alt="npm downloads"></a>
  <a href="https://github.com/99proteam/diffreel/actions/workflows/ci.yml"><img src="https://github.com/99proteam/diffreel/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/99proteam"><img src="https://img.shields.io/badge/☕_Sponsor_diffreel-Buy_me_a_coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000" alt="Sponsor diffreel on Buy Me a Coffee" height="48"></a>
</p>

<p align="center">
  <img src="docs/demo.gif" alt="diffreel demo: a bug fix animating from before to after" width="720">
</p>

Give diffreel two versions of a file, a git commit, or a list of steps, and it renders an MP4, WebM or GIF in which the code morphs from one version to the next. Unchanged code slides into its new position, removed code fades out, and new code fades or types in, all with syntax highlighting. Use it for tutorials, YouTube videos, reels, shorts and social posts.

**Try it without installing anything:** the [live playground](https://99proteam.github.io/diffreel/) runs the same engine in your browser. Edit the code, preview the animation, then download a `steps.json` and render it with one command.

- **Token-level magic move:** diffs by line, then by token, so `i <= n` becomes `i < n` by moving the tokens that stayed instead of retyping the line.
- **Syntax highlighting with [Shiki](https://shiki.style):** all VS Code themes and 200+ languages.
- **Runs locally:** no server, no account, no Remotion. diffreel uses headless Chromium plus a bundled ffmpeg.
- **Sharp text:** frames render at 2× device scale and are downsampled with Lanczos.
- **Made for social video:** 16:9, 9:16 reels and 1:1 square presets, captions, window frame, typing effect and change highlights.
- **Handles long files:** the viewport auto-scrolls to keep the changed region centered.

## Quick start

**Requirements:** Node.js 20 or newer ([download](https://nodejs.org)) on Windows, macOS or Linux. ffmpeg is bundled through [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static), so you don't install it yourself.

```bash
# 1. One-time setup: download the headless browser diffreel draws frames with
npx playwright install chromium

# 2. Render your first video
npx diffreel before.ts after.ts -o out.mp4
```

That's it: `out.mp4` is ready to upload. `npx` downloads diffreel on first use, so no install step is needed.

### Install options

| How | Command | When to use it |
| --- | --- | --- |
| No install | `npx diffreel ...` | Trying it out or rendering now and then |
| Global CLI | `npm install -g diffreel` and then `diffreel ...` | You make videos often |
| Project dev dependency | `npm install -D diffreel` | Rendering from npm scripts or CI |
| Library | `npm install diffreel` and then `import { render } from "diffreel"` | Generating videos from your own Node.js code |

As a project dev dependency, add a script to `package.json`:

```json
{
  "scripts": {
    "video": "diffreel docs/steps.json -o docs/tutorial.mp4"
  }
}
```

On Linux servers and CI, install the browser together with its system libraries: `npx playwright install --with-deps chromium`.

## Three ways to use it

### 1. Two files

```bash
npx diffreel before.ts after.ts -o out.mp4
```

Pass more files to chain them: `diffreel v1.ts v2.ts v3.ts -o out.mp4`.

### 2. A git commit

```bash
npx diffreel --git HEAD~1..HEAD --file src/app.ts -o out.mp4
```

- `A..B` creates one step for the file at `A`, then one per commit in the range that touched the file.
- A single commit `X` means `X~1..X`.
- `HEAD..` animates from `HEAD` to your uncommitted working tree.
- `--commit-captions` uses each commit message as the caption.

### 3. A steps file (a whole tutorial in one video)

```bash
npx diffreel steps.json -o out.mp4
```

```json
{
  "filename": "Counter.tsx",
  "lang": "tsx",
  "theme": "tokyo-night",
  "size": "reel",
  "window": true,
  "typing": true,
  "steps": [
    { "code": "export function Counter() {\n  return <button>0</button>;\n}", "caption": "Start simple" },
    { "file": "./Counter.step2.tsx", "caption": "Add state", "hold": 2500 },
    { "code": ["line one", "line two"], "caption": "Code can be an array of lines", "transition": 1200 }
  ]
}
```

Each step needs `code` (a string or an array of lines) or `file` (a path relative to the steps file). Optional per-step fields are `caption`, `hold` (ms on screen), `transition` (ms to morph into this step), `lang` and `filename`. Top-level fields set defaults for any [option](#options), and flags on the command line override them. A bare array of steps also works.

## Library API

```ts
import { render } from "diffreel";

await render({
  steps: [
    { code: "let total = 0;", lang: "ts", caption: "Before" },
    { code: "let total: number = 0;", lang: "ts", caption: "After" },
  ],
  output: "out.mp4",
  size: "reel",
  window: true,
  onProgress: ({ ratio }) => process.stdout.write(`\r${Math.round(ratio * 100)}%`),
});
```

`render()` resolves to `{ output, format, width, height, fps, frames, durationMs }`. The building blocks are exported as well: `loadGitSteps`, `loadStepsFile`, `planTransition`, `buildTimeline`, `frameAt`, `parseSize` and `SIZE_PRESETS`.

## Options

| CLI flag | Library option | Default | Description |
| --- | --- | --- | --- |
| `-o, --output <file>` | `output` | `<input>.mp4` | Output path. The extension picks the format. |
| `--format <fmt>` | `format` | from extension | `mp4`, `webm` or `gif`. |
| `--theme <name>` | `theme` | `github-dark` | Any bundled Shiki theme (`diffreel --list-themes`). |
| `--lang <id>` | `lang` / `step.lang` | from extension | Shiki language id, e.g. `ts`, `python`, `sql`. |
| `--size <size>` | `size` | `1920x1080` | Preset or `WIDTHxHEIGHT` (see below). |
| `--fps <n>` | `fps` | `30` | Frames per second (30 and 60 are typical). |
| `--font-size <px>` | `fontSize` | auto | Code font size. Auto fits the widest line and, when it stays readable, all lines. |
| `--font-family <name>` | `fontFamily` | JetBrains Mono | Code font. JetBrains Mono is bundled as the fallback. |
| `--transition <ms>` | `transition` / `step.transition` | `900` | Morph duration between steps. |
| `--hold <ms>` | `hold` / `step.hold` | `2000` | How long each step stays on screen. |
| `--typing` | `typing` | off | Type new code character by character instead of fading it in. |
| `--typing-speed <cps>` | `typingSpeed` | `40` | Typing speed in characters per second. |
| `--highlight-changes` | `highlightChanges` | off | Briefly glow the changed lines after each transition. |
| `--caption <text>` | `caption` / `step.caption` | none | Text shown under the code. |
| `--window` | `window` | off | macOS-style window frame with a file name tab. |
| `--title <name>` | `title` / `step.filename` | file name | Name shown in the window tab. |
| `--background <css>` | `background` | theme / gradient | Any CSS color or gradient, e.g. `"linear-gradient(135deg,#0f172a,#7c3aed)"`. |
| `--scale <n>` | `scale` | `2` | Device scale factor used when rendering frames. |
| `--git <range>` | `loadGitSteps()` | none | Read steps from git history. |
| `--file <path>` | `loadGitSteps()` | none | The file to follow with `--git`. |
| `--commit-captions` | `loadGitSteps({ commitCaptions })` | off | Use commit messages as captions. |
| `-q, --quiet` | none | off | No progress output. |
| `--list-themes` | `listThemes()` | none | Print all theme names. |

`--no-typing`, `--no-window` and `--no-highlight-changes` override a steps file that turns those on.

## Size presets

| Preset | Size | Use it for |
| --- | --- | --- |
| `youtube`, `landscape`, `1080p` | 1920×1080 | YouTube, presentations |
| `720p` | 1280×720 | smaller landscape files |
| `4k` | 3840×2160 | high-resolution landscape |
| `reel`, `reels`, `shorts`, `tiktok`, `story`, `portrait` | 1080×1920 | Instagram Reels, YouTube Shorts, TikTok |
| `square`, `instagram` | 1080×1080 | feed posts |

Any `WIDTHxHEIGHT` works too, for example `--size 1600x900`.

## Examples

The [`examples/`](examples) folder has five ready-made examples: a bug fix, a refactor, a React component growing step by step, a Python function and a SQL query. Render them all with:

```bash
npm run examples   # writes examples/output/*.mp4
```

## How it works

1. **Highlight.** Shiki tokenizes each snapshot. Tokens are split into words and single punctuation marks, each with a line and a column.
2. **Diff.** The `diff` package aligns lines (identical, moved or re-indented, changed), then matches tokens inside changed blocks by text and color with a longest-common-subsequence diff.
3. **Animate.** Every token gets a start and end position. Removed tokens fade out, matched tokens move with ease-in-out, and new tokens fade or type in. The viewport scroll is interpolated so the change stays centered.
4. **Render.** Each frame state is applied to an HTML page in headless Chromium (Playwright) at 2× scale and captured as a PNG. Identical frames during holds are reused.
5. **Encode.** Frames are piped into ffmpeg: H.264 for MP4, VP9 for WebM, or a palette-optimized GIF.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `diffreel needs a Chromium browser` | Run `npx playwright install chromium` once. On Linux, add `--with-deps`. |
| You already have Chrome and don't want another download | Set `DIFFREEL_CHROMIUM_PATH` to your Chrome or Chromium executable. diffreel also tries installed Chrome and Edge automatically. |
| ffmpeg failed to download (proxy, offline) | Install ffmpeg yourself and set `DIFFREEL_FFMPEG_PATH`, or make sure `ffmpeg` is on your `PATH`. |
| `Unknown language "..."` | Pass a Shiki language id with `--lang`, for example `ts`, `python`, `sql` or `go`. |
| `Unknown theme "..."` | Run `npx diffreel --list-themes` to see every theme name. |
| Text is too small in a reel | Lines are long for a 1080px-wide video. Wrap them, or set `--font-size`. Long files scroll automatically. |
| The GIF file is large | Use `--size 960x540 --fps 15`, or share an MP4 instead (much smaller). |

## FAQ

**Is it free?** Yes. diffreel is MIT-licensed open source, and it runs on your machine, so you don't need an account or an API key and nothing is uploaded.

**Does it need Remotion or After Effects?** No. diffreel renders frames in headless Chromium and encodes them with ffmpeg.

**Which languages and themes work?** Every language and theme bundled with [Shiki](https://shiki.style/languages): 200+ languages and 60+ themes, including github-dark, dracula, nord, tokyo-night and catppuccin.

**Can I use it in CI?** Yes. Install with `npx playwright install --with-deps chromium` and run the CLI or `render()`. This repo's own CI renders a test video on every pull request.

## Support this project

<p align="center">
  <a href="https://buymeacoffee.com/99proteam"><img src="https://img.shields.io/badge/☕_Buy_me_a_coffee-Support_diffreel-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000" alt="Buy me a coffee" height="56"></a>
</p>

diffreel is free and MIT-licensed. If it saves you editing time, you can support its development on **[Buy Me a Coffee](https://buymeacoffee.com/99proteam)**:

| Tier | Monthly | What you get |
| --- | --- | --- |
| ☕ **Coffee** | $5 | My thanks, and you keep the project alive |
| 🎬 **Creator** | $15 | Your name in the README supporters list |
| 🚀 **Studio** | $50 | Small logo in the README and priority on feature requests |
| 🏢 **Sponsor** | $200 | Large logo at the top of the README and a direct line for support |

One-time coffees are just as welcome. Starring the repo and sharing videos you made with diffreel help too.

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), and see [ROADMAP.md](ROADMAP.md) for what's planned.

## License

[MIT](LICENSE) © 99proteam
