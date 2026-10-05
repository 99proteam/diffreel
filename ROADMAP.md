# Roadmap

These are ideas for future versions, roughly in priority order. Want one sooner? Open an issue or
[support the project](https://buymeacoffee.com/99proteam).

## Next

- **Voice-over with captions.** Attach an audio file (or generate speech) per step, time each step to its narration, and burn in word-level subtitles.
- **Cursor highlights.** An animated cursor or spotlight that points at the line or token being explained.
- **Line numbers** that animate with the code.
- **Focus and dim.** Dim everything except the lines a step is about.

## Later

- **VS Code extension.** Select two versions, a commit or the current diff, and click "Render video".
- **Render a whole pull request.** `diffreel --pr 123` turns each changed file into a chapter with a title card.
- **Multiple files in one video.** Tabs that switch between files as the tutorial moves on.
- **Intro and outro cards** with title, author and links.
- **Faster rendering** by capturing frames in parallel across several browser pages.
- **Audio bed and typing sounds.**
- **YAML and Markdown steps files**, so tutorials can be written as prose with code blocks.

## Done

- Two-file, git and steps-file inputs (0.1.0)
- Token-level morphing, typing, change glow, captions, window frame (0.1.0)
