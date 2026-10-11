import { Geolocation } from '@capacitor/geolocation';
import type { CapabilityGroup } from './types';
import { ensureGranted } from './util';

export const location: CapabilityGroup = {
  group: 'location',
  plugin: '@capacitor/geolocation',
  summary: 'GPS position',
  capabilities: [
    {
      name: 'location.current',
      signature: '() -> { latitude, longitude, accuracy: meters }',
      run: async (_args, ctx) => {
        if (ctx.native) {
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== 'granted') ensureGranted((await Geolocation.requestPermissions()).location, 'Location');
        }
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000 });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
      },
    },
  ],
};
