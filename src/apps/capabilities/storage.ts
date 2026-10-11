import { appStore } from '../store';
import type { CapabilityContext, CapabilityGroup } from './types';
import { str } from './util';

const cache = new WeakMap<CapabilityContext, Record<string, unknown>>();

async function data(ctx: CapabilityContext): Promise<Record<string, unknown>> {
  let value = cache.get(ctx);
  if (!value) {
    value = await appStore.readData(ctx.app.id);
    cache.set(ctx, value);
  }
  return value;
}

export const storage: CapabilityGroup = {
  group: 'storage',
  plugin: 'built-in',
  summary: 'persistent JSON key/value data private to this app',
  capabilities: [
    {
      name: 'storage.get',
      params: ['key'],
      signature: '(key) -> value | null',
      run: async (args, ctx) => (await data(ctx))[str(args, 'key')] ?? null,
    },
    {
      name: 'storage.set',
      params: ['key', 'value'],
      signature: '(key, value: any JSON) -> true',
      run: async (args, ctx) => {
        const key = str(args, 'key');
        const d = await data(ctx);
        if (args.value === undefined) delete d[key];
        else d[key] = JSON.parse(JSON.stringify(args.value)) as unknown;
        await appStore.writeData(ctx.app.id, d);
        return true;
      },
    },
    {
      name: 'storage.remove',
      params: ['key'],
      signature: '(key) -> true',
      run: async (args, ctx) => {
        const d = await data(ctx);
        delete d[str(args, 'key')];
        await appStore.writeData(ctx.app.id, d);
        return true;
      },
    },
    {
      name: 'storage.keys',
      signature: '() -> string[]',
      run: async (_args, ctx) => Object.keys(await data(ctx)),
    },
  ],
};
