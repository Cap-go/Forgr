import { exportFile, toCsv } from '../../files';
import { deleteMedia, listMedia, mediaUrl, readMedia, safePath, writeMedia } from '../media';
import type { CapabilityGroup } from './types';
import { obj, optStr, str } from './util';

const isRef = (v: string) => v.startsWith('files/') || v.startsWith('capacitor://') || /^https:\/\//i.test(v);

export const files: CapabilityGroup = {
  group: 'files',
  plugin: '@capacitor/filesystem + @capacitor/share',
  summary: "The app's own files (photos, recordings, imports, generated files) as { path, url }: url works in <img>/<audio>/<video>, path is the stable id to store. save() exports through the system share sheet (save to files, mail, other apps). <a download> and blob links are also exported automatically.",
  capabilities: [
    {
      name: 'files.write',
      params: ['name', 'content', 'options'],
      signature: '(name, content: string, { mimeType?, base64?: boolean }?) -> { path, url, mimeType, size }',
      doc: 'Keeps a file in the app (e.g. an imported image or generated text). content is text, or base64/data URL with base64: true.',
      run: (args, ctx) => {
        const options = obj(args, 'options');
        const content = str(args, 'content', false);
        const binary = options.base64 === true || content.startsWith('data:');
        const mimeType = optStr(options, 'mimeType') ?? (content.match(/^data:([^;,]+)/)?.[1] ?? 'text/plain');
        return writeMedia(ctx.app.id, binary
          ? { base64: content.replace(/^data:[^,]*,/, ''), mimeType, name: str(args, 'name') }
          : { text: content, mimeType, name: str(args, 'name') });
      },
    },
    {
      name: 'files.read',
      params: ['path', 'options'],
      signature: "(path | url, { as?: 'text' | 'dataUrl' | 'base64' }?) -> string",
      doc: 'Reads a file of this app (or an https URL). Prefer passing paths to other capabilities instead of reading big files.',
      run: async (args, ctx) => {
        const media = await readMedia(ctx.app.id, str(args, 'path'));
        const as = optStr(obj(args, 'options'), 'as') ?? (/^text\/|json|csv|xml/.test(media.mimeType) ? 'text' : 'dataUrl');
        if (as === 'base64') return media.base64;
        if (as === 'dataUrl') return `data:${media.mimeType};base64,${media.base64}`;
        return decodeURIComponent(escape(atob(media.base64)));
      },
    },
    {
      name: 'files.url',
      params: ['path'],
      signature: '(path) -> url',
      doc: 'Fresh display URL for a stored path (URLs can change after app updates; paths do not).',
      run: (args, ctx) => mediaUrl(ctx.app.id, safePath(str(args, 'path'))),
    },
    {
      name: 'files.list',
      signature: '() -> [{ path, size, mimeType }]',
      run: (_args, ctx) => listMedia(ctx.app.id),
    },
    {
      name: 'files.delete',
      params: ['path'],
      signature: '(path) -> true',
      run: async (args, ctx) => {
        await deleteMedia(ctx.app.id, str(args, 'path'));
        return true;
      },
    },
    {
      name: 'files.save',
      params: ['filename', 'content', 'options'],
      signature: '(filename, content: string | path | url, { mimeType?, base64?: boolean }?) -> { filename, shared }',
      doc: 'Exports through the share sheet. content: text (CSV, JSON, ICS…), a files/ path or url, or base64 with base64: true.',
      run: async (args, ctx) => {
        const options = obj(args, 'options');
        const content = typeof args.content === 'string' ? args.content : JSON.stringify(args.content ?? '', null, 2);
        if (isRef(content)) {
          const media = await readMedia(ctx.app.id, content);
          return exportFile({ filename: str(args, 'filename'), dataUrl: media.base64, mimeType: optStr(options, 'mimeType') ?? media.mimeType });
        }
        const binary = options.base64 === true || content.startsWith('data:');
        return exportFile({
          filename: str(args, 'filename'),
          ...(binary ? { dataUrl: content } : { text: content }),
          mimeType: optStr(options, 'mimeType'),
        });
      },
    },
    {
      name: 'files.saveCsv',
      params: ['filename', 'rows'],
      signature: '(filename, rows: any[][]) -> { filename, shared }',
      doc: 'rows[0] = header row. Quoting and commas are handled.',
      run: (args) => {
        if (!Array.isArray(args.rows) || !args.rows.every(Array.isArray)) throw new Error('rows must be an array of arrays');
        const name = str(args, 'filename');
        return exportFile({ filename: /\.csv$/i.test(name) ? name : `${name}.csv`, text: toCsv(args.rows as unknown[][]), mimeType: 'text/csv' });
      },
    },
  ],
};
