// Live playground: runs the real diffreel engine (Shiki tokens -> diff -> timeline -> scene HTML)
// in the browser and plays it back frame by frame. Only the ffmpeg encoding step stays in the CLI.
import { charCount, createTokenizer, listThemes } from "../../src/highlight.js";
import { computeLayout } from "../../src/layout.js";
import { buildHtml } from "../../src/page.js";
import { parseSize } from "../../src/sizes.js";
import { buildTimeline, frameAt, segmentTokens, type Timeline } from "../../src/timeline.js";

interface ExampleStep {
  code: string;
  caption?: string;
}

interface Settings {
  lang: string;
  theme: string;
  size: string;
  window: boolean;
  typing: boolean;
  highlightChanges: boolean;
  transition: number;
  hold: number;
  filename: string;
  background?: string;
  steps: ExampleStep[];
}

interface Example extends Settings {
  id: string;
  name: string;
}

declare const __EXAMPLES__: Example[];

interface SceneRuntime {
  setSegment(list: unknown): void;
  frame(state: unknown): void;
}

const LANGS = [
  "typescript", "tsx", "javascript", "jsx", "python", "sql", "go", "rust", "java", "kotlin", "swift", "c", "cpp",
  "csharp", "php", "ruby", "html", "css", "json", "yaml", "shellscript", "markdown", "vue", "svelte", "dart", "text",
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fontCss = `@import url("${new URL("fonts/fonts.css", document.baseURI).href}");`;

let settings: Settings = structuredClone(__EXAMPLES__[0]!);
let timeline: Timeline | null = null;
let runtime: SceneRuntime | null = null;
let frame: HTMLIFrameElement | null = null;
let segment = -1;
let time = 0;
let playing = true;
let lastTick = 0;
let charRatio = 0;
let buildId = 0;

// ---------- controls ----------

function fillSelect(select: HTMLSelectElement, values: Array<[string, string]>) {
  select.innerHTML = values.map(([v, label]) => `<option value="${v}">${label}</option>`).join("");
}

function initControls() {
  fillSelect($("example"), __EXAMPLES__.map((e) => [e.id, e.name]));
  fillSelect($("lang"), LANGS.map((l) => [l, l]));
  fillSelect($("theme"), listThemes().map((t) => [t, t]));
  fillSelect($("size"), [
    ["youtube", "YouTube 16:9"],
    ["reel", "Reel 9:16"],
    ["square", "Square 1:1"],
  ]);

  $("example").addEventListener("change", (e) => {
    const ex = __EXAMPLES__.find((x) => x.id === (e.target as HTMLSelectElement).value);
    if (ex) loadSettings(structuredClone(ex));
  });
  for (const id of ["lang", "theme", "size", "filename", "background"]) {
    $(id).addEventListener("input", () => {
      readControls();
      schedule();
    });
  }
  for (const id of ["window", "typing", "highlightChanges"]) {
    $(id).addEventListener("change", () => {
      readControls();
      schedule();
    });
  }
  for (const id of ["transition", "hold"]) {
    $(id).addEventListener("input", () => {
      readControls();
      $(`${id}-value`).textContent = `${settings[id as "transition" | "hold"]} ms`;
      schedule();
    });
  }
  $("add-step").addEventListener("click", () => {
    const last = settings.steps[settings.steps.length - 1];
    settings.steps.push({ code: last?.code ?? "", caption: "" });
    renderSteps();
    schedule();
  });
  $("play").addEventListener("click", () => setPlaying(!playing));
  $("restart").addEventListener("click", () => {
    time = 0;
    setPlaying(true);
  });
  $<HTMLInputElement>("scrub").addEventListener("input", (e) => {
    if (!timeline) return;
    setPlaying(false);
    time = (Number((e.target as HTMLInputElement).value) / 1000) * timeline.durationMs;
    draw();
  });
  $("copy-command").addEventListener("click", () => copy($("command").textContent ?? "", $("copy-command")));
  $("download").addEventListener("click", downloadSteps);
  $("share").addEventListener("click", () => void share());
}

function loadSettings(next: Settings) {
  settings = next;
  $<HTMLSelectElement>("lang").value = settings.lang;
  $<HTMLSelectElement>("theme").value = settings.theme;
  $<HTMLSelectElement>("size").value = settings.size;
  $<HTMLInputElement>("filename").value = settings.filename;
  $<HTMLInputElement>("background").value = settings.background ?? "";
  $<HTMLInputElement>("window").checked = settings.window;
  $<HTMLInputElement>("typing").checked = settings.typing;
  $<HTMLInputElement>("highlightChanges").checked = settings.highlightChanges;
  $<HTMLInputElement>("transition").value = String(settings.transition);
  $<HTMLInputElement>("hold").value = String(settings.hold);
  $("transition-value").textContent = `${settings.transition} ms`;
  $("hold-value").textContent = `${settings.hold} ms`;
  renderSteps();
  schedule(0);
}

function readControls() {
  settings.lang = $<HTMLSelectElement>("lang").value;
  settings.theme = $<HTMLSelectElement>("theme").value;
  settings.size = $<HTMLSelectElement>("size").value;
  settings.filename = $<HTMLInputElement>("filename").value;
  const bg = $<HTMLInputElement>("background").value.trim();
  settings.background = bg || undefined;
  settings.window = $<HTMLInputElement>("window").checked;
  settings.typing = $<HTMLInputElement>("typing").checked;
  settings.highlightChanges = $<HTMLInputElement>("highlightChanges").checked;
  settings.transition = Number($<HTMLInputElement>("transition").value);
  settings.hold = Number($<HTMLInputElement>("hold").value);
}

function renderSteps() {
  const list = $("steps");
  list.innerHTML = "";
  settings.steps.forEach((step, i) => {
    const card = document.createElement("div");
    card.className = "step";
    card.innerHTML = `
      <div class="step-head">
        <span class="step-num">Step ${i + 1}</span>
        <input class="step-caption" type="text" placeholder="Caption (optional)" aria-label="Caption for step ${i + 1}">
        <button class="icon-btn" type="button" title="Remove step" aria-label="Remove step ${i + 1}" ${settings.steps.length <= 1 ? "disabled" : ""}>✕</button>
      </div>
      <textarea class="step-code" spellcheck="false" aria-label="Code for step ${i + 1}"></textarea>`;
    const caption = card.querySelector<HTMLInputElement>(".step-caption")!;
    const code = card.querySelector<HTMLTextAreaElement>(".step-code")!;
    caption.value = step.caption ?? "";
    code.value = step.code;
    code.rows = Math.min(16, Math.max(4, step.code.split("\n").length + 1));
    caption.addEventListener("input", () => {
      step.caption = caption.value;
      schedule();
    });
    code.addEventListener("input", () => {
      step.code = code.value;
      schedule();
    });
    code.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      code.setRangeText("  ", code.selectionStart, code.selectionEnd, "end");
      step.code = code.value;
      schedule();
    });
    card.querySelector("button")!.addEventListener("click", () => {
      settings.steps.splice(i, 1);
      renderSteps();
      schedule();
    });
    list.appendChild(card);
  });
}

