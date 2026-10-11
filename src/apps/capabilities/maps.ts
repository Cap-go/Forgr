import { LaunchNavigator, TransportMode } from '@capgo/capacitor-launch-navigator';
import { NativeGeocoder } from '@capgo/capacitor-nativegeocoder';
import type { CapabilityGroup } from './types';
import { num, optStr, requireNative } from './util';

const MODES: Record<string, TransportMode> = {
  driving: TransportMode.DRIVING,
  walking: TransportMode.WALKING,
  bicycling: TransportMode.BICYCLING,
  transit: TransportMode.TRANSIT,
};

export const maps: CapabilityGroup = {
  group: 'maps',
  plugin: '@capgo/capacitor-launch-navigator',
  summary: 'directions in Apple Maps',
  capabilities: [
    {
      name: 'maps.directions',
      signature: "({ address? | latitude, longitude, mode?: 'driving'|'walking'|'bicycling'|'transit', name? }) -> true",
      run: async (args, ctx) => {
        requireNative(ctx);
        let destination: [number, number];
        const address = optStr(args, 'address');
        if (address) {
          const { addresses } = await NativeGeocoder.forwardGeocode({ addressString: address, maxResults: 1 });
          if (!addresses[0]) throw new Error(`Address not found: ${address}`);
          destination = [addresses[0].latitude, addresses[0].longitude];
        } else {
          destination = [num(args, 'latitude', { min: -90, max: 90 }), num(args, 'longitude', { min: -180, max: 180 })];
        }
        await LaunchNavigator.navigate({
          destination,
          options: {
            transportMode: MODES[String(args.mode)] ?? TransportMode.DRIVING,
            destinationName: optStr(args, 'name') ?? address,
            app: 'apple_maps',
          },
        });
        return true;
      },
    },
  ],
};
