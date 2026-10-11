import { CapacitorHttp } from '@capacitor/core';
import { fillSecrets } from '../../secrets';
import { readMedia } from '../media';
import type { CapabilityGroup } from './types';
import { obj, optStr, str } from './util';

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
    {
      name: 'http.upload',
      params: ['url', 'options'],
      signature: "(url, { file: path | url, field?: 'file', fields?: {name: value}, headers?, method? }) -> { status, headers, text, json|null }",
      doc: 'multipart/form-data upload of an app file (e.g. a recording to a transcription API). {{secret:NAME}} works in url, headers and fields.',
      run: async (args, ctx) => {
        const options = obj(args, 'options');
        const rawUrl = str(args, 'url');
        if (!/^https:\/\//i.test(rawUrl)) throw new Error('mapp.http.upload needs an https URL');
        const file = str(options, 'file');
        const usesSecrets = /\{\{\s*secret:/.test(JSON.stringify([rawUrl, options.headers ?? null, options.fields ?? null]));
        if (usesSecrets && ctx.app.origin === 'link') throw new Error('Apps created from a link cannot use secrets.');
        const fill = (v: string) => (usesSecrets ? fillSecrets(v) : Promise.resolve(v));
        const media = await readMedia(ctx.app.id, file);
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries((options.headers as Record<string, unknown>) ?? {})) {
          if (k.toLowerCase() !== 'content-type') headers[k] = await fill(String(v));
        }
        headers['Content-Type'] = 'multipart/form-data';
        const parts: Array<Record<string, string>> = [];
        for (const [key, value] of Object.entries((options.fields as Record<string, unknown>) ?? {})) {
          parts.push({ key, value: await fill(String(value)), type: 'string' });
        }
        parts.push({ key: optStr(options, 'field') ?? 'file', value: media.base64, type: 'base64File', fileName: media.filename, contentType: media.mimeType });
        const res = await CapacitorHttp.request({
          url: await fill(rawUrl),
          method: String(options.method ?? 'POST').toUpperCase(),
          headers,
          data: parts,
          dataType: 'formData',
          responseType: 'text',
        });
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        let json: unknown = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        return { status: res.status, headers: res.headers, text, json };
      },
    },
  ],
};