// ---------- building the scene ----------

let timer: number | undefined;
function schedule(delay = 350) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void rebuild(), delay);
  updateCommand();
}

async function measureCharRatio(): Promise<number> {
  const probe = document.createElement("iframe");
  probe.className = "probe";
  probe.srcdoc = `<!doctype html><style>${fontCss}body{margin:0}#m{position:absolute;white-space:pre;font:100px 'JetBrains Mono',monospace;font-variant-ligatures:none}</style><span id="m"></span>`;
  document.body.appendChild(probe);
  await new Promise((r) => probe.addEventListener("load", r, { once: true }));
  const doc = probe.contentDocument!;
  await doc.fonts.load("100px 'JetBrains Mono'").catch(() => null);
  await doc.fonts.ready;
  const m = doc.getElementById("m")!;
  m.textContent = "M".repeat(200);
  const ratio = m.getBoundingClientRect().width / 200 / 100;
  probe.remove();
  return ratio > 0 ? ratio : 0.6;
}

async function rebuild() {
  const id = ++buildId;
  const status = $("status");
  try {
    status.textContent = "Rendering…";
    status.dataset.state = "busy";
    if (!charRatio) charRatio = await measureCharRatio();
    const steps = settings.steps.length ? settings.steps : [{ code: "" }];
    const tokenizer = await createTokenizer(settings.theme, [settings.lang]);
    const lines = steps.map((s) => tokenizer.highlight(s.code, settings.lang).lines);
    tokenizer.dispose();
    if (id !== buildId) return;

    const size = parseSize(settings.size);
    const hasCaption = steps.some((s) => s.caption);
    const layout = computeLayout({
      ...size,
      maxCols: Math.max(1, ...lines.flatMap((step) => step.map((l) => charCount(l.text)))),
      maxLines: Math.max(1, ...lines.map((l) => l.length)),
      hasCaption,
      window: settings.window,
      charRatio,
    });
    const next = buildTimeline({
      steps: steps.map((s, i) => ({
        lines: lines[i]!,
        caption: s.caption || undefined,
        filename: settings.filename,
        hold: settings.hold,
        transition: settings.transition,
      })),
      layout,
      typing: settings.typing,
      highlightChanges: settings.highlightChanges,
    });

    const html = buildHtml({ layout, fontCss, theme: tokenizer.theme, background: settings.background });
    const iframe = document.createElement("iframe");
    iframe.className = "scene";
    iframe.title = "diffreel preview";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.width = `${size.width}px`;
    iframe.style.height = `${size.height}px`;
    iframe.srcdoc = html;
    const stage = $("stage");
    stage.appendChild(iframe);
    await new Promise((r) => iframe.addEventListener("load", r, { once: true }));
    await iframe.contentDocument!.fonts.ready;
    if (id !== buildId) {
      iframe.remove();
      return;
    }

    frame?.remove();
    frame = iframe;
    runtime = (iframe.contentWindow as unknown as { __diffreel: SceneRuntime }).__diffreel;
    timeline = next;
    segment = -1;
    time = Math.min(time, next.durationMs);
    fit();
    draw();
    status.textContent = `${(next.durationMs / 1000).toFixed(1)}s · ${steps.length} step${steps.length === 1 ? "" : "s"} · ${size.width}×${size.height}`;
    status.dataset.state = "ok";
  } catch (error) {
    if (id !== buildId) return;
    status.textContent = (error as Error).message;
    status.dataset.state = "error";
  }
}

