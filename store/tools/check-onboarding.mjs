// Screenshots the first onboarding slides (fresh install state).
import { chromium } from 'playwright';
const base = process.env.BASE ?? 'http://localhost:5181';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: 'dark' })).newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(`${base}/`);
await p.evaluate(async () => { localStorage.clear(); for (const d of await indexedDB.databases()) indexedDB.deleteDatabase(d.name); });
await p.goto(`${base}/`);
await p.waitForSelector('.onboarding');
for (let i = 0; i < 4; i++) {
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `/tmp/mapp-onb${i}.png` });
  await p.locator('.onboarding .btn').first().click();
}
await b.close();
