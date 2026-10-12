// Captures raw App Store screens from the dev server in store demo mode.
// bun run dev (port 5181), then: bun shoot-store.mjs  ->  ../screenshots/raw/*.png (1320x2868)
// OS=android bun shoot-store.mjs  ->  ../screenshots/raw-android/*.png (1236x2745, Android chrome and wording)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5181';
const android = process.env.OS === 'android';
const out = new URL(android ? '../screenshots/raw-android/' : '../screenshots/raw/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: android ? { width: 412, height: 915 } : { width: 440, height: 956 }, deviceScaleFactor: 3, colorScheme: 'dark' });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const shot = async (name) => {
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}${name}.png` });
  console.log('shot', name);
};
const app = (name) => p.locator('.grid .app-icon', { hasText: name });

await p.goto(`${base}/`);
await p.evaluate(async () => { localStorage.clear(); for (const d of await indexedDB.databases()) indexedDB.deleteDatabase(d.name); });
await p.goto(`${base}/?demo=store${android ? '&os=android' : ''}`);
await app('Groceries').waitFor();
await shot('1-home');

// Build an explainer from the chat.
await p.locator('.composer-pill').click();
await p.locator('.composer textarea').fill('Explain compound interest with sliders I can play with');
await p.locator('.send').click();
await p.locator('.activity.finished').first().waitFor({ timeout: 20000 });
await p.locator('.activity-summary').first().click();
await shot('2-chat');

// The explainer itself, after moving a slider.
await p.locator('.app-card-open').first().click();
await p.waitForTimeout(600);
const frame = p.frameLocator('iframe.app-frame');
await frame.locator('#s3').fill('30');
await frame.locator('#s1').fill('300');
await frame.locator('#s1').evaluate((el) => el.blur());
await shot('3-explainer');

// Three-finger pinch switcher.
await p.evaluate(() => window.__shell.openSwitcher());
await shot('4-switcher');

// Change a tool from its chat.
await p.locator('.switch-btn:first-child').click();
await app('Groceries').click();
await p.waitForTimeout(500);
await p.evaluate(() => window.__shell.openSwitcher());
await p.waitForTimeout(300);
await p.locator('.switch-btn.accent').click();
await p.waitForTimeout(400);
await p.locator('.composer textarea').fill('Sort by aisle and let my partner add items');
await shot('5-edit');

// Secure key card.
await p.locator('[aria-label="Hide chat"]').click();
await p.evaluate(() => window.__shell.goHome());
await p.locator('.composer-pill').click();
await p.waitForTimeout(800);
await p.locator('.composer textarea').fill('A dashboard of my Stripe revenue');
await p.locator('.send').click();
await p.locator('.question-card').waitFor();
await p.locator('.card-option', { hasText: 'Last 7 days' }).click();
await p.locator('.secret-card input[type=password]').fill('demo-key-0000000000000000');
await shot('6-secrets');

await browser.close();
