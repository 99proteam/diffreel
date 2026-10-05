# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-05

### Added

- `diffreel` CLI and `render()` library API.
- Three inputs: two or more files, a git range (`--git A..B --file path`, single commits, `HEAD..` for the working tree) and a JSON steps file.
- Line-level then token-level diffing, with moved and re-indented lines detected, so code moves instead of being retyped.
- Shiki syntax highlighting with any bundled theme and language.
- Rendering in headless Chromium at 2× scale, encoded by bundled ffmpeg to MP4 (H.264), WebM (VP9) or GIF.
- Options: `--theme`, `--lang`, `--size` (presets `youtube`, `reel`, `square` and more), `--fps`, `--font-size`, `--font-family`, `--transition`, `--hold`, `--typing`, `--typing-speed`, `--highlight-changes`, `--caption`, `--window`, `--title`, `--background`, `--format`, `--commit-captions`.
- Automatic font sizing and auto-scroll that keeps changes centered in long files.
- Bundled JetBrains Mono (code) and Inter (captions) fonts, so output looks the same on every OS.
- Five examples, a Vitest suite and an end-to-end render test.

[Unreleased]: https://github.com/99proteam/diffreel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/99proteam/diffreel/releases/tag/v0.1.0
