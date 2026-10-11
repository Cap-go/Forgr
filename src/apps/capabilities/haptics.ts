import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type { CapabilityGroup } from './types';

const IMPACT: Record<string, ImpactStyle> = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
const NOTIFY: Record<string, NotificationType> = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
};

export const haptics: CapabilityGroup = {
  group: 'haptics',
  plugin: '@capacitor/haptics',
  summary: 'vibration feedback',
  capabilities: [
    {
      name: 'haptics.impact',
      params: ['style'],
      signature: "(style?: 'light'|'medium'|'heavy') -> true",
      run: async (args, ctx) => {
        if (ctx.native) await Haptics.impact({ style: IMPACT[String(args.style)] ?? ImpactStyle.Light });
        return true;
      },
    },
    {
      name: 'haptics.notification',
      params: ['type'],
      signature: "(type?: 'success'|'warning'|'error') -> true",
      run: async (args, ctx) => {
        if (ctx.native) await Haptics.notification({ type: NOTIFY[String(args.type)] ?? NotificationType.Success });
        return true;
      },
    },
    {
      name: 'haptics.selection',
      signature: '() -> true',
      doc: 'tick for pickers/toggles',
      run: async (_args, ctx) => {
        if (ctx.native) await Haptics.selectionChanged();
        return true;
      },
    },
  ],
};
