import { describe, expect, test } from 'bun:test';
import { lintHtml } from '../src/ai/tools';

describe('lintHtml', () => {
  test('passes clean kit apps', () => {
    expect(lintHtml('<body class="m-app"><script>mapp.storage.get("x")</script></body>')).toBe('none');
  });

  test('flags unknown capabilities and blocked web APIs', () => {
    const warnings = lintHtml('<script>mapp.bluetooth.scan(); localStorage.setItem("a", 1); alert("hi")</script>');
    expect(Array.isArray(warnings)).toBe(true);
    const text = (warnings as string[]).join('\n');
    expect(text).toContain('mapp.bluetooth.scan');
    expect(text).toContain('mapp.storage');
    expect(text).toContain('alert');
  });
});
