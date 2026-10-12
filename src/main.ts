import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { session } from './ai/session';
import { isAndroid } from './platform';
import { Shell } from './ui/shell';

// Confirm this bundle started before anything slow runs, so Capgo never
// rolls back a good live update because startup took a few seconds.
if (Capacitor.isNativePlatform()) void CapacitorUpdater.notifyAppReady().catch(() => undefined);

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root');

const shell = new Shell(root);
const demo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');
if (demo) {
  localStorage.setItem('mapp_onboarded_v1', '1');
  // Fake device safe areas and status bar so recordings look like the device.
  const style = document.createElement('style');
  if (isAndroid) {
    style.textContent = '.safe-probe{padding:40px 0 24px 0!important}:root{--safe-top:40px!important;--safe-bottom:24px!important;' +
      '--demo-safe-top:40px;--demo-safe-bottom:24px;--demo-safe-left:0px;--demo-safe-right:0px}' +
      '.demo-status{position:fixed;top:0;left:0;right:0;height:40px;z-index:99;pointer-events:none;display:flex;align-items:center;' +
      'justify-content:space-between;padding:0 22px 0 26px;font:500 15px Roboto,system-ui;color:#fff;mix-blend-mode:difference}' +
      '.demo-nav{position:fixed;left:50%;bottom:9px;width:108px;height:4px;margin-left:-54px;border-radius:2px;background:#fff;mix-blend-mode:difference;z-index:99;pointer-events:none}';
    document.head.append(style);
    document.body.insertAdjacentHTML('beforeend', '<div class="demo-status"><span>9:41</span><span style="display:flex;gap:7px;align-items:center"><svg width="16" height="14" viewBox="0 0 16 14" fill="#fff"><path d="M8 13.5 0 3.5a12.5 12.5 0 0 1 16 0z"/></svg><svg width="14" height="14" viewBox="0 0 14 14" fill="#fff"><path d="M14 0v14H0z"/></svg><svg width="9" height="15" viewBox="0 0 9 15" fill="#fff"><rect x="2.5" width="4" height="2" rx=".5"/><rect y="1.5" width="9" height="13.5" rx="1.5"/></svg></span></div><div class="demo-nav"></div>');
  } else {
    style.textContent = '.safe-probe{padding:54px 0 34px 0!important}:root{--safe-top:54px!important;--safe-bottom:34px!important;' +
      '--demo-safe-top:54px;--demo-safe-bottom:34px;--demo-safe-left:0px;--demo-safe-right:0px}' +
      '.demo-status{position:fixed;top:0;left:0;right:0;height:54px;z-index:99;pointer-events:none;display:flex;align-items:center;' +
      'justify-content:space-between;padding:4px 34px 0 46px;font:600 17px -apple-system,system-ui;color:var(--status,#fff);mix-blend-mode:difference}';
    document.head.append(style);
    document.body.insertAdjacentHTML('beforeend', '<div class="demo-status"><span>9:41</span><span style="display:flex;gap:6px;align-items:center"><svg width="18" height="12" viewBox="0 0 18 12" fill="#fff"><rect y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" width="3" height="12" rx="1"/></svg><svg width="16" height="12" viewBox="0 0 16 12" fill="#fff"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0L11.1 8.3a4.4 4.4 0 0 0-6.2 0zM1.3 4.7a9.5 9.5 0 0 1 13.4 0l-1.4 1.4a7.5 7.5 0 0 0-10.6 0z"/></svg><svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#fff" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="#fff"/></svg></span></div>');
  }
  void import('./ui/demo').then(async ({ scriptedAgent }) => {
    shell.agent = scriptedAgent;
    await shell.init();
    session.demo('alex@example.com');
    if (new URLSearchParams(location.search).get('demo') === 'store') {
      const [{ STORE_TOOLS }, { appStore }] = await Promise.all([import('./ui/store-demo'), import('./apps/store')]);
      if (!appStore.list().some((a) => a.name === 'Groceries')) {
        for (const tool of STORE_TOOLS) await appStore.create(tool);
      }
    }
    (window as unknown as { __shell: Shell }).__shell = shell;
  });
} else {
  void shell.init();
}
