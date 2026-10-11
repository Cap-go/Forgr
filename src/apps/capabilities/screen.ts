import { CapgoBrightness } from '@capgo/capacitor-brightness';
import { KeepAwake } from '@capgo/capacitor-keep-awake';
import type { CapabilityContext, CapabilityGroup } from './types';
import { num, requireNative } from './util';

const original = new WeakMap<CapabilityContext, number>();
const awake = new WeakSet<CapabilityContext>();

export const screen: CapabilityGroup = {
  group: 'screen',
  plugin: '@capgo/capacitor-brightness + @capgo/capacitor-keep-awake',
  summary: 'brightness and keep-awake, restored on close',
  capabilities: [
    {
      name: 'screen.getBrightness',
      signature: '() -> 0-1',
      run: async (_args, ctx) => {
        requireNative(ctx);
        return (await CapgoBrightness.getBrightness()).brightness;
      },
    },
    {
      name: 'screen.setBrightness',
      params: ['brightness'],
      signature: '(brightness: 0-1) -> true',
      run: async (args, ctx) => {
        requireNative(ctx);
        const brightness = num(args, 'brightness', { min: 0, max: 1 });
        if (!original.has(ctx)) {
          const before = (await CapgoBrightness.getBrightness()).brightness;
          original.set(ctx, before);
          ctx.onDispose(() => CapgoBrightness.setBrightness({ brightness: before }));
        }
        await CapgoBrightness.setBrightness({ brightness });
        return true;
      },
    },
    {
      name: 'screen.keepAwake',
      params: ['on'],
      signature: '(on: boolean) -> true',
      doc: 'prevent auto-lock',
      run: async (args, ctx) => {
        requireNative(ctx);
        if (args.on === false) {
          await KeepAwake.allowSleep();
          return true;
        }
        if (!(await KeepAwake.isSupported()).isSupported) throw new Error('Keep awake not supported on this device');
        await KeepAwake.keepAwake();
        if (!awake.has(ctx)) {
          awake.add(ctx);
          ctx.onDispose(() => KeepAwake.allowSleep());
        }
        return true;
      },
    },
  ],
};
