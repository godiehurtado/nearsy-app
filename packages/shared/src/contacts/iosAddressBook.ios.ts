/**
 * Reads phones/emails from the granted address book. Names and photos are
 * never sent on the Identity wire.
 */

import type { ContactsAddressBookPort, ContactsPermissionStatus } from './port';

function mapExpoPermission(status: string | undefined): ContactsPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

type ExpoContactsModule = {
  Fields: { PhoneNumbers: string; Emails: string };
  getPermissionsAsync(): Promise<{ status?: string }>;
  requestPermissionsAsync(): Promise<{ status?: string }>;
  getContactsAsync(options: {
    fields: string[];
    pageSize?: number;
    pageOffset?: number;
  }): Promise<{
    data?: Array<{
      phoneNumbers?: Array<{ number?: string | null } | null> | null;
      emails?: Array<{ email?: string | null } | null> | null;
    }>;
    hasNextPage?: boolean;
  }>;
};

async function loadModule(): Promise<ExpoContactsModule | null> {
  try {
    return (await import('expo-contacts')) as unknown as ExpoContactsModule;
  } catch {
    return null;
  }
}

export function createContactsAddressBookPort(): ContactsAddressBookPort {
  return {
    async getPermission() {
      const Contacts = await loadModule();
      if (!Contacts) return 'denied';
      const current = await Contacts.getPermissionsAsync();
      return mapExpoPermission(current.status);
    },
    async requestPermission() {
      const Contacts = await loadModule();
      if (!Contacts) return 'denied';
      const current = await Contacts.requestPermissionsAsync();
      return mapExpoPermission(current.status);
    },
    async readRows() {
      const Contacts = await loadModule();
      if (!Contacts) return [];
      const rows: Array<{
        phoneNumbers?: Array<{ number?: string | null } | null> | null;
        emails?: Array<{ email?: string | null } | null> | null;
      }> = [];
      let pageOffset = 0;
      const pageSize = 200;
      for (;;) {
        const page = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
          pageSize,
          pageOffset,
        });
        for (const row of page.data ?? []) {
          rows.push({
            phoneNumbers: row.phoneNumbers ?? [],
            emails: row.emails ?? [],
          });
        }
        if (!page.hasNextPage) break;
        pageOffset += pageSize;
        if (rows.length > 20_000) break;
      }
      return rows;
    },
  };
}
