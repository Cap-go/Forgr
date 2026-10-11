import { Clipboard } from '@capacitor/clipboard';
import type { CapabilityGroup } from './types';

export const clipboard: CapabilityGroup = {
  group: 'clipboard',
  plugin: '@capacitor/clipboard',
  summary: 'copy and paste text',
  capabilities: [
    {
      name: 'clipboard.write',
      params: ['text'],
      signature: '(text) -> true',
      run: async (args) => {
        await Clipboard.write({ string: String(args.text ?? '') });
        return true;
      },
    },
    {
      name: 'clipboard.read',
      signature: '() -> string',
      run: async () => (await Clipboard.read()).value,
    },
  ],
};
