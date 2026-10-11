import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { writeMedia } from '../media';
import type { CapabilityGroup } from './types';
import { optNum } from './util';

export const camera: CapabilityGroup = {
  group: 'camera',
  plugin: '@capacitor/camera',
  summary: 'take or pick a photo',
  capabilities: [
    {
      name: 'camera.takePhoto',
      signature: "({ source?: 'camera'|'photos'|'prompt', quality?: 1-100 }) -> { path, url, mimeType, size, dataUrl? }",
      doc: "Saved in the app's files. Show with <img src=url>, store path in mapp.storage (url = await mapp.files.url(path) later). dataUrl only when under 1.5 MB. Throws if cancelled.",
      run: async (args, ctx) => {
        const source = args.source === 'photos' ? CameraSource.Photos : args.source === 'camera' ? CameraSource.Camera : CameraSource.Prompt;
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.Base64,
          source,
          quality: optNum(args, 'quality', { min: 1, max: 100 }) ?? 70,
          width: 1600,
        });
        const mimeType = `image/${photo.format === 'jpg' ? 'jpeg' : photo.format}`;
        const file = await writeMedia(ctx.app.id, { base64: photo.base64String ?? '', mimeType });
        // Small inline copy keeps apps written for the old { dataUrl } result working.
        const dataUrl = (photo.base64String?.length ?? 0) < 2_000_000 ? `data:${mimeType};base64,${photo.base64String}` : undefined;
        return { ...file, format: photo.format, dataUrl };
      },
    },
  ],
};
