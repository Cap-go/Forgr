import { CapgoCompass } from '@capgo/capacitor-compass';
import type { CapabilityContext, CapabilityGroup } from './types';
import { ensureGranted, optNum, requireNative, startWatch, stopWatch } from './util';

async function ready(ctx: CapabilityContext): Promise<void> {
  requireNative(ctx);
  const perm = await CapgoCompass.checkPermissions();
  if (perm.compass !== 'granted') ensureGranted((await CapgoCompass.requestPermissions()).compass, 'Compass (location)');
}

export const compass: CapabilityGroup = {
  group: 'compass',
  plugin: '@capgo/capacitor-compass',
  summary: 'heading for compasses/direction finders',
  capabilities: [
    {
      name: 'compass.getHeading',
      signature: '() -> { heading: degrees 0-360, 0 = north }',
      run: async (_args, ctx) => {
        await ready(ctx);
        return { heading: (await CapgoCompass.getCurrentHeading()).value };
      },
    },
    {
      name: 'compass.watch',
      signature: '({ minChange?: degrees }?) -> true',
      events: ['compass.heading'],
      run: async (args, ctx) => {
        await ready(ctx);
        await startWatch(ctx, 'compass', async () => {
          const handle = await CapgoCompass.addListener('headingChange', (e) => ctx.emit('compass.heading', { heading: e.value }));
          await CapgoCompass.startListening({ minInterval: 100, minHeadingChange: optNum(args, 'minChange', { min: 0 }) ?? 1 });
          return async () => {
            await handle.remove();
            await CapgoCompass.stopListening();
          };
        });
        return true;
      },
    },
    {
      name: 'compass.stop',
      signature: '() -> true',
      run: async (_args, ctx) => {
        await stopWatch(ctx, 'compass');
        return true;
      },
    },
  ],
};
