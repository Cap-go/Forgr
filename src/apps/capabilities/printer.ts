import { Printer } from '@capgo/capacitor-printer';
import type { CapabilityGroup } from './types';
import { obj, optStr, requireNative, str } from './util';

export const printer: CapabilityGroup = {
  group: 'printer',
  plugin: '@capgo/capacitor-printer',
  summary: 'AirPrint dialog',
  capabilities: [
    {
      name: 'printer.printHtml',
      params: ['html', 'options'],
      signature: '(html, { name?: job name }?) -> true',
      run: async (args, ctx) => {
        requireNative(ctx);
        await Printer.printHtml({ html: str(args, 'html'), name: optStr(obj(args, 'options'), 'name') ?? ctx.app.name });
        return true;
      },
    },
  ],
};
