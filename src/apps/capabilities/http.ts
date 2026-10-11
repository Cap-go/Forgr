import { CapacitorHttp } from '@capacitor/core';
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
      doc: 'use instead of window.fetch',
      run: async (args) => {
        const url = str(args, 'url');
        if (!/^https?:\/\//i.test(url)) throw new Error('mapp.http.fetch needs an absolute http(s) URL');
        // Accept both fetch(url, { method }) and legacy fetch({ url, method }).
        const opts = { ...args, ...obj(args, 'options') };
        const res = await CapacitorHttp.request({
          url,
          method: String(opts.method ?? 'GET').toUpperCase(),
          headers: (opts.headers as Record<string, string>) ?? {},
          data: opts.body,
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
