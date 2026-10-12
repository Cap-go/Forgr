// Hide the chat, then reopen it from home at different speeds.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 440, height: 956 }, colorScheme: 'dark' })).newPage();
await p.goto('http://localhost:5181/?demo=store');
await p.waitForSelector('.grid .app-icon');
for (const delay of [0, 100, 300, 800]) {
  await p.locator('.composer-pill').click();
  await p.waitForTimeout(600);
  await p.locator('[aria-label="Hide chat"]').click();
  await p.waitForTimeout(delay);
  await p.locator('.composer-pill').click();
  await p.waitForTimeout(700);
  const visible = await p.locator('.chat-sheet').isVisible();
  const presented = await p.evaluate(() => document.querySelector('cap-sheet:not(.modal-layer cap-sheet)')?.presented);
  console.log(`reopen after ${delay}ms: visible=${visible} presented=${presented}`);
  await p.locator('[aria-label="Hide chat"]').click().catch(() => {});
  await p.waitForTimeout(800);
}
await b.close();
