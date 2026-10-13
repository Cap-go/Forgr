import { describe, expect, test } from 'bun:test';
import { runTool, toolNamespaceFor } from '../src/ai/tools';
import { buildLink, parseLink } from '../src/links';

describe('parseLink', () => {
  test('custom scheme and universal links', () => {
    expect(parseLink('mapp://build?prompt=A%20tip%20calculator')).toEqual({ action: 'build', prompt: 'A tip calculator', name: undefined });
    expect(parseLink('https://mapp-site.digitalshift-ee.workers.dev/l/build?prompt=Plants&name=Leafy')).toEqual({ action: 'build', prompt: 'Plants', name: 'Leafy' });
    expect(parseLink('https://forgr.ee/l/open?app=Habits')).toEqual({ action: 'open', app: 'Habits' });
    expect(parseLink('mapp://open?app=Habits')).toEqual({ action: 'open', app: 'Habits' });
    expect(parseLink('mapp://edit?app=Habits&prompt=dark')).toEqual({ action: 'edit', app: 'Habits', prompt: 'dark' });
    expect(parseLink('mapp://join?code=ABCD-EFGH-JKLM-NPQR')).toEqual({ action: 'join', code: 'ABCD-EFGH-JKLM-NPQR' });
    expect(parseLink('mapp://')).toEqual({ action: 'home' });
  });
  test('rejects other hosts, unknown actions and empty prompts', () => {
    expect(parseLink('https://evil.example/l/build?prompt=x')).toBeNull();
    expect(parseLink('mapp://deploy?code=x')).toBeNull();
    expect(parseLink('mapp://build')).toBeNull();
    expect(parseLink('not a url')).toBeNull();
  });
  test('round trip', () => {
    expect(parseLink(buildLink('build', { prompt: 'A habit tracker & more?' }))).toMatchObject({ prompt: 'A habit tracker & more?' });
  });
});

describe('link-started runs', () => {
  const ctx = { openApp: async () => undefined, settle: async () => undefined, restricted: { createdIds: new Set<string>() } };
  test('only offer safe tools', () => {
    const names = toolNamespaceFor(ctx).tools.map((t) => t.name);
    expect(names).toContain('create_app');
    for (const blocked of ['list_apps', 'deploy_function', 'set_secret', 'join_space', 'list_cloud', 'update_app_info']) {
      expect(names).not.toContain(blocked);
    }
  });
  test('refuse other apps and blocked tools', async () => {
    await expect(runTool('read_app', { id: 'someone-elses' }, ctx)).rejects.toThrow('only change the app they created');
    await expect(runTool('list_cloud', {}, ctx)).rejects.toThrow('not available');
  });
});
