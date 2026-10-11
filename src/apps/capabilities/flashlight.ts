import { CapacitorFlash } from '@capgo/capacitor-flash';
import type { CapabilityContext, CapabilityGroup } from './types';
import { optNum, requireNative } from './util';

const used = new WeakSet<CapabilityContext>();

async function ready(ctx: CapabilityContext): Promise<void> {
  requireNative(ctx);
  if (!(await CapacitorFlash.isAvailable()).value) throw new Error('No flashlight on this device');
  if (!used.has(ctx)) {
    used.add(ctx);
    ctx.onDispose(async () => {
      if ((await CapacitorFlash.isSwitchedOn()).value) await CapacitorFlash.switchOff();
    });
  }
}

export const flashlight: CapabilityGroup = {
  group: 'flashlight',
  plugin: '@capgo/capacitor-flash',
  summary: 'torch, off on close',
  capabilities: [
    {
      name: 'flashlight.isAvailable',
      signature: '() -> boolean',
      run: async (_args, ctx) => ctx.native && (await CapacitorFlash.isAvailable()).value,
    },
    {
      name: 'flashlight.on',
      params: ['intensity'],
      signature: '(intensity?: 0-1) -> true',
      run: async (args, ctx) => {
        await ready(ctx);
        await CapacitorFlash.switchOn({ intensity: optNum(args, 'intensity', { min: 0, max: 1 }) ?? 1 });
        return true;
      },
    },
    {
      name: 'flashlight.off',
      signature: '() -> true',
      run: async (_args, ctx) => {
        await ready(ctx);
        await CapacitorFlash.switchOff();
        return true;
      },
    },
    {
      name: 'flashlight.toggle',
      signature: '() -> isOn: boolean',
      run: async (_args, ctx) => {
        await ready(ctx);
        return (await CapacitorFlash.toggle()).value;
      },
    },
  ],
};
