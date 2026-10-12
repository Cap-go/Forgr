import { CapacitorPedometer, type Measurement } from '@capgo/capacitor-pedometer';
import type { CapabilityContext, CapabilityGroup } from './types';
import { ensureGranted, requireNative, startWatch, stopWatch, time } from './util';

async function ready(ctx: CapabilityContext): Promise<void> {
  requireNative(ctx);
  if (!(await CapacitorPedometer.isAvailable()).stepCounting) throw new Error('Step counting not available on this device');
  const perm = await CapacitorPedometer.checkPermissions();
  if (perm.activityRecognition !== 'granted') {
    ensureGranted((await CapacitorPedometer.requestPermissions()).activityRecognition, 'Motion & Fitness');
  }
}

function shape(m: Measurement) {
  return {
    steps: m.numberOfSteps ?? 0,
    distance: m.distance ?? null,
    floorsAscended: m.floorsAscended ?? null,
    floorsDescended: m.floorsDescended ?? null,
  };
}

export const pedometer: CapabilityGroup = {
  group: 'pedometer',
  plugin: '@capgo/capacitor-pedometer',
  summary: 'steps (recent days, as kept by the phone)',
  capabilities: [
    {
      name: 'pedometer.today',
      signature: '() -> { steps, distance: meters|null, floorsAscended, floorsDescended }',
      run: async (_args, ctx) => {
        await ready(ctx);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return shape(await CapacitorPedometer.getMeasurement({ start: start.getTime(), end: Date.now() }));
      },
    },
    {
      name: 'pedometer.range',
      params: ['start', 'end'],
      signature: '(start: ISO|ms, end?: ISO|ms) -> { steps, distance, floorsAscended, floorsDescended }',
      run: async (args, ctx) => {
        await ready(ctx);
        const start = time(args, 'start');
        const end = args.end === undefined ? Date.now() : time(args, 'end');
        if (end <= start) throw new Error('"end" must be after "start"');
        return shape(await CapacitorPedometer.getMeasurement({ start, end }));
      },
    },
    {
      name: 'pedometer.watch',
      signature: '() -> true',
      doc: 'counts since watch start',
      events: ['pedometer.change'],
      run: async (_args, ctx) => {
        await ready(ctx);
        await startWatch(ctx, 'pedometer', async () => {
          const handle = await CapacitorPedometer.addListener('measurement', (m) => ctx.emit('pedometer.change', shape(m)));
          await CapacitorPedometer.startMeasurementUpdates();
          return async () => {
            await handle.remove();
            await CapacitorPedometer.stopMeasurementUpdates();
          };
        });
        return true;
      },
    },
    {
      name: 'pedometer.stop',
      signature: '() -> true',
      run: async (_args, ctx) => {
        await stopWatch(ctx, 'pedometer');
        return true;
      },
    },
  ],
};
