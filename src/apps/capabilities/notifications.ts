import { LocalNotifications } from '@capacitor/local-notifications';
import type { CapabilityGroup } from './types';
import { num } from './util';

const REPEAT = new Set(['minute', 'hour', 'day', 'week', 'month', 'year']);

export const notifications: CapabilityGroup = {
  group: 'notifications',
  plugin: '@capacitor/local-notifications',
  summary: 'local reminders',
  capabilities: [
    {
      name: 'notifications.schedule',
      signature: "({ title?, body, at?: ISO date|ms, every?: 'minute'|'hour'|'day'|'week', id?: number }) -> { id }",
      doc: 'asks permission',
      run: async (args, ctx) => {
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display !== 'granted') throw new Error('Notifications permission denied. Allow it in Settings > Mapp.');
        const id = typeof args.id === 'number' ? args.id : Math.floor(Math.random() * 2_000_000_000);
        const at = args.at ? new Date(args.at as string | number) : new Date(Date.now() + 1000);
        if (Number.isNaN(at.getTime())) throw new Error('"at" must be an ISO date string or a timestamp in ms');
        const every = typeof args.every === 'string' && REPEAT.has(args.every) ? (args.every as 'day') : undefined;
        await LocalNotifications.schedule({
          notifications: [{
            id,
            title: String(args.title ?? ctx.app.name),
            body: String(args.body ?? ''),
            schedule: every ? { at, every, repeats: true } : { at },
            extra: { appId: ctx.app.id },
          }],
        });
        return { id };
      },
    },
    {
      name: 'notifications.cancel',
      params: ['id'],
      signature: '(id) -> true',
      run: async (args) => {
        await LocalNotifications.cancel({ notifications: [{ id: num(args, 'id') }] });
        return true;
      },
    },
  ],
};
