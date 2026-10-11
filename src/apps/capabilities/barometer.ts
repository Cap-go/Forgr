import { CapacitorBarometer as Barometer } from '@capgo/capacitor-barometer';
import type { CapabilityContext, CapabilityGroup } from './types';
import { ensureGranted, requireNative, startWatch, stopWatch } from './util';

async function ready(ctx: CapabilityContext): Promise<void> {
  requireNative(ctx);
  if (!(await Barometer.isAvailable()).isAvailable) throw new Error('Barometer not available on this device');
  const perm = await Barometer.checkPermissions();
  if (perm.barometer !== 'granted') ensureGranted((await Barometer.requestPermissions()).barometer, 'Motion');
}

export const barometer: CapabilityGroup = {
  group: 'barometer',
  plugin: '@capgo/capacitor-barometer',
  summary: 'air pressure, relative altitude',
  capabilities: [
    {
      name: 'barometer.read',
      signature: '() -> { pressure: hPa, relativeAltitude: meters, timestamp }',
      run: async (_args, ctx) => {
        await ready(ctx);
        const { pressure, relativeAltitude, timestamp } = await Barometer.getMeasurement();
        return { pressure, relativeAltitude, timestamp };
      },
    },
    {
      name: 'barometer.watch',
      signature: '() -> true',
      events: ['barometer.change'],
      run: async (_args, ctx) => {
        await ready(ctx);
        await startWatch(ctx, 'barometer', async () => {
          const handle = await Barometer.addListener('measurement', ({ pressure, relativeAltitude, timestamp }) =>
            ctx.emit('barometer.change', { pressure, relativeAltitude, timestamp }));
          await Barometer.startMeasurementUpdates();
          return async () => {
            await handle.remove();
            await Barometer.stopMeasurementUpdates();
          };
        });
        return true;
      },
    },
    {
      name: 'barometer.stop',
      signature: '() -> true',
      run: async (_args, ctx) => {
        await stopWatch(ctx, 'barometer');
        return true;
      },
    },
  ],
};
