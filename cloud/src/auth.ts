/** Identity: a ChatGPT id_token is exchanged once for a Forgr session token. */

export interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

export interface IdentityClaims {
  iss: string;
  sub: string;
  email?: string;
  exp: number;
}

const encoder = new TextEncoder();

export function b64urlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePart<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part))) as T;
}

let jwksCache: { url: string; keys: Jwk[]; at: number } | null = null;

export async function fetchJwks(url: string): Promise<Jwk[]> {
  if (jwksCache?.url === url && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`JWKS unavailable (${res.status})`);
  const body = (await res.json()) as { keys: Jwk[] };
  jwksCache = { url, keys: body.keys, at: Date.now() };
  return body.keys;
}

/**
 * Verifies an RS256 ChatGPT id_token signature, issuer and expiry. The
 * audience is a per-install dynamic client id, so it is not pinned here; the
 * signature from OpenAI proves the subject.
 */
export async function verifyIdToken(token: string, issuer: string, keys: Jwk[], nowSec = Date.now() / 1000): Promise<IdentityClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed id_token');
  let header: { alg: string; kid?: string };
  try {
    header = decodePart(parts[0]);
  } catch {
    throw new Error('Malformed id_token');
  }
  if (header.alg !== 'RS256') throw new Error('Unsupported id_token algorithm');
  const jwk = keys.find((k) => k.kid === header.kid) ?? (keys.length === 1 ? keys[0] : undefined);
  if (!jwk) throw new Error('Unknown id_token key');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('Invalid id_token signature');
  const claims = decodePart<IdentityClaims>(parts[1]);
  if (claims.iss !== issuer) throw new Error('Wrong id_token issuer');
  if (!claims.sub) throw new Error('id_token has no subject');
  if (typeof claims.exp !== 'number' || claims.exp < nowSec - 60) throw new Error('id_token expired');
  return claims;
}

/** Stable, opaque Forgr user id derived from the OpenAI subject. */
export async function userIdFor(iss: string, sub: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${iss}|${sub}`)));
  return Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToB64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

const SESSION_DAYS = 90;

export async function issueSession(secret: string, userId: string, nowMs = Date.now()): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = nowMs + SESSION_DAYS * 86_400_000;
  const payload = `v1.${userId}.${expiresAt}`;
  return { token: `${payload}.${await hmac(secret, payload)}`, expiresAt };
}

export async function readSession(secret: string, token: string, nowMs = Date.now()): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const payload = parts.slice(0, 3).join('.');
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(expected, parts[3])) return null;
  if (Number(parts[2]) < nowMs) return null;
  return parts[1];
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Invite code "SPACEID1-SECRET12" shown as XXXX-XXXX-XXXX-XXXX. */
export function formatInvite(spaceId: string, secret: string): string {
  return `${spaceId}${secret}`.match(/.{1,4}/g)!.join('-');
}

export function parseInvite(code: string): { spaceId: string; secret: string } | null {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 16) return null;
  return { spaceId: clean.slice(0, 8), secret: clean.slice(8) };
}
