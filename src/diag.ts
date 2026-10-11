import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import type { RequestDiag } from './ai/responses';
import { CLOUD_URL } from './cloud/client';

export interface RunReport {
  outcome: 'ok' | 'empty' | 'error' | 'stopped';
  error?: string;
  answerChars: number;
  ms: number;
  requests: RequestDiag[];
}

const KEY = 'mapp_diag_v1';

function installId(): string {
  let id = localStorage.getItem('mapp_install_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('mapp_install_id', id);
  }
  return id;
}

/** Recent run reports, kept on the device for the Settings screen. */
export function recentReports(): Array<RunReport & { at: number }> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Array<RunReport & { at: number }>;
  } catch {
    return [];
  }
}

/**
 * Keeps a report locally and, when a run failed or came back empty, sends it
 * to Mapp Cloud. Reports hold request metadata only: no prompts, no replies.
 */
export async function reportRun(report: RunReport): Promise<void> {
  const entry = { ...report, at: Date.now() };
  localStorage.setItem(KEY, JSON.stringify([entry, ...recentReports()].slice(0, 20)));
  if (report.outcome === 'ok' || report.outcome === 'stopped') return;
  let bundle = 'builtin';
  if (Capacitor.isNativePlatform()) {
    bundle = await CapacitorUpdater.current().then((c) => c.bundle.version).catch(() => 'unknown');
  }
  await fetch(`${CLOUD_URL}/v1/diag`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      install: installId(),
      app: __APP_VERSION__,
      bundle,
      platform: Capacitor.getPlatform(),
      ua: navigator.userAgent.slice(0, 160),
      report: entry,
    }),
  }).catch(() => undefined);
}
