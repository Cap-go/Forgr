import { beforeAll, describe, expect, test } from 'bun:test';

beforeAll(() => {
  if (!('localStorage' in globalThis)) {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  }
});

describe('secret vault', () => {
  test('fills placeholders and refuses unknown names', async () => {
    const { saveSecret, fillSecrets, listSecrets } = await import('../src/secrets');
    await saveSecret({ name: 'STRIPE_SECRET_KEY', label: 'Stripe', kind: 'api_key' }, 'sk_test_abc');
    expect(await fillSecrets('Bearer {{secret:STRIPE_SECRET_KEY}}')).toBe('Bearer sk_test_abc');
    await expect(fillSecrets('{{secret:MISSING_ONE}}')).rejects.toThrow('not saved');
    expect(JSON.stringify(listSecrets())).not.toContain('sk_test_abc');
  });

  test('detects pasted credentials', async () => {
    const { looksLikeSecret } = await import('../src/secrets');
    expect(looksLikeSecret(`here: ${'sk_'}live_51Habcdefghijklmnopqrstuv`)).toMatchObject({ suggestedName: 'STRIPE_SECRET_KEY', value: `${'sk_'}live_51Habcdefghijklmnopqrstuv` });
    expect(looksLikeSecret('make me a habit tracker')).toBeNull();
  });

  test('request_secret never returns the value to the model', async () => {
    const { runTool } = await import('../src/ai/tools');
    const out = await runTool('request_secret', { name: 'stripe secret key', label: 'Stripe', help: 'x', kind: 'api_key', target: 'device' }, {
      openApp: async () => undefined,
      settle: async () => undefined,
      requestSecret: async () => ({ saved: true }),
    });
    expect(out).toContain('STRIPE_SECRET_KEY');
    expect(out).toContain('{{secret:STRIPE_SECRET_KEY}}');
    expect(out).not.toContain('sk_');
  });
});
