import { DatePicker } from '@capgo/capacitor-date-picker';
import type { CapabilityGroup } from './types';
import { optStr, requireNative } from './util';

const MODES = new Set(['date', 'time', 'dateAndTime']);

function iso(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(value as string | number);
  if (Number.isNaN(d.getTime())) throw new Error(`"${key}" must be an ISO date string or a timestamp in ms`);
  return localIso(d);
}

/** Picker values use the local time with its offset, e.g. 2026-10-11T09:30:00+02:00. */
const FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX";

function localIso(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

export const datePicker: CapabilityGroup = {
  group: 'datePicker',
  plugin: '@capgo/capacitor-date-picker',
  summary: 'native date/time picker',
  capabilities: [
    {
      name: 'datePicker.pick',
      signature: "({ mode?: 'date'|'time'|'dateAndTime', value?, min?, max?, title? }?) -> local ISO | null",
      doc: 'null if cancelled',
      run: async (args, ctx) => {
        requireNative(ctx);
        const mode = MODES.has(String(args.mode)) ? (args.mode as 'date') : 'dateAndTime';
        const { value } = await DatePicker.present({
          mode,
          format: FORMAT,
          date: iso(args.value, 'value'),
          min: iso(args.min, 'min'),
          max: iso(args.max, 'max'),
          title: optStr(args, 'title'),
          ios: { style: 'inline' },
        });
        if (!value) return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : localIso(parsed);
      },
    },
  ],
};
