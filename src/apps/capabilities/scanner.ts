import { DocumentScanner, ResponseType, ScanDocumentResponseStatus } from '@capgo/capacitor-document-scanner';
import { writeMedia } from '../media';
import type { CapabilityGroup } from './types';
import { MAX_MEDIA_BYTES, optNum, requireNative } from './util';

export const scanner: CapabilityGroup = {
  group: 'scanner',
  plugin: '@capgo/capacitor-document-scanner',
  summary: 'scan documents/receipts',
  capabilities: [
    {
      name: 'scanner.scan',
      signature: '({ maxPages?: 1-10, quality?: 1-100 }?) -> { pages: { path, url, mimeType, size }[] }',
      doc: "JPEG pages saved in the app's files; [] if cancelled.",
      run: async (args, ctx) => {
        requireNative(ctx);
        const result = await DocumentScanner.scanDocument({
          responseType: ResponseType.Base64,
          maxNumDocuments: optNum(args, 'maxPages', { min: 1, max: 10 }) ?? 5,
          croppedImageQuality: optNum(args, 'quality', { min: 1, max: 100 }) ?? 60,
          letUserAdjustCrop: true,
        });
        if (result.status === ScanDocumentResponseStatus.Cancel) return { pages: [] };
        const images = (result.scannedImages ?? []).map((b64) => b64.replace(/^data:[^,]*,/, ''));
        const total = images.reduce((sum, b64) => sum + b64.length * 0.75, 0);
        if (total > MAX_MEDIA_BYTES * 2) throw new Error('Scan too large; use fewer pages or a lower quality');
        const pages = [];
        for (const base64 of images) pages.push(await writeMedia(ctx.app.id, { base64, mimeType: 'image/jpeg', name: 'scan' }));
        return { pages };
      },
    },
  ],
};
