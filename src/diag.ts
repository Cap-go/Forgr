import type { RequestDiag } from './ai/responses';

export interface RunReport {
  outcome: 'ok' | 'empty' | 'error' | 'stopped';
  error?: string;
  answerChars: number;
  ms: number;
  requests: RequestDiag[];
}

const KEY = 'mapp_diag_v1';

/** Recent run reports, kept on the device for the Settings screen. */
export function recentReports(): Array<RunReport & { at: number }> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Array<RunReport & { at: number }>;
  } catch {
    return [];
  }
}

/** Keeps a report on the device for the Settings screen. Nothing is sent anywhere. */
export function reportRun(report: RunReport): void {
  localStorage.setItem(KEY, JSON.stringify([{ ...report, at: Date.now() }, ...recentReports()].slice(0, 20)));
}
