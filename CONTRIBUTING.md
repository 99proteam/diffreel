# Contributing to diffreel

Thanks for helping. Bug reports, ideas, docs fixes and code are all welcome.

## Setup

```bash
git clone https://github.com/99proteam/diffreel.git
cd diffreel
npm install
npx playwright install chromium
```

You need Node.js 20 or newer.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run build` | Bundle `src/` to `dist/` with tsup |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | All Vitest tests, including the end-to-end render |
| `npm run test:unit` | Unit tests only (no browser needed) |
| `npm run examples` | Build, then render every example to `examples/output/` |

Try the CLI from source with `npm run build && node dist/cli.js before.ts after.ts -o out.mp4`.

## Project layout

```
src/
  cli.ts              command-line interface (commander)
  render.ts           render() pipeline: tokenize, lay out, animate, capture, encode
  highlight.ts        Shiki tokenization into positioned word/punctuation tokens
  diff.ts             line alignment, moved-line detection, token matching
  layout.ts           frame geometry, font auto-sizing, scroll offsets
  timeline.ts         segments plus the pure frameAt(t) interpolation
  page.ts             HTML/CSS scene and the in-page runtime
  browser.ts          Playwright launch and frame capture
  encode.ts           ffmpeg arguments and frame streaming
  inputs/git.ts       steps from git history
  inputs/steps-file.ts  steps JSON parser and validator
test/                 Vitest tests (e2e.test.ts renders a real video)
examples/             ready-to-render examples
```

`frameAt()` is pure: the same timeline and time always give the same frame state. Keep animation logic there and covered by tests in `test/timeline.test.ts`. The browser page only applies the state.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Add or update tests for your change.
3. Make sure `npm run lint && npm run typecheck && npm test` passes.
4. For visual changes, attach a short clip or GIF to the PR.
5. Add a line under `## [Unreleased]` in `CHANGELOG.md`.

## Releasing (maintainers)

1. Update `CHANGELOG.md` and bump the version with `npm version patch|minor|major`. This creates the tag.
2. Run `git push --follow-tags`. The `release` workflow tests and publishes to npm when it sees a `v*` tag.

## Code of conduct

Be kind and assume good intent. Harassment of any kind is not tolerated.
