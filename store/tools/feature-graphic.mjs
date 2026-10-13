// bun feature-graphic.mjs  ->  ../screenshots/android/feature-graphic.png (1024x500, Google Play)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const icon = `data:image/png;base64,${readFileSync(`${root}icon/icon-1024.png`).toString('base64')}`;
const shot = `data:image/png;base64,${readFileSync(`${root}screenshots/raw-android/3-explainer.png`).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:#0B0B0B;font-family:Roboto,system-ui,sans-serif;color:#fff}
  .copy{position:absolute;left:72px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center}
  img.icon{width:96px;height:96px;border-radius:22px;margin-bottom:28px}
  h1{margin:0;font-size:58px;line-height:1.04;color:#FF5A1F;font-weight:800;letter-spacing:-.03em}
  p{margin:16px 0 0;font-size:24px;line-height:1.35;color:#9A9A9A;font-weight:500}
  .screen{position:absolute;right:70px;top:46px;width:300px;border-radius:30px;overflow:hidden;box-shadow:0 0 0 2px #2c2c2e,0 30px 80px rgba(0,0,0,.6)}
  .screen img{display:block;width:100%}
</style></head><body>
  <div class="copy"><img class="icon" src="${icon}"><h1>Tiny tools,<br>made by you</h1><p>Describe what you need. Use it seconds later.</p></div>
  <div class="screen"><img src="${shot}"></div></body></html>`);
await page.waitForTimeout(200);
await page.screenshot({ path: `${root}screenshots/android/feature-graphic.png` });
await browser.close();
