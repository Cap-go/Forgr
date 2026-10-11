import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';
import type { CapabilityGroup } from './types';
import { errorMessage, optStr } from './util';

const TYPES: Partial<Record<BiometryType, string>> = {
  [BiometryType.FACE_ID]: 'faceId',
  [BiometryType.TOUCH_ID]: 'touchId',
  [BiometryType.FINGERPRINT]: 'fingerprint',
  [BiometryType.FACE_AUTHENTICATION]: 'face',
  [BiometryType.IRIS_AUTHENTICATION]: 'iris',
  [BiometryType.MULTIPLE]: 'multiple',
  [BiometryType.DEVICE_CREDENTIAL]: 'passcode',
};

export const biometric: CapabilityGroup = {
  group: 'biometric',
  plugin: '@capgo/capacitor-native-biometric',
  summary: 'Face ID lock for private apps',
  capabilities: [
    {
      name: 'biometric.isAvailable',
      signature: "() -> { available, type: 'faceId'|'touchId'|'passcode'|'none' }",
      run: async (_args, ctx) => {
        if (!ctx.native) return { available: false, type: 'none' };
        const r = await NativeBiometric.isAvailable({ useFallback: true });
        return { available: r.isAvailable, type: TYPES[r.biometryType] ?? 'none' };
      },
    },
    {
      name: 'biometric.verify',
      params: ['reason'],
      signature: '(reason?) -> boolean',
      doc: 'false if cancelled/failed',
      run: async (args, ctx) => {
        if (!ctx.native) throw new Error('Only available on iPhone');
        const available = await NativeBiometric.isAvailable({ useFallback: true });
        if (!available.isAvailable) throw new Error('Face ID / passcode is not set up on this device');
        try {
          await NativeBiometric.verifyIdentity({
            reason: optStr(args, 'reason') ?? `Unlock ${ctx.app.name}`,
            title: ctx.app.name,
            useFallback: true,
          });
          return true;
        } catch (error) {
          console.warn('[mapp] biometric.verify failed', errorMessage(error));
          return false;
        }
      },
    },
  ],
};
