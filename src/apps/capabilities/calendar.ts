import { CapacitorCalendar } from '@capgo/capacitor-calendar';
import type { CapabilityContext, CapabilityGroup } from './types';
import { ensureGranted, num, optStr, requireNative, str, time } from './util';

async function ready(ctx: CapabilityContext): Promise<void> {
  requireNative(ctx);
  ensureGranted((await CapacitorCalendar.requestFullCalendarAccess()).result, 'Calendar');
}

export const calendar: CapabilityGroup = {
  group: 'calendar',
  plugin: '@capgo/capacitor-calendar',
  summary: "user's Calendar events",
  capabilities: [
    {
      name: 'calendar.listCalendars',
      signature: '() -> { id, title, color, writable }[]',
      run: async (_args, ctx) => {
        await ready(ctx);
        const { result } = await CapacitorCalendar.listCalendars();
        return result.map((c) => ({ id: c.id, title: c.title, color: c.color, writable: c.allowsContentModifications ?? true }));
      },
    },
    {
      name: 'calendar.listEvents',
      params: ['from', 'to'],
      signature: '(from: ISO|ms, to: ISO|ms) -> { id, title, start: ISO, end: ISO, allDay, location, notes, calendarId }[]',
      doc: 'max range 366 days',
      run: async (args, ctx) => {
        const from = time(args, 'from');
        const to = time(args, 'to');
        if (to <= from) throw new Error('"to" must be after "from"');
        if (to - from > 366 * 86_400_000) throw new Error('Range too large (max 366 days)');
        await ready(ctx);
        const { result } = await CapacitorCalendar.listEventsInRange({ from, to });
        return result
          .map((e) => ({
            id: e.id,
            title: e.title,
            start: new Date(e.startDate).toISOString(),
            end: new Date(e.endDate).toISOString(),
            allDay: e.isAllDay,
            location: e.location,
            notes: e.description,
            calendarId: e.calendarId,
          }))
          .sort((a, b) => a.start.localeCompare(b.start));
      },
    },
    {
      name: 'calendar.createEvent',
      signature: '({ title, start: ISO|ms, end?: ISO|ms (default +1h), allDay?, location?, notes?, alertMinutesBefore?, calendarId? }) -> { id }',
      run: async (args, ctx) => {
        const title = str(args, 'title');
        const startDate = time(args, 'start');
        const endDate = args.end === undefined ? startDate + 3_600_000 : time(args, 'end');
        if (endDate < startDate) throw new Error('"end" must be after "start"');
        const alert = args.alertMinutesBefore === undefined ? undefined : num(args, 'alertMinutesBefore', { min: 0 });
        await ready(ctx);
        const { id } = await CapacitorCalendar.createEvent({
          title,
          startDate,
          endDate,
          isAllDay: args.allDay === true,
          location: optStr(args, 'location'),
          description: optStr(args, 'notes'),
          calendarId: optStr(args, 'calendarId'),
          alerts: alert === undefined ? undefined : [-alert],
          commit: true,
        });
        return { id };
      },
    },
  ],
};
