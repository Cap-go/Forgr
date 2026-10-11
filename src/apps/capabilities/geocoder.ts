import { NativeGeocoder, type Address } from '@capgo/capacitor-nativegeocoder';
import type { CapabilityGroup } from './types';
import { num, optNum, requireNative, str } from './util';

function shape(a: Address) {
  const street = [a.subThoroughfare, a.thoroughfare].filter(Boolean).join(' ');
  const formatted = [street, a.locality, a.administrativeArea, a.postalCode, a.countryName].filter(Boolean).join(', ');
  return {
    formatted,
    street: street || null,
    city: a.locality || null,
    region: a.administrativeArea || null,
    postalCode: a.postalCode || null,
    country: a.countryName || null,
    countryCode: a.countryCode || null,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

export const geocoder: CapabilityGroup = {
  group: 'geocoder',
  plugin: '@capgo/capacitor-nativegeocoder',
  summary: 'coordinates <-> addresses',
  capabilities: [
    {
      name: 'geocoder.reverse',
      params: ['latitude', 'longitude'],
      signature: '(latitude, longitude) -> { formatted, street, city, region, postalCode, country, countryCode, latitude, longitude } | null',
      run: async (args, ctx) => {
        requireNative(ctx);
        const { addresses } = await NativeGeocoder.reverseGeocode({
          latitude: num(args, 'latitude', { min: -90, max: 90 }),
          longitude: num(args, 'longitude', { min: -180, max: 180 }),
          useLocale: true,
          maxResults: 1,
        });
        return addresses[0] ? shape(addresses[0]) : null;
      },
    },
    {
      name: 'geocoder.forward',
      params: ['address', 'maxResults'],
      signature: '(address: string, maxResults?: 1-5) -> same shape[]',
      run: async (args, ctx) => {
        requireNative(ctx);
        const { addresses } = await NativeGeocoder.forwardGeocode({
          addressString: str(args, 'address'),
          useLocale: true,
          maxResults: optNum(args, 'maxResults', { min: 1, max: 5 }) ?? 1,
        });
        return addresses.map(shape);
      },
    },
  ],
};
