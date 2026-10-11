import type { MiniAppMeta } from './store';

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Runs inside every mini app (sandboxed iframe, opaque origin). Exposes
 * window.mapp, forwards errors to the host and detects the 3-finger pinch.
 */
function runtime(): void {
  const host = window.parent;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let seq = 0;

  const call = (method: string, args?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      host.postMessage({ __mapp: 'call', id, method, args }, '*');
    });

  const listeners = new Map<string, Set<(data: unknown) => void>>();

  window.addEventListener('message', (event) => {
    if (event.source !== host) return;
    const data = event.data as { __mapp?: string; id?: number; result?: unknown; error?: string; name?: string; payload?: unknown };
    if (data?.__mapp === 'reply' && typeof data.id === 'number') {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data.result);
    }
    if (data?.__mapp === 'event' && data.name) {
      listeners.get(data.name)?.forEach((fn) => fn(data.payload));
    }
  });

  const log = (level: string, parts: unknown[]): void => {
    const message = parts.map((p) => {
      if (p instanceof Error) return `${p.name}: ${p.message}`;
      if (typeof p === 'string') return p;
      try { return JSON.stringify(p); } catch { return String(p); }
    }).join(' ').slice(0, 1000);
    host.postMessage({ __mapp: 'log', level, message }, '*');
  };
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      log(level, args);
    };
  }
  window.addEventListener('error', (e) => log('error', [`${e.message} (line ${e.lineno}:${e.colno})`]));
  window.addEventListener('unhandledrejection', (e) => log('error', ['Unhandled promise rejection:', e.reason]));

  (window as unknown as { mapp: unknown }).mapp = {
    storage: {
      get: (key: string) => call('storage.get', { key }),
      set: (key: string, value: unknown) => call('storage.set', { key, value }),
      remove: (key: string) => call('storage.remove', { key }),
      keys: () => call('storage.keys'),
    },
    haptics: {
      impact: (style = 'light') => call('haptics.impact', { style }),
      notification: (type = 'success') => call('haptics.notification', { type }),
      selection: () => call('haptics.selection'),
    },
    camera: {
      takePhoto: (options?: { source?: 'camera' | 'photos'; quality?: number }) => call('camera.photo', options ?? {}),
    },
    location: {
      current: () => call('location.current'),
    },
    notifications: {
      schedule: (options: { id?: number; title: string; body?: string; at?: string | number; every?: string }) =>
        call('notifications.schedule', options),
      cancel: (id: number) => call('notifications.cancel', { id }),
    },
    share: (options: { title?: string; text?: string; url?: string }) => call('share', options),
    clipboard: {
      write: (text: string) => call('clipboard.write', { text }),
      read: () => call('clipboard.read'),
    },
    http: {
      fetch: (url: string, options?: { method?: string; headers?: Record<string, string>; body?: unknown }) =>
        call('http.fetch', { url, ...options }),
    },
    ai: {
      chat: (prompt: string | Array<{ role: string; content: string }>, options?: { system?: string }) =>
        call('ai.chat', { prompt, ...options }),
    },
    app: {
      info: () => call('app.info'),
      home: () => call('app.home'),
      edit: (prompt?: string) => call('app.edit', { prompt }),
      openUrl: (url: string) => call('app.openUrl', { url }),
    },
    on: (name: string, fn: (data: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)?.add(fn);
      return () => listeners.get(name)?.delete(fn);
    },
  };

  // Three-finger pinch: fingers moving together opens the Mapp switcher.
  let startSpread = 0;
  const spread = (touches: TouchList): number => {
    let cx = 0;
    let cy = 0;
    for (const t of Array.from(touches)) { cx += t.clientX; cy += t.clientY; }
    cx /= touches.length;
    cy /= touches.length;
    let d = 0;
    for (const t of Array.from(touches)) d += Math.hypot(t.clientX - cx, t.clientY - cy);
    return d / touches.length;
  };
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 3) startSpread = spread(e.touches);
  }, opts);
  window.addEventListener('touchmove', (e) => {
    if (!startSpread || e.touches.length < 3) return;
    const ratio = spread(e.touches) / startSpread;
    if (ratio < 0.65) {
      startSpread = 0;
      host.postMessage({ __mapp: 'gesture', name: 'pinch-in' }, '*');
    } else if (ratio > 1.5) {
      startSpread = 0;
      host.postMessage({ __mapp: 'gesture', name: 'pinch-out' }, '*');
    }
  }, opts);
  window.addEventListener('touchend', (e) => {
    if (e.touches.length < 3) startSpread = 0;
  }, opts);
}

/** The runtime source, also used by the host shell for its own pinch detection. */
export const RUNTIME_SOURCE = `(${runtime.toString()})();`;

export function buildSrcdoc(app: MiniAppMeta, html: string, safe: SafeArea, dark: boolean): string {
  const body = html.replace(/^\s*<!doctype[^>]*>/i, '');
  const head = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">',
    `<title>${escapeHtml(app.name)}</title>`,
    `<style>:root{--safe-top:${safe.top}px;--safe-right:${safe.right}px;--safe-bottom:${safe.bottom}px;` +
      `--safe-left:${safe.left}px;--app-accent:${escapeHtml(app.color)};color-scheme:${dark ? 'dark' : 'light'}}` +
      'html{-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}</style>',
    `<script>${RUNTIME_SOURCE}</script>`,
  ].join('\n');
  return `${head}\n${body}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
