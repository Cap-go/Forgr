// bun contact.mjs <dir> <out.png>: one-row contact sheet of a screenshot folder for quick review.
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const imgs = readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
  .map((f) => `data:image/png;base64,${readFileSync(`${dir}/${f}`).toString('base64')}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 533 } });
await page.setContent(`<body style="margin:0;display:flex;gap:6px;background:#333">${imgs.map((i) => `<img src="${i}" style="height:533px">`).join('')}</body>`);
await page.screenshot({ path: out });
await browser.close();
