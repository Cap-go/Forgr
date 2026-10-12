// Records the App Store preview (886x1920) from the dev server in store demo mode.
// bun record-preview.mjs  ->  ../video/preview-raw.webm
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5181';
const out = new URL('../video/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await browser0();
async function browser0() { return chromium.launch(); }

// Reset data first, without recording.
const setup = await browser.newPage();
await setup.goto(`${base}/`);
await setup.evaluate(async () => { localStorage.clear(); for (const d of await indexedDB.databases()) indexedDB.deleteDatabase(d.name); });
await setup.close();

const ctx = await browser.newContext({ viewport: { width: 886, height: 1920 }, colorScheme: 'dark', recordVideo: { dir: out, size: { width: 886, height: 1920 } } });
const started = Date.now();
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(`${base}/store/tools/preview-stage.html`);
const app = page.frameLocator('#app');
const appFrame = () => page.frames().find((f) => f.url().includes('demo=store'));
await app.locator('.grid .app-icon', { hasText: 'Groceries' }).waitFor();
await wait(600);
console.log('content starts at', ((Date.now() - started) / 1000).toFixed(2));
const t0 = Date.now();

await wait(1800);
await app.locator('.composer-pill').click();
await wait(500);
await app.locator('.composer textarea').pressSequentially('Explain compound interest with sliders I can play with', { delay: 45 });
await wait(300);
await app.locator('.send').click();
await app.locator('.activity.finished').first().waitFor({ timeout: 20000 });
await wait(1500);
await app.locator('.app-card-open').first().click();
await wait(1400);

// Play with the sliders like a person would.
const inner = () => appFrame().childFrames()[0];
for (const [id, from, to, step] of [['s3', 20, 35, 1], ['s1', 200, 450, 25], ['s2', 7, 10, 0.5]]) {
  for (let v = from; v <= to; v += step) {
    await inner().evaluate(([el, value]) => { const i = document.getElementById(el); i.value = value; i.dispatchEvent(new Event('input')); }, [id, v]);
    await wait(55);
  }
  await wait(500);
}
await wait(800);

await appFrame().evaluate(() => window.__shell.openSwitcher());
await wait(1600);
await app.locator('.switch-strip .app-icon', { hasText: 'Groceries' }).click();
await wait(1500);
await appFrame().evaluate(() => window.__shell.openSwitcher());
await wait(1200);
await app.locator('.switch-btn:first-child').click();
await wait(2200);

console.log('content length', ((Date.now() - t0) / 1000).toFixed(2));
const video = page.video();
await ctx.close();
await browser.close();
renameSync(await video.path(), `${out}preview-raw.webm`);
