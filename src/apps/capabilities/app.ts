import { Capacitor } from '@capacitor/core';
import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import type { CapabilityGroup } from './types';
import { str } from './util';

export const app: CapabilityGroup = {
  group: 'app',
  plugin: 'Forgr shell',
  summary: 'this app and the Forgr shell',
  capabilities: [
    {
      name: 'app.info',
      signature: '() -> { id, name, emoji, color, version, platform }',
      run: async (_args, ctx) => ({
        id: ctx.app.id,
        name: ctx.app.name,
        emoji: ctx.app.emoji,
        color: ctx.app.color,
        version: ctx.app.version,
        platform: Capacitor.getPlatform(),
      }),
    },
    {
      name: 'app.home',
      signature: '() -> true',
      doc: 'close app',
      run: async (_args, ctx) => {
        ctx.host.goHome();
        return true;
      },
    },
    {
      name: 'app.edit',
      params: ['prompt'],
      signature: '(prompt?) -> true',
      doc: 'open AI editor',
      run: async (args, ctx) => {
        ctx.host.openEditor(typeof args.prompt === 'string' ? args.prompt : undefined);
        return true;
      },
    },
    {
      name: 'app.openUrl',
      params: ['url'],
      signature: '(url) -> true',
      doc: 'in-app browser',
      run: async (args, ctx) => {
        const url = str(args, 'url');
        if (!/^https?:\/\//i.test(url)) throw new Error('openUrl needs an absolute http(s) URL');
        if (ctx.native) await InAppBrowser.open({ url });
        else window.open(url, '_blank', 'noopener');
        return true;
      },
    },
  ],
};
