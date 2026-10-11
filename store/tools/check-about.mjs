// Screenshots the Settings about block in demo mode (light + dark).
import { chromium } from 'playwright';
const base = process.env.BASE ?? 'http://localhost:5181';
const b = await chromium.launch();
for (const scheme of ['dark', 'light']) {
  const p = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: scheme })).newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto(`${base}/?demo=1`);
  await p.waitForSelector('.grid .app-icon');
  await p.locator('button.avatar').click(); await p.waitForTimeout(700);
  await p.locator('.capgo-pill').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await p.screenshot({ path: `/tmp/mapp-about-${scheme}.png` });
}
await b.close();
