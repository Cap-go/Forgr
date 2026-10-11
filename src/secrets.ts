import { secureGet, secureRemove, secureSet } from './auth/secure-storage';

/*
 * The user's secrets (API keys, passwords, tokens). Values live only in the
 * iOS Keychain; this module keeps a non-secret index of names for listing.
 * The builder AI never receives a value: it asks with request_secret and the
 * user types the value into a secure card. Apps use secrets through
 * {{secret:NAME}} placeholders in mapp.http.fetch (substituted natively, the
 * app's JavaScript never sees them) or mapp.secrets.get when they must show it.
 */

export type SecretKind = 'api_key' | 'password' | 'token' | 'text';

export interface SecretInfo {
  name: string;
  label: string;
  kind: SecretKind;
  /** For passwords: the account the password belongs to (not secret). */
  username?: string;
  savedAt: number;
}

const INDEX = 'mapp_secret_index_v1';
const PREFIX = 'mapp_secret_v1_';
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

function readIndex(): SecretInfo[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? '[]') as SecretInfo[];
  } catch {
    return [];
  }
}

function writeIndex(list: SecretInfo[]): void {
  localStorage.setItem(INDEX, JSON.stringify(list));
}

export function normalizeSecretName(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^[^A-Z]+/, '').slice(0, 64);
}

export function listSecrets(): SecretInfo[] {
  return readIndex().sort((a, b) => a.name.localeCompare(b.name));
}

export function secretInfo(name: string): SecretInfo | undefined {
  return readIndex().find((s) => s.name === name);
}

export async function saveSecret(info: Omit<SecretInfo, 'savedAt'>, value: string): Promise<void> {
  if (!SECRET_NAME.test(info.name)) throw new Error('Secret names use UPPER_SNAKE_CASE');
  if (!value) throw new Error('Empty secret');
  await secureSet(PREFIX + info.name, value);
  writeIndex([...readIndex().filter((s) => s.name !== info.name), { ...info, savedAt: Date.now() }]);
}

export async function readSecret(name: string): Promise<string | null> {
  if (!secretInfo(name)) return null;
  return secureGet(PREFIX + name);
}

export async function deleteSecret(name: string): Promise<void> {
  await secureRemove(PREFIX + name);
  writeIndex(readIndex().filter((s) => s.name !== name));
}

/** Replaces {{secret:NAME}} placeholders; unknown names throw so apps can ask for them. */
export async function fillSecrets(text: string): Promise<string> {
  const names = [...new Set([...text.matchAll(/\{\{\s*secret:([A-Z][A-Z0-9_]{0,63})\s*\}\}/g)].map((m) => m[1]))];
  let out = text;
  for (const name of names) {
    const value = await readSecret(name);
    if (value === null) throw new Error(`Secret ${name} is not saved yet. Call mapp.secrets.request('${name}').`);
    out = out.split(new RegExp(`\\{\\{\\s*secret:${name}\\s*\\}\\}`, 'g')).join(value);
  }
  return out;
}

/** Heuristic: text pasted in the chat that looks like a credential. */
export function looksLikeSecret(text: string): { suggestedName: string; value: string } | null {
  const t = text.trim();
  const rules: Array<[RegExp, string]> = [
    [/\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/, 'STRIPE_SECRET_KEY'],
    [/\bpk_(live|test)_[A-Za-z0-9]{16,}/, 'STRIPE_PUBLISHABLE_KEY'],
    [/\bsk-(proj-)?[A-Za-z0-9_-]{20,}/, 'OPENAI_API_KEY'],
    [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GITHUB_TOKEN'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'AWS_ACCESS_KEY_ID'],
    [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, 'SLACK_TOKEN'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/, 'GOOGLE_API_KEY'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/, 'PRIVATE_KEY'],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'API_TOKEN'],
  ];
  for (const [re, name] of rules) {
    const match = t.match(re);
    if (match) return { suggestedName: name, value: match[0] };
  }
  return null;
}
