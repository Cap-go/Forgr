import assert from 'node:assert/strict';
import { webkit } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:5181';
const browser = await webkit.launch();
try {
  const context = await browser.newContext({ viewport: { width: 466, height: 678 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/?demo=store`);
  await page.locator('.grid .app-icon', { hasText: 'Groceries' }).waitFor();
  const columns = () => page.locator('.grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  assert.equal(await columns(), 4);
  await page.setViewportSize({ width: 951, height: 669 });
  assert.ok(await columns() > 4);
  await page.locator('.grid .app-icon', { hasText: 'Groceries' }).click();
  await page.locator('iframe.app-frame').waitFor();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--demo-safe-right', '84px');
    document.documentElement.style.setProperty('--safe-right', '84px', 'important');
    window.dispatchEvent(new Event('resize'));
  });
  const frame = page.frameLocator('iframe.app-frame');
  await frame.locator('html').evaluate((element) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Safe-area update timed out')), 5000);
    const check = () => getComputedStyle(element).getPropertyValue('--safe-right').trim() === '84px'
      ? (clearTimeout(timeout), resolve()) : requestAnimationFrame(check);
    check();
  }));
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--demo-safe-right', 'initial');
    document.documentElement.style.removeProperty('--safe-right');
    document.documentElement.style.setProperty('--cap-native-navigation-right', '96px');
    window.dispatchEvent(new CustomEvent('capNativeNavigation:safeAreaChanged'));
  });
  await frame.locator('html').evaluate((element) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Native navigation inset update timed out')), 5000);
    const check = () => getComputedStyle(element).getPropertyValue('--safe-right').trim() === '96px'
      ? (clearTimeout(timeout), resolve()) : requestAnimationFrame(check);
    check();
  }));
  await page.evaluate(() => window.__shell.openSwitcher());
  await page.locator('.switch-btn.accent').click();
  await page.getByRole('button', { name: 'Hide chat', exact: true }).click();
  await page.locator('.bubble').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const bubble = document.querySelector('.bubble');
    bubble.style.left = '850px';
    bubble.style.top = '500px';
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  });
  await page.setViewportSize({ width: 466, height: 678 });
  await page.waitForFunction(() => document.querySelector('.bubble').style.left === '');
  const bubble = await page.locator('.bubble').boundingBox();
  assert.ok(bubble.x >= 0 && bubble.x + bubble.width <= 466 - 96);
  await page.evaluate(() => window.__shell.goHome());
  await page.setViewportSize({ width: 951, height: 669 });
  await page.locator('.composer-pill').click();
  await page.locator('.composer textarea').fill('A grocery list');
  assert.ok(await page.locator('.send').isVisible());
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.onboarding').waitFor();
  for (const viewport of [{ width: 951, height: 669 }, { width: 466, height: 678 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const button = await page.getByRole('button', { name: 'Continue', exact: true }).boundingBox();
    assert.ok(button.y >= 0 && button.y + button.height <= viewport.height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: Duo cover/unfolded layout, live safe areas, chat bubble after folding, composer and onboarding');
} finally {
  await browser.close();
}