function fit() {
  if (!frame || !timeline) return;
  const stage = $("stage");
  const { width, height } = timeline.layout;
  const maxH = Math.min(window.innerHeight * 0.62, 640);
  const scale = Math.min(stage.clientWidth / width, maxH / height);
  frame.style.transform = `scale(${scale})`;
  frame.style.left = `${(stage.clientWidth - width * scale) / 2}px`;
  stage.style.height = `${height * scale}px`;
}

// ---------- playback ----------

function draw() {
  if (!timeline || !runtime) return;
  const state = frameAt(timeline, time);
  if (state.segment !== segment) {
    segment = state.segment;
    runtime.setSegment(segmentTokens(timeline.segments[segment]!));
  }
  runtime.frame(state);
  $<HTMLInputElement>("scrub").value = String(Math.round((time / Math.max(1, timeline.durationMs)) * 1000));
  $("time").textContent = `${(Math.min(time, timeline.durationMs) / 1000).toFixed(1)}s / ${(timeline.durationMs / 1000).toFixed(1)}s`;
}

function setPlaying(value: boolean) {
  playing = value;
  $("play").textContent = playing ? "Pause" : "Play";
  $("play").setAttribute("aria-pressed", String(!playing));
}

function tick(now: number) {
  const dt = lastTick ? now - lastTick : 0;
  lastTick = now;
  if (playing && timeline) {
    time += dt;
    if (time > timeline.durationMs + 600) time = 0; // short pause on the last frame, then loop
    draw();
  }
  requestAnimationFrame(tick);
}

// ---------- export ----------

function stepsJson(): string {
  const data: Record<string, unknown> = {
    filename: settings.filename || undefined,
    lang: settings.lang,
    theme: settings.theme,
    size: settings.size,
    window: settings.window,
    typing: settings.typing,
    highlightChanges: settings.highlightChanges,
    transition: settings.transition,
    hold: settings.hold,
    background: settings.background,
    steps: settings.steps.map((s) => ({ code: s.code.split("\n"), ...(s.caption ? { caption: s.caption } : {}) })),
  };
  return JSON.stringify(data, null, 2) + "\n";
}

function updateCommand() {
  $("command").textContent = "npx diffreel steps.json -o diffreel.mp4";
}

function downloadSteps() {
  const blob = new Blob([stepsJson()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "steps.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copy(text: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = label), 1400);
  } catch {
    // Clipboard blocked: leave the text selectable.
  }
}

async function share() {
  const bytes = new TextEncoder().encode(JSON.stringify(settings));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  packed.forEach((b) => (bin += String.fromCharCode(b)));
  const hash = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  history.replaceState(null, "", `#s=${hash}`);
  await copy(location.href, $("share"));
}

async function fromHash(): Promise<Settings | null> {
  const m = /#s=([\w-]+)/.exec(location.hash);
  if (!m) return null;
  try {
    const bin = atob(m[1]!.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const parsed = JSON.parse(await new Response(stream).text()) as Settings;
    return Array.isArray(parsed.steps) ? { ...structuredClone(__EXAMPLES__[0]!), ...parsed } : null;
  } catch {
    return null;
  }
}

// ---------- page extras ----------

function initCopyButtons() {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.copy!);
      void copy(target?.textContent?.trim() ?? "", btn);
    });
  });
}

async function main() {
  initControls();
  initCopyButtons();
  new ResizeObserver(fit).observe($("stage"));
  loadSettings((await fromHash()) ?? settings);
  requestAnimationFrame(tick);
}

void main();
