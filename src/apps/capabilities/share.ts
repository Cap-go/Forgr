import { Share } from '@capacitor/share';
import type { CapabilityGroup } from './types';
import { optStr } from './util';

export const share: CapabilityGroup = {
  group: 'share',
  plugin: '@capacitor/share',
  summary: 'system share sheet',
  capabilities: [
    {
      name: 'share.share',
      signature: '({ title?, text?, url? }) -> true',
      run: async (args) => {
        const text = optStr(args, 'text');
        const url = optStr(args, 'url');
        if (!text && !url) throw new Error('share needs text or url');
        await Share.share({ title: optStr(args, 'title'), text, url });
        return true;
      },
    },
  ],
};
