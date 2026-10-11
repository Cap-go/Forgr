import { CapacitorShake } from '@capgo/capacitor-shake';
import type { CapabilityGroup } from './types';
import { requireNative, startWatch, stopWatch } from './util';

export const shake: CapabilityGroup = {
  group: 'shake',
  plugin: '@capgo/capacitor-shake',
  summary: 'phone shaken (undo, shuffle, dice)',
  capabilities: [
    {
      name: 'shake.watch',
      signature: '() -> true',
      events: ['shake'],
      run: async (_args, ctx) => {
        requireNative(ctx);
        await startWatch(ctx, 'shake', async () => {
          const handle = await CapacitorShake.addListener('shake', () => ctx.emit('shake', {}));
          return () => handle.remove();
        });
        return true;
      },
    },
    {
      name: 'shake.stop',
      signature: '() -> true',
      run: async (_args, ctx) => {
        await stopWatch(ctx, 'shake');
        return true;
      },
    },
  ],
};
