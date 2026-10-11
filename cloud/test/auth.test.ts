import { describe, expect, test } from 'bun:test';
import { bytesToB64url, formatInvite, issueSession, parseInvite, readSession, userIdFor, verifyIdToken, type Jwk } from '../src/auth';

const enc = (v: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(v)));

async function signedToken(claims: Record<string, unknown>) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  ) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const head = enc({ alg: 'RS256', kid: 'k1' });
  const body = enc(claims);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return { token: `${head}.${body}.${bytesToB64url(sig)}`, keys: [{ kid: 'k1', kty: 'RSA', n: jwk.n!, e: jwk.e! }] as Jwk[] };
}

describe('id token', () => {
  const iss = 'https://auth.openai.com';
  test('accepts a valid token', async () => {
    const { token, keys } = await signedToken({ iss, sub: 'user-1', exp: Date.now() / 1000 + 600 });
    expect((await verifyIdToken(token, iss, keys)).sub).toBe('user-1');
  });
  test('rejects tampered, expired and foreign tokens', async () => {
    const { token, keys } = await signedToken({ iss, sub: 'user-1', exp: Date.now() / 1000 + 600 });
    const parts = token.split('.');
    const forged = `${parts[0]}.${enc({ iss, sub: 'admin', exp: Date.now() / 1000 + 600 })}.${parts[2]}`;
    await expect(verifyIdToken(forged, iss, keys)).rejects.toThrow('signature');
    const expired = await signedToken({ iss, sub: 'u', exp: Date.now() / 1000 - 600 });
    await expect(verifyIdToken(expired.token, iss, expired.keys)).rejects.toThrow('expired');
    const other = await signedToken({ iss: 'https://evil.example', sub: 'u', exp: Date.now() / 1000 + 600 });
    await expect(verifyIdToken(other.token, iss, other.keys)).rejects.toThrow('issuer');
  });
});

describe('sessions and invites', () => {
  test('session round trip and tamper detection', async () => {
    const id = await userIdFor('iss', 'sub');
    expect(id).toMatch(/^[a-f0-9]{24}$/);
    const { token } = await issueSession('secret', id);
    expect(await readSession('secret', token)).toBe(id);
    expect(await readSession('other', token)).toBeNull();
    expect(await readSession('secret', token.replace(id, 'f'.repeat(24)))).toBeNull();
    const old = await issueSession('secret', id, Date.now() - 200 * 86_400_000);
    expect(await readSession('secret', old.token)).toBeNull();
  });
  test('invite format', () => {
    const code = formatInvite('ABCDEFGH', 'JKLMNPQR');
    expect(code).toBe('ABCD-EFGH-JKLM-NPQR');
    expect(parseInvite('abcd efgh jklm npqr')).toEqual({ spaceId: 'ABCDEFGH', secret: 'JKLMNPQR' });
    expect(parseInvite('short')).toBeNull();
  });
});
