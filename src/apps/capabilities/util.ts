import { Filesystem } from '@capacitor/filesystem';
import type { CapabilityContext } from './types';

/** Largest media payload sent back to a mini app as a data URL. */
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

export function requireNative(ctx: CapabilityContext): void {
  if (!ctx.native) throw new Error('Only available in the Forgr app');
}

export function str(args: Record<string, unknown>, key: string, required = true): string {
  const value = args[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return String(value);
  if (required) throw new Error(`"${key}" must be a non-empty string`);
  return '';
}

export function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function num(args: Record<string, unknown>, key: string, opts: { min?: number; max?: number } = {}): number {
  const value = typeof args[key] === 'string' ? Number(args[key]) : args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`"${key}" must be a number`);
  if (opts.min !== undefined && value < opts.min) throw new Error(`"${key}" must be >= ${opts.min}`);
  if (opts.max !== undefined && value > opts.max) throw new Error(`"${key}" must be <= ${opts.max}`);
  return value;
}

export function optNum(args: Record<string, unknown>, key: string, opts: { min?: number; max?: number } = {}): number | undefined {
  return args[key] === undefined || args[key] === null ? undefined : num(args, key, opts);
}

/** Nested options object (e.g. the second positional argument). */
export function obj(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Accepts a Date-like value (ISO string, ms timestamp) and returns ms since epoch. */
export function time(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  const ms = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) throw new Error(`"${key}" must be an ISO date string or a timestamp in ms`);
  return ms;
}

export function ensureGranted(state: string | undefined, what: string): void {
  if (state !== 'granted' && state !== 'limited') throw new Error(`${what} permission denied. Allow it in Settings > Forgr.`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toDataUrl(base64: string, mimeType: string): string {
  return base64.startsWith('data:') ? base64 : `data:${mimeType};base64,${base64}`;
}

/** Reads a native file (path or file:// URI) into a data URL the sandboxed iframe can use. */
export async function fileToDataUrl(path: string, mimeType: string): Promise<string> {
  const stat = await Filesystem.stat({ path }).catch(() => null);
  if (stat && stat.size > MAX_MEDIA_BYTES) throw new Error(`File too large (${Math.round(stat.size / 1024 / 1024)} MB, max 8 MB)`);
  const { data } = await Filesystem.readFile({ path });
  if (typeof data !== 'string') return blobToDataUrl(data);
  return toDataUrl(data, mimeType);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  if (blob.size > MAX_MEDIA_BYTES) return Promise.reject(new Error('Media too large (max 8 MB)'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read media'));
    reader.readAsDataURL(blob);
  });
}

type Stop = () => unknown;
const watchers = new WeakMap<CapabilityContext, Map<string, Stop>>();

/**
 * Starts a named watcher for one app, replacing any previous one with the same key.
 * `start` returns the cleanup; all watchers stop automatically when the app closes.
 */
export async function startWatch(ctx: CapabilityContext, key: string, start: () => Promise<Stop>): Promise<void> {
  let map = watchers.get(ctx);
  if (!map) {
    const created = new Map<string, Stop>();
    map = created;
    watchers.set(ctx, created);
    ctx.onDispose(async () => {
      const stops = [...created.values()];
      created.clear();
      await Promise.allSettled(stops.map(async (stop) => stop()));
    });
  }
  await stopWatch(ctx, key);
  map.set(key, await start());
}

export async function stopWatch(ctx: CapabilityContext, key: string): Promise<boolean> {
  const map = watchers.get(ctx);
  const stop = map?.get(key);
  if (!stop) return false;
  map!.delete(key);
  try {
    await stop();
  } catch {
    /* already stopped */
  }
  return true;
}

export function isWatching(ctx: CapabilityContext, key: string): boolean {
  return watchers.get(ctx)?.has(key) ?? false;
}
