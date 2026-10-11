import { CAPABILITY_GROUPS } from './capabilities';
import { KIT_CSS } from './kit';
import type { MiniAppMeta } from './store';

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Positional parameter names per capability, as the runtime needs them. */
type Manifest = Array<[name: string, params: string[] | null]>;

/**
 * Runs inside every mini app (sandboxed iframe, opaque origin). Builds
 * window.mapp from the capability manifest, forwards logs and errors to the
 * host, applies live safe-area insets and detects the 3-finger pinch.
 */
function runtime(manifest: Manifest): void {
  const host = window.parent;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let seq = 0;

  const call = (method: string, args: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      host.postMessage({ __mapp: 'call', id, method, args }, '*');
    });

  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const root = document.documentElement;

  window.addEventListener('message', (event) => {
    if (event.source !== host) return;
    const data = event.data as {
      __mapp?: string; id?: number; result?: unknown; error?: string; name?: string; payload?: unknown;
      insets?: Record<string, number>;
    };
    if (data?.__mapp === 'reply' && typeof data.id === 'number') {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data.result);
    }
    if (data?.__mapp === 'event' && data.name) {
      listeners.get(data.name)?.forEach((fn) => {
        try { fn(data.payload); } catch (e) { console.error(e); }
      });
    }
    if (data?.__mapp === 'safe-area' && data.insets) {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        root.style.setProperty(`--safe-${side}`, `${data.insets[side] ?? 0}px`);
      }
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

  const mapp: Record<string, unknown> = {
    on: (name: string, fn: (data: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)?.add(fn);
      return () => listeners.get(name)?.delete(fn);
    },
    capabilities: manifest.map(([name]) => name),
  };
  for (const [name, params] of manifest) {
    const [group, method] = name.split('.');
    const target = (mapp[group] ??= {}) as Record<string, unknown>;
    target[method] = (...values: unknown[]) => {
      if (!params) return call(name, values[0] ?? {});
      const args: Record<string, unknown> = {};
      params.forEach((param, i) => { if (values[i] !== undefined) args[param] = values[i]; });
      return call(name, args);
    };
  }
  // Calling something that does not exist fails loudly so the builder AI notices.
  (window as unknown as { mapp: unknown }).mapp = new Proxy(mapp, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop in target || prop === 'then' || prop === 'toJSON') {
        return (target as Record<string | symbol, unknown>)[prop];
      }
      log('error', [`mapp.${String(prop)} does not exist. Available: ${Object.keys(target).join(', ')}`]);
      return undefined;
    },
  });

  // Web downloads (<a download>, blob: and data: links) do nothing in the
  // iOS WebView: turn them into a real file export with the share sheet.
  const isDownload = (a: HTMLAnchorElement) =>
    a.hasAttribute('download') || a.href.startsWith('blob:') || a.href.startsWith('data:');
  const exportLink = async (a: HTMLAnchorElement): Promise<void> => {
    try {
      const blob = await (await fetch(a.href)).blob();
      const filename = a.getAttribute('download') || a.href.split('/').pop()?.split('?')[0] || 'export';
      const textual = /^text\/|json|csv|xml|calendar|vcard/.test(blob.type) || /\.(csv|json|txt|md|ics|xml|tsv|vcf|html)$/i.test(filename);
      const content = textual
        ? await blob.text()
        : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      await call('files.save', { filename, content, options: { base64: !textual, mimeType: blob.type || undefined } });
    } catch (error) {
      log('error', ['Export failed:', error]);
    }
  };
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a');
    if (a instanceof HTMLAnchorElement && isDownload(a)) {
      e.preventDefault();
      void exportLink(a);
    }
  }, true);
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    // Programmatic a.click() on a detached link never reaches the listener above.
    if (!this.isConnected && isDownload(this)) {
      void exportLink(this);
      return;
    }
    nativeClick.call(this);
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

function manifest(): Manifest {
  return CAPABILITY_GROUPS.flatMap((g) => g.capabilities.map((c): [string, string[] | null] => [c.name, c.params ?? null]));
}

/** The runtime source with the current capability manifest baked in. */
export function runtimeSource(): string {
  return `(${runtime.toString()})(${JSON.stringify(manifest())});`;
}

/**
 * Reads the host WebView's safe-area insets right now. Measured on every use:
 * at app launch WKWebView can still report zero insets.
 */
export function measureSafeArea(): SafeArea {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const safe = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  // Dev demo and tests can force insets with --demo-safe-* on :root.
  const root = getComputedStyle(document.documentElement);
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const forced = parseFloat(root.getPropertyValue(`--demo-safe-${side}`));
    if (!Number.isNaN(forced)) safe[side] = forced;
  }
  return safe;
}

/**
 * Keeps a mini app's --safe-* variables in sync with the device (rotation,
 * late WebView layout). Returns a disposer.
 */
export function syncSafeArea(frame: HTMLIFrameElement): () => void {
  let last = '';
  const post = () => {
    const insets = measureSafeArea();
    const key = JSON.stringify(insets);
    if (key === last) return;
    last = key;
    frame.contentWindow?.postMessage({ __mapp: 'safe-area', insets }, '*');
  };
  const onLoad = () => {
    last = '';
    post();
  };
  frame.addEventListener('load', onLoad);
  window.addEventListener('resize', post);
  const timer = window.setInterval(post, 1500);
  return () => {
    frame.removeEventListener('load', onLoad);
    window.removeEventListener('resize', post);
    window.clearInterval(timer);
  };
}

export function buildSrcdoc(app: MiniAppMeta, html: string, _safe?: SafeArea, dark?: boolean): string {
  const safe = measureSafeArea();
  const scheme = dark ?? matchMedia('(prefers-color-scheme: dark)').matches;
  const body = html.replace(/^\s*<!doctype[^>]*>/i, '');
  const head = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">',
    `<title>${escapeHtml(app.name)}</title>`,
    `<style id="mapp-env">:root{--safe-top:${safe.top}px;--safe-right:${safe.right}px;--safe-bottom:${safe.bottom}px;` +
      `--safe-left:${safe.left}px;--app-accent:${escapeHtml(app.color)};color-scheme:light dark}` +
      `html{-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;background:${scheme ? '#000' : '#f2f2f7'}}</style>`,
    `<style id="mapp-kit">${KIT_CSS}</style>`,
    `<script>${runtimeSource()}</script>`,
  ].join('\n');
  return `${head}\n${body}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
