import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { CapabilityGroup } from './types';
import { optNum } from './util';

export const camera: CapabilityGroup = {
  group: 'camera',
  plugin: '@capacitor/camera',
  summary: 'take or pick a photo',
  capabilities: [
    {
      name: 'camera.takePhoto',
      signature: "({ source?: 'camera'|'photos'|'prompt', quality?: 1-100 }) -> { dataUrl, format }",
      doc: 'JPEG, max 1600px; throws if cancelled',
      run: async (args) => {
        const source = args.source === 'photos' ? CameraSource.Photos : args.source === 'camera' ? CameraSource.Camera : CameraSource.Prompt;
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source,
          quality: optNum(args, 'quality', { min: 1, max: 100 }) ?? 70,
          width: 1600,
        });
        return { dataUrl: photo.dataUrl, format: photo.format };
      },
    },
  ],
};
