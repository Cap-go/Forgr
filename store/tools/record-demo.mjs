// Records the Mapp demo video from the Vite dev server (bun run dev on BASE).
// bun record-demo.mjs  ->  ../video/demo-raw.webm (1080x1920) and timing in stdout
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5181';
const out = new URL('../video/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  recordVideo: { dir: out, size: { width: 1080, height: 1920 } },
});
const started = Date.now();
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

// Fresh state for every take.
await page.goto(`${base}/`);
await page.evaluate(async () => {
  localStorage.clear();
  for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
});
await page.goto(`${base}/store/tools/stage.html`);
const app = page.frameLocator('#app');
const appFrame = () => page.frames().find((f) => f.url().includes('demo=1'));
await app.locator('.grid .app-icon').first().waitFor();
await wait(800);
const t0 = Date.now();
console.log('content starts at', ((t0 - started) / 1000).toFixed(2), 's');

async function rectOf(selector, nested = false) {
  const frame = appFrame();
  if (!nested) return frame.evaluate((s) => document.querySelector(s).getBoundingClientRect().toJSON(), selector);
  const inner = frame.childFrames()[0];
  return inner.evaluate((s) => document.querySelector(s).getBoundingClientRect().toJSON(), selector);
}

async function tap(selector, { nested = false, nth } = {}) {
  const r = nth === undefined
    ? await rectOf(selector, nested)
    : await (nested ? appFrame().childFrames()[0] : appFrame())
      .evaluate(([s, i]) => document.querySelectorAll(s)[i].getBoundingClientRect().toJSON(), [selector, nth]);
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  const finger = page.evaluate(([px, py]) => window.tap(px, py), [x, y]);
  await wait(250);
  const loc = nested ? app.frameLocator('iframe.app-frame').locator(selector) : app.locator(selector);
  await (nth === undefined ? loc.first() : loc.nth(nth)).click();
  await finger;
}

const caption = (title, sub) => page.evaluate(([t, s]) => window.caption(t, s), [title, sub ?? '']);

await caption('Build your own apps.', 'Just by asking.');
await wait(2600);

await caption('Describe what you need', 'in plain words');
await tap('.composer-pill');
await wait(600);
await app.locator('.composer textarea').pressSequentially('A workout log with a weekly chart', { delay: 55 });
await wait(400);
await tap('.send');

await caption('AI builds it, right on your phone', 'with your ChatGPT plan');
await app.locator('.msg.assistant:not(.streaming)').last().waitFor({ timeout: 20000 });
await app.locator('.activity.finished').first().waitFor({ timeout: 20000 });
await wait(1200);
await tap('.sheet-head .chip:not(.strong)', { nth: 1 });

await caption('A real app. Only yours.', 'Data stays on your phone');
await wait(700);
await tap('.add', { nested: true, nth: 0 });
await wait(350);
await tap('.add', { nested: true, nth: 1 });
await wait(1200);

await caption('Pinch with three fingers', 'Home, Edit, or your other apps');
await wait(500);
await page.evaluate(() => window.pinch());
await appFrame().evaluate(() => window.__shell.openSwitcher());
await wait(1800);
await tap('.switch-btn.accent');

await caption('Change anything, anytime', 'Undo is always one tap away');
await wait(500);
await app.locator('.composer textarea').pressSequentially('Make it dark with neon green', { delay: 55 });
await wait(400);
await tap('.send');
await app.locator('.status').waitFor({ state: 'attached', timeout: 5000 });
await app.locator('.activity.finished').first().waitFor({ timeout: 20000 });
await wait(1600);
await tap('.sheet-head .chip:not(.strong)', { nth: 1 });
await wait(800);

await caption('Your apps, made by you.', 'Mapp · beta on TestFlight');
await wait(1000);
await page.evaluate(() => window.pinch());
await appFrame().evaluate(() => window.__shell.openSwitcher());
await wait(1500);
await tap('.switch-btn:first-child');
await wait(2600);

const total = (Date.now() - t0) / 1000;
console.log('content length', total.toFixed(2), 's');
const video = page.video();
await ctx.close();
await browser.close();
renameSync(await video.path(), `${out}demo-raw.webm`);
console.log('saved', `${out}demo-raw.webm`);
