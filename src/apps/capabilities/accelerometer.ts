import { CapacitorAccelerometer as Accelerometer } from '@capgo/capacitor-accelerometer';
import type { CapabilityContext, CapabilityGroup } from './types';
import { ensureGranted, optNum, requireNative, startWatch, stopWatch } from './util';

async function ready(ctx: CapabilityContext): Promise<void> {
  requireNative(ctx);
  if (!(await Accelerometer.isAvailable()).isAvailable) throw new Error('Accelerometer not available on this device');
  const perm = await Accelerometer.checkPermissions();
  if (perm.accelerometer !== 'granted') ensureGranted((await Accelerometer.requestPermissions()).accelerometer, 'Motion');
}

export const accelerometer: CapabilityGroup = {
  group: 'accelerometer',
  plugin: '@capgo/capacitor-accelerometer',
  summary: 'acceleration for tilt games, levels',
  capabilities: [
    {
      name: 'accelerometer.read',
      signature: '() -> { x, y, z } in g',
      run: async (_args, ctx) => {
        await ready(ctx);
        const { x, y, z } = await Accelerometer.getMeasurement();
        return { x, y, z };
      },
    },
    {
      name: 'accelerometer.watch',
      signature: '({ intervalMs?: >=16, default 100 }?) -> true',
      events: ['accelerometer.change'],
      run: async (args, ctx) => {
        await ready(ctx);
        const interval = optNum(args, 'intervalMs', { min: 16 }) ?? 100;
        await startWatch(ctx, 'accelerometer', async () => {
          let last = 0;
          const handle = await Accelerometer.addListener('measurement', ({ x, y, z }) => {
            const now = Date.now();
            if (now - last < interval) return;
            last = now;
            ctx.emit('accelerometer.change', { x, y, z });
          });
          await Accelerometer.startMeasurementUpdates();
          return async () => {
            await handle.remove();
            await Accelerometer.stopMeasurementUpdates();
          };
        });
        return true;
      },
    },
    {
      name: 'accelerometer.stop',
      signature: '() -> true',
      run: async (_args, ctx) => {
        await stopWatch(ctx, 'accelerometer');
        return true;
      },
    },
  ],
};
