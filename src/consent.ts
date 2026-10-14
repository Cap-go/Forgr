import { PREF_KEYS } from './config';

/** Whether the user allowed sending AI requests to OpenAI. Nothing goes to the AI without it. */
export function hasAiConsent(): boolean {
  return localStorage.getItem(PREF_KEYS.aiConsent) === 'yes';
}

export function setAiConsent(allowed: boolean): void {
  if (allowed) localStorage.setItem(PREF_KEYS.aiConsent, 'yes');
  else localStorage.removeItem(PREF_KEYS.aiConsent);
}

export const AI_CONSENT_REQUIRED = 'AI data sharing is off. Turn it on in Settings to use the AI.';
