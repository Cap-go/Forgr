import { describe, expect, mock, test } from 'bun:test';

// Native plugin modules call registerPlugin at import time; stub the AI/session modules that touch storage.
mock.module('../src/ai/session', () => ({ session: { withToken: async () => '' } }));
mock.module('../src/ai/responses', () => ({ completeText: async () => '' }));

const { CAPABILITY_GROUPS, capabilityNames, describeCapabilities, findCapability } = await import('../src/apps/capabilities');

describe('capability registry', () => {
  test('names are unique', () => {
    const names = capabilityNames();
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(CAPABILITY_GROUPS.flatMap((g) => g.capabilities).length);
  });

  test('group names are unique identifiers', () => {
    const groups = CAPABILITY_GROUPS.map((g) => g.group);
    expect(new Set(groups).size).toBe(groups.length);
    for (const g of groups) expect(g).toMatch(/^[a-z][A-Za-z]*$/);
  });

  test('every name is "<group>.<method>" matching its group', () => {
    for (const group of CAPABILITY_GROUPS) {
      expect(group.capabilities.length).toBeGreaterThan(0);
      for (const cap of group.capabilities) {
        expect(cap.name).toMatch(/^[a-z][A-Za-z]*\.[a-z][A-Za-z]*$/);
        expect(cap.name.split('.')[0]).toBe(group.group);
        expect(findCapability(cap.name)).toBe(cap);
      }
    }
  });

  test('signatures start with an argument list and match params', () => {
    for (const cap of CAPABILITY_GROUPS.flatMap((g) => g.capabilities)) {
      expect(cap.signature.startsWith('(')).toBe(true);
      expect(cap.signature).toContain('->');
      if (cap.params) expect(cap.signature.startsWith(`(${cap.params[0]}`)).toBe(true);
    }
  });

  test('describeCapabilities mentions every name and stays compact', () => {
    const text = describeCapabilities();
    for (const name of capabilityNames()) expect(text).toContain(`mapp.${name}(`);
    for (const event of CAPABILITY_GROUPS.flatMap((g) => g.capabilities.flatMap((c) => c.events ?? []))) {
      expect(text).toContain(`mapp.on('${event}'`);
    }
    expect(text.length).toBeLessThan(12000);
  });

  test('unknown capabilities are not found', () => {
    expect(findCapability('camera.photo')).toBeUndefined();
    expect(findCapability('share')).toBeUndefined();
  });
});
