import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";

export interface FrameBrowser {
  page: Page;
  capture(): Promise<Buffer>;
  close(): Promise<void>;
}

const INSTALL_HINT =
  "diffreel needs a Chromium browser. Install it once with:\n\n  npx playwright install chromium\n\n" +
  "or point DIFFREEL_CHROMIUM_PATH at an existing Chrome/Chromium executable.";

async function launch(): Promise<Browser> {
  const executablePath = process.env.DIFFREEL_CHROMIUM_PATH;
  if (executablePath) return chromium.launch({ executablePath });
  const errors: string[] = [];
  for (const channel of [undefined, "chromium", "chrome", "msedge"] as const) {
    try {
      return await chromium.launch(channel ? { channel } : {});
    } catch (error) {
      errors.push((error as Error).message.split("\n")[0] ?? String(error));
    }
  }
  throw new Error(`${INSTALL_HINT}\n\nLaunch errors:\n- ${errors.join("\n- ")}`);
}

/** Launch headless Chromium with a viewport of the output size rendered at `scale`x. */
export async function openBrowser(opts: { width: number; height: number; scale: number }): Promise<FrameBrowser> {
  const browser = await launch();
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: opts.scale,
    });
    const page = await context.newPage();
    let cdp: CDPSession | null = null;
    try {
      cdp = await context.newCDPSession(page);
    } catch {
      cdp = null;
    }
    return {
      page,
      async capture() {
        if (cdp) {
          const { data } = (await cdp.send("Page.captureScreenshot", {
            format: "png",
            optimizeForSpeed: true,
            captureBeyondViewport: false,
            fromSurface: true,
          })) as { data: string };
          return Buffer.from(data, "base64");
        }
        return page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      },
      async close() {
        await context?.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}
