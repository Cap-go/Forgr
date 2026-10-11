import { CapacitorContacts, type Contact, type ContactField } from '@capgo/capacitor-contacts';
import type { CapabilityGroup } from './types';
import { ensureGranted, optNum, requireNative } from './util';

const FIELDS: ContactField[] = ['id', 'displayName', 'givenName', 'familyName', 'fullName', 'organizationName', 'phoneNumbers', 'emailAddresses', 'birthday'];

function shape(c: Contact) {
  const name = c.displayName || c.fullName || [c.givenName, c.familyName].filter(Boolean).join(' ') || c.organizationName || '';
  const b = c.birthday;
  return {
    id: c.id ?? null,
    name,
    phones: (c.phoneNumbers ?? []).map((p) => p.value).filter(Boolean),
    emails: (c.emailAddresses ?? []).map((e) => e.value).filter(Boolean),
    birthday: b?.month && b.day ? `${b.year ? String(b.year).padStart(4, '0') : '--'}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}` : null,
  };
}

export const contacts: CapabilityGroup = {
  group: 'contacts',
  plugin: '@capgo/capacitor-contacts',
  summary: "read-only contacts",
  capabilities: [
    {
      name: 'contacts.pick',
      params: ['multiple'],
      signature: '(multiple?: boolean) -> { id, name, phones: string[], emails: string[], birthday: YYYY-MM-DD|--MM-DD|null }[]',
      doc: 'no permission needed, prefer over list',
      run: async (args, ctx) => {
        requireNative(ctx);
        const { contacts: picked } = await CapacitorContacts.pickContacts({ fields: FIELDS, multiple: args.multiple === true });
        return picked.map(shape);
      },
    },
    {
      name: 'contacts.list',
      signature: '({ limit?: 1-2000, default 500, offset? }?) -> same shape[]',
      doc: 'asks contacts permission',
      run: async (args, ctx) => {
        requireNative(ctx);
        const perm = await CapacitorContacts.checkPermissions();
        if (perm.readContacts !== 'granted' && perm.readContacts !== 'limited') {
          ensureGranted((await CapacitorContacts.requestPermissions({ permissions: ['readContacts'] })).readContacts, 'Contacts');
        }
        const { contacts: list } = await CapacitorContacts.getContacts({
          fields: FIELDS,
          limit: optNum(args, 'limit', { min: 1, max: 2000 }) ?? 500,
          offset: optNum(args, 'offset', { min: 0 }) ?? 0,
        });
        return list.map(shape);
      },
    },
  ],
};
