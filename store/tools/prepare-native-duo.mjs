import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../screenshots/iphone-duo/', import.meta.url));
const source = fileURLToPath(new URL('../screenshots/iphone-duo-source/', import.meta.url));
const files = readdirSync(output).filter((name) => name.endsWith('.png')).sort();
assert.equal(files.length, 6, 'Expected six native captures');
mkdirSync(source, { recursive: true });
const manifest = [];
for (const name of files) {
  const captured = `${source}${name}`;
  const upload = `${output}${name}`;
  if (!existsSync(captured)) copyFileSync(upload, captured);
  const opaque = execFileSync('magick', ['identify', '-format', '%[opaque]', captured], { encoding: 'utf8' }).trim();
  assert.equal(opaque.toLowerCase(), 'true', `${name} contains transparent pixels`);
  const png = execFileSync('magick', [captured, '-alpha', 'off', 'PNG24:-'], { maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(upload, png);
  execFileSync('magick', ['compare', '-metric', 'AE', captured, upload, 'null:'], { stdio: 'pipe' });
  const dimensions = execFileSync('magick', ['identify', '-format', '%w %h', upload], { encoding: 'utf8' }).trim();
  const [width, height] = dimensions.split(' ').map(Number);
  assert.ok((width === 2853 && height === 2007) || (width === 1398 && height === 2034));
  manifest.push({
    file: name,
    width,
    height,
    captureSha256: createHash('sha256').update(readFileSync(captured)).digest('hex'),
    uploadSha256: createHash('sha256').update(png).digest('hex'),
    changedPixels: 0,
  });
}
writeFileSync(new URL('../iphone-duo-captures.json', import.meta.url), `${JSON.stringify({
  bundleId: 'app.capgo.mapp',
  displayType: 'APP_IPHONE_DUO',
  simulator: 'Forgr iPhone Duo QA',
  udid: '23138453-87E3-47D1-852C-1FD60EB112BF',
  os: 'iOS 27.1',
  appVersion: '1.3.6',
  captureMethod: 'agent-device screenshot --pixel-density 3 --normalize-status-bar',
  conversion: 'Removed fully opaque alpha channel only. ImageMagick AE comparison confirms zero changed pixels.',
  files: manifest,
}, null, 2)}\n`);
console.log('Prepared six RGB screenshots; zero pixels changed. Original captures preserved.');
