import { VolumeButtons } from '@capgo/capacitor-volume-buttons';
import type { CapabilityGroup } from './types';
import { requireNative, startWatch, stopWatch } from './util';

export const volumeButtons: CapabilityGroup = {
  group: 'volumeButtons',
  plugin: '@capgo/capacitor-volume-buttons',
  summary: 'hardware volume buttons as inputs',
  capabilities: [
    {
      name: 'volumeButtons.watch',
      signature: '() -> true',
      doc: "payload { direction: 'up'|'down' }",
      events: ['volumeButtons.press'],
      run: async (_args, ctx) => {
        requireNative(ctx);
        await startWatch(ctx, 'volumeButtons', async () => {
          const handle = await VolumeButtons.addListener('volumeButtonPressed', (e) =>
            ctx.emit('volumeButtons.press', { direction: e.direction }));
          return () => handle.remove();
        });
        return true;
      },
    },
    {
      name: 'volumeButtons.stop',
      signature: '() -> true',
      run: async (_args, ctx) => {
        await stopWatch(ctx, 'volumeButtons');
        return true;
      },
    },
  ],
};
