import { PdfGenerator } from '@capgo/capacitor-pdf-generator';
import type { CapabilityGroup } from './types';
import { MAX_MEDIA_BYTES, obj, optStr, requireNative, str, toDataUrl } from './util';

function options(args: Record<string, unknown>) {
  const o = obj(args, 'options');
  const name = (optStr(o, 'fileName') ?? 'document').replace(/[^\w.\- ]+/g, '').slice(0, 60) || 'document';
  return {
    data: str(args, 'html'),
    documentSize: o.size === 'A3' ? ('A3' as const) : ('A4' as const),
    orientation: o.landscape === true ? ('landscape' as const) : ('portrait' as const),
    fileName: name.endsWith('.pdf') ? name : `${name}.pdf`,
  };
}

export const pdf: CapabilityGroup = {
  group: 'pdf',
  plugin: '@capgo/capacitor-pdf-generator',
  summary: 'HTML to PDF',
  capabilities: [
    {
      name: 'pdf.share',
      params: ['html', 'options'],
      signature: "(html, { fileName?, size?: 'A4'|'A3', landscape? }?) -> true",
      doc: 'opens share sheet; inline CSS, no external images',
      run: async (args, ctx) => {
        requireNative(ctx);
        await PdfGenerator.fromData({ ...options(args), type: 'share' });
        return true;
      },
    },
    {
      name: 'pdf.create',
      params: ['html', 'options'],
      signature: "(html, { fileName?, size?, landscape? }?) -> { dataUrl: 'data:application/pdf;base64,...' }",
      run: async (args, ctx) => {
        requireNative(ctx);
        const result = await PdfGenerator.fromData({ ...options(args), type: 'base64' });
        if (result.type !== 'base64') throw new Error('PDF generation failed');
        if (result.base64.length * 0.75 > MAX_MEDIA_BYTES) throw new Error('PDF too large (max 8 MB)');
        return { dataUrl: toDataUrl(result.base64, 'application/pdf') };
      },
    },
  ],
};
