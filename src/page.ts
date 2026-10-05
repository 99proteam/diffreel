import type { ThemeInfo } from "./highlight.js";
import type { Layout, Rect } from "./layout.js";

export interface PageOptions {
  layout: Layout;
  /** @font-face rules (inlined fonts in Node, a stylesheet import in the browser playground). */
  fontCss: string;
  theme: ThemeInfo;
  fontFamily?: string;
  background?: string;
}

export const DEFAULT_GRADIENTS = {
  dark: "linear-gradient(135deg, #0f172a 0%, #312e81 55%, #7c3aed 100%)",
  light: "linear-gradient(135deg, #e0e7ff 0%, #fae8ff 55%, #fbcfe8 100%)",
} as const;

const CODE_FONT = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
const CAPTION_FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function codeFont(custom?: string): string {
  return custom ? `${quoteFamily(custom)}, ${CODE_FONT}` : CODE_FONT;
}

function quoteFamily(family: string): string {
  return /^['"]|,/.test(family) ? family : `'${family.replace(/'/g, "")}'`;
}

function escapeCss(value: string): string {
  return value.replace(/[<>{};]/g, "");
}

function box(r: Rect): string {
  return `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;`;
}

/** Minimal page used to measure the monospace advance width before computing the layout. */
export function measureHtml(fontCss: string, fontFamily?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
body{margin:0}
#m{font-family:${codeFont(fontFamily)};font-size:100px;white-space:pre;position:absolute;font-variant-ligatures:none}
</style></head><body><span id="m"></span></body></html>`;
}

export const MEASURE_SCRIPT = `async (fontFamily) => {
  await document.fonts.ready;
  const fam = getComputedStyle(document.getElementById('m')).fontFamily;
  await Promise.all(['400 100px', '700 100px', 'italic 400 100px', 'italic 700 100px'].map((f) => document.fonts.load(f + ' ' + fam).catch(() => null)));
  const el = document.getElementById('m');
  el.textContent = 'M'.repeat(200);
  return el.getBoundingClientRect().width / 200 / 100;
}`;

export function buildHtml(opts: PageOptions): string {
  const { layout: L, theme } = opts;
  const dark = theme.type === "dark";
  const bodyBg = opts.background
    ? escapeCss(opts.background)
    : L.window
      ? DEFAULT_GRADIENTS[theme.type]
      : theme.bg;
  const onCanvas = L.window || Boolean(opts.background);
  const captionColor = onCanvas ? (dark ? "#ffffff" : "#1f2937") : theme.fg;
  const shadowLight = !dark;
  const caretWidth = Math.max(2, Math.round(L.fontSize * 0.09));
  const dot = Math.round(L.titleBarHeight * 0.26);
  const tabFont = Math.round(L.titleBarHeight * 0.36);

  const windowChrome = L.window
    ? `<div id="titlebar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><div id="tab"><span id="filename"></span></div></div>`
    : `<span id="filename" hidden></span>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
${opts.fontCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${L.width}px;height:${L.height}px;overflow:hidden}
body{background:${bodyBg};-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
#card{position:absolute;${box(L.card)}${
    L.window
      ? `background:${theme.bg};border-radius:${L.radius}px;box-shadow:0 ${Math.round(L.height * 0.03)}px ${Math.round(L.height * 0.08)}px rgba(0,0,0,${dark ? 0.55 : 0.25}),0 0 0 1px rgba(${dark ? "255,255,255,0.10" : "0,0,0,0.08"});overflow:hidden;`
      : ""
  }}
#titlebar{position:absolute;left:0;top:0;width:100%;height:${L.titleBarHeight}px;display:flex;align-items:center;padding-left:${Math.round(L.titleBarHeight * 0.45)}px;gap:${Math.round(dot * 0.6)}px;background:color-mix(in srgb, ${theme.bg} 88%, #000);border-bottom:1px solid color-mix(in srgb, ${theme.fg} 10%, transparent)}
.dot{width:${dot}px;height:${dot}px;border-radius:50%;flex:none}
#tab{position:absolute;left:50%;top:0;height:100%;transform:translateX(-50%);display:flex;align-items:center;font:500 ${tabFont}px ${CAPTION_FONT};color:color-mix(in srgb, ${theme.fg} 70%, transparent);white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis}
#viewport{position:absolute;left:${L.viewport.x - L.card.x}px;top:${L.viewport.y - L.card.y}px;width:${L.viewport.width}px;height:${L.viewport.height}px;overflow:hidden}
#content{position:absolute;left:0;top:0;width:100%;will-change:transform}
#glow,#tokens{position:absolute;left:0;top:0;width:100%}
.g{position:absolute;left:0;width:100%;height:${L.lineHeight}px;background:${dark ? "rgba(56,189,248,0.14)" : "rgba(14,116,144,0.10)"};box-shadow:inset ${Math.max(3, Math.round(L.fontSize * 0.15))}px 0 0 ${dark ? "rgba(56,189,248,0.85)" : "rgba(14,116,144,0.7)"};border-radius:${Math.round(L.fontSize * 0.2)}px}
.t{position:absolute;left:0;top:0;height:${L.lineHeight}px;line-height:${L.lineHeight}px;font-family:${codeFont(opts.fontFamily)};font-size:${L.fontSize}px;white-space:pre;overflow:hidden;font-variant-ligatures:none;font-kerning:none;will-change:transform,opacity}
.i{font-style:italic}.b{font-weight:700}.u{text-decoration:underline}.s{text-decoration:line-through}
#caret{position:absolute;left:0;top:0;width:${caretWidth}px;height:${Math.round(L.lineHeight * 0.78)}px;margin-top:${Math.round(L.lineHeight * 0.11)}px;background:${theme.fg};opacity:0;border-radius:1px}
#caption{position:absolute;${L.caption ? box(L.caption) : "display:none;"}}
.cap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font:600 ${L.captionFontSize}px/1.35 ${CAPTION_FONT};color:${captionColor};opacity:0;${
    shadowLight ? "" : "text-shadow:0 2px 12px rgba(0,0,0,0.35);"
  }padding:0 4%;overflow:hidden}
</style></head>
<body>
<div id="card">${windowChrome}<div id="viewport"><div id="content"><div id="glow"></div><div id="tokens"></div><div id="caret"></div></div></div></div>
<div id="caption"><div class="cap"></div><div class="cap"></div></div>
<script>
(() => {
  const CW = ${L.charWidth};
  const tokens = document.getElementById('tokens');
  const glow = document.getElementById('glow');
  const content = document.getElementById('content');
  const caret = document.getElementById('caret');
  const caps = document.querySelectorAll('.cap');
  const filename = document.getElementById('filename');
  let els = [];
  let glows = [];
  window.__diffreel = {
    setSegment(list) {
      tokens.textContent = '';
      els = list.map((t) => {
        const el = document.createElement('span');
        let cls = 't';
        if (t.fontStyle & 1) cls += ' i';
        if (t.fontStyle & 2) cls += ' b';
        if (t.fontStyle & 4) cls += ' u';
        if (t.fontStyle & 8) cls += ' s';
        el.className = cls;
        el.textContent = t.text;
        tokens.appendChild(el);
        return el;
      });
    },
    frame(s) {
      content.style.transform = 'translateY(' + s.offsetY + 'px)';
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const it = s.items[i];
        el.style.transform = 'translate(' + it[0] + 'px,' + it[1] + 'px)';
        el.style.opacity = it[2];
        el.style.color = it[4];
        el.style.width = it[3] < 0 ? '' : (it[3] * CW) + 'px';
      }
      while (glows.length < s.glow.length) {
        const g = document.createElement('div');
        g.className = 'g';
        glow.appendChild(g);
        glows.push(g);
      }
      for (let i = 0; i < glows.length; i++) {
        const g = s.glow[i];
        glows[i].style.opacity = g ? g[1] : 0;
        if (g) glows[i].style.transform = 'translateY(' + g[0] + 'px)';
      }
      if (s.caret) {
        caret.style.transform = 'translate(' + s.caret[0] + 'px,' + s.caret[1] + 'px)';
        caret.style.opacity = s.caret[2];
      } else {
        caret.style.opacity = 0;
      }
      for (let i = 0; i < caps.length; i++) {
        const c = s.captions[i];
        if (c && caps[i].textContent !== c[0]) caps[i].textContent = c[0];
        caps[i].style.opacity = c ? c[1] : 0;
      }
      if (filename.textContent !== s.filename) filename.textContent = s.filename;
    },
  };
})();
</script>
</body></html>`;
}
