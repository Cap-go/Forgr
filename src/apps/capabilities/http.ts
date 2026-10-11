import { CapacitorHttp } from '@capacitor/core';
import { fillSecrets } from '../../secrets';
import type { CapabilityGroup } from './types';
import { obj, str } from './util';

export const http: CapabilityGroup = {
  group: 'http',
  plugin: '@capacitor/core CapacitorHttp',
  summary: 'web APIs without CORS',
  capabilities: [
    {
      name: 'http.fetch',
      params: ['url', 'options'],
      signature: '(url, { method?, headers?, body? }?) -> { status, headers, text, json|null }',
      doc: 'use instead of window.fetch. {{secret:NAME}} in url, headers or body is replaced natively with the saved secret.',
      run: async (args, ctx) => {
        const raw = str(args, 'url');
        if (!/^https?:\/\//i.test(raw)) throw new Error('mapp.http.fetch needs an absolute http(s) URL');
        // Accept both fetch(url, { method }) and legacy fetch({ url, method }).
        const opts = { ...args, ...obj(args, 'options') };
        const usesSecrets = /\{\{\s*secret:/.test(JSON.stringify([raw, opts.headers ?? null, opts.body ?? null]));
        if (usesSecrets && ctx.app.origin === 'link') throw new Error('Apps created from a link cannot use secrets.');
        const url = usesSecrets ? await fillSecrets(raw) : raw;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries((opts.headers as Record<string, unknown>) ?? {})) {
          headers[k] = usesSecrets ? await fillSecrets(String(v)) : String(v);
        }
        let data = opts.body;
        if (usesSecrets && data !== undefined) {
          const filled = await fillSecrets(typeof data === 'string' ? data : JSON.stringify(data));
          data = typeof data === 'string' ? filled : JSON.parse(filled);
        }
        const res = await CapacitorHttp.request({
          url,
          method: String(opts.method ?? 'GET').toUpperCase(),
          headers,
          data,
          responseType: 'text',
        });
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* not json */
        }
        return { status: res.status, headers: res.headers, text, json };
      },
    },
  ],
};
