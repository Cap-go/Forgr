import { exportFile, toCsv } from '../../files';
import type { CapabilityGroup } from './types';
import { obj, optStr, str } from './util';

export const files: CapabilityGroup = {
  group: 'files',
  plugin: '@capacitor/filesystem + @capacitor/share',
  summary: 'Export data as real files: opens the iOS share sheet (Save to Files, AirDrop, Mail, Numbers). Standard <a download> and blob links are also handled automatically.',
  capabilities: [
    {
      name: 'files.save',
      params: ['filename', 'content', 'options'],
      signature: '(filename, content: string, { mimeType?, base64?: boolean }?) -> { filename, shared }',
      doc: 'content is text (CSV, JSON, ICS…) or base64/data URL when options.base64.',
      run: (args) => {
        const options = obj(args, 'options');
        const content = typeof args.content === 'string' ? args.content : JSON.stringify(args.content ?? '', null, 2);
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
