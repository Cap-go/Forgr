// Frames raw screens into App Store screenshots.
// bun frame-store.mjs  ->  ../screenshots/6.9/*.png (1320x2868) and ../screenshots/6.5/*.png (1284x2778)
// OS=android bun frame-store.mjs  ->  ../screenshots/android/*.png (1080x1920, Google Play phone)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const root = new URL('../screenshots/', import.meta.url).pathname;
const android = process.env.OS === 'android';
const shots = android ? [
  ['1-home', 'Tiny tools, made by you', 'Describe what you need. Use it seconds later.'],
  ['2-chat', 'Just describe it', 'Mapp makes the tool right on your phone.'],
  ['3-explainer', 'Learn by playing', 'Interactive explainers instead of walls of text.'],
  ['4-switcher', 'Pinch to switch', 'Three fingers: home, edit or another tool.'],
  ['5-edit', 'Change anything', 'Ask for a change. Undo with one tap.'],
  ['6-secrets', 'Your keys stay yours', 'Saved in the Android Keystore. The AI never sees them.'],
] : [
  ['1-home', 'Tiny tools, made by you', 'Describe what you need. Use it seconds later.'],
  ['2-chat', 'Just describe it', 'Mapp makes the tool right on your iPhone.'],
  ['3-explainer', 'Learn by playing', 'Interactive explainers instead of walls of text.'],
  ['4-switcher', 'Pinch to switch', 'Three fingers: home, edit or another tool.'],
  ['5-edit', 'Change anything', 'Ask for a change. Undo with one tap.'],
  ['6-secrets', 'Your keys stay yours', 'Saved in the Keychain. The AI never sees them.'],
];
// screen: device width, top: where it starts (null = bleed off the bottom).
const sizes = android ? [
  { dir: 'android', raw: 'raw-android', width: 1080, height: 1920, screen: 953, top: 400, font: 'Roboto,system-ui,sans-serif' },
] : [
  { dir: '6.9', raw: 'raw', width: 1320, height: 2868, screen: 1060, top: null },
  { dir: '6.5', raw: 'raw', width: 1284, height: 2778, screen: 1060, top: null },
];

const browser = await chromium.launch();
for (const size of sizes) {
  mkdirSync(`${root}${size.dir}`, { recursive: true });
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
  for (const [name, title, sub] of shots) {
    const img = `data:image/png;base64,${readFileSync(`${root}${size.raw}/${name}.png`).toString('base64')}`;
    const s = size.width / 1320;
    await page.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;width:${size.width}px;height:${size.height}px;overflow:hidden;background:#000;
        font-family:${size.font ?? "-apple-system,'SF Pro Display',system-ui,sans-serif"};color:#fff}
      .glow{position:absolute;inset:0;background:radial-gradient(70% 28% at 50% 0%,rgba(110,86,247,.45),transparent 70%)}
      .copy{position:absolute;top:${150 * s}px;left:${90 * s}px;right:${90 * s}px;text-align:center}
      h1{margin:0;font-size:${104 * s}px;line-height:1.04;font-weight:800;letter-spacing:-.035em}
      p{margin:${26 * s}px 0 0;font-size:${46 * s}px;line-height:1.3;color:rgba(235,235,245,.68);font-weight:500}
      .screen{position:absolute;left:50%;${size.top == null ? `bottom:${-90 * s}px` : `top:${size.top}px`};transform:translateX(-50%);width:${size.screen * s}px;
        border-radius:${64 * s}px;overflow:hidden;box-shadow:0 0 0 ${3 * s}px #2c2c2e,0 ${40 * s}px ${120 * s}px rgba(0,0,0,.6)}
      .screen img{display:block;width:100%}
    </style></head><body><div class="glow"></div>
      <div class="copy"><h1>${title}</h1><p>${sub}</p></div>
      <div class="screen"><img src="${img}"></div></body></html>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${root}${size.dir}/${name}.png` });
    console.log(size.dir, name);
  }
  await page.close();
}
await browser.close();
