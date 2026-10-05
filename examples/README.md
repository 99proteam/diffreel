# Examples

Five ready-made examples. Render all of them (the output goes to `examples/output/`):

```bash
npm run examples
```

Or render one at a time with the commands below (from the repo root, after `npm run build`). Replace `node dist/cli.js` with `npx diffreel` when you use the published package.

## 1. Bug fix: `bug-fix/`

An off-by-one loop and an accidental `=` that should be `===`. Shows token-level moves and change glow.

```bash
node dist/cli.js examples/bug-fix/before.js examples/bug-fix/after.js \
  --title users.js --window --highlight-changes \
  --caption "Fix the off-by-one and the accidental assignment" -o bug-fix.mp4
```

## 2. Refactor: `refactor/`

Promise chains rewritten as async/await, with the `one-dark-pro` theme and a slower transition.

```bash
node dist/cli.js examples/refactor/before.ts examples/refactor/after.ts \
  --title profile.ts --theme one-dark-pro --window --transition 1400 --hold 2500 \
  --caption "Promise chains → async/await" -o refactor.mp4
```

## 3. React component growing step by step: `react-component/steps.json`

Four steps with captions, rendered as a vertical **reel** (1080×1920) with typing, a window frame and the `tokyo-night` theme. All of those settings live in the steps file.

```bash
node dist/cli.js examples/react-component/steps.json -o react-component.mp4
```

## 4. Python function: `python-function/`

A loop replaced by `statistics.fmean`, with type hints and a docstring. Square format, typing effect, `catppuccin-mocha` theme and a custom gradient background.

```bash
node dist/cli.js examples/python-function/before.py examples/python-function/after.py \
  --title stats.py --theme catppuccin-mocha --size square --typing --highlight-changes \
  --background "linear-gradient(160deg, #1e1e2e, #45475a)" -o python-function.mp4
```

## 5. SQL query: `sql-query/steps.json`

A query built up clause by clause: join, filter, group, order. Uses a light theme (`github-light`) in square format.

```bash
node dist/cli.js examples/sql-query/steps.json -o sql-query.mp4
```
