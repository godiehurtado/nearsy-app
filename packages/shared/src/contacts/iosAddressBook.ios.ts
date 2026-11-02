/**
 * Reads phones/emails from the granted (or limited) address book. Names and
 * photos are never sent on the Identity wire. Never persists the raw book.
 */

import type { ContactsAddressBookPort, ContactsPermissionStatus } from './port';

type ExpoPermissionResponse = {
  status?: string;
  accessPrivileges?: string;
};

function mapExpoPermission(
  response: ExpoPermissionResponse | null | undefined,
): ContactsPermissionStatus {
  const status = response?.status;
  if (status === 'undetermined') return 'undetermined';
  if (status === 'denied') return 'denied';
  // expo-contacts may surface limited as status or as accessPrivileges.
  if (status === 'limited') return 'limited';
  if (status === 'granted') {
    if (response?.accessPrivileges === 'limited') return 'limited';
    return 'granted';
  }
  return 'denied';
}

type ExpoContactsModule = {
  Fields: { PhoneNumbers: string; Emails: string };
  getPermissionsAsync(): Promise<ExpoPermissionResponse>;
  requestPermissionsAsync(): Promise<ExpoPermissionResponse>;
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
      return mapExpoPermission(await Contacts.getPermissionsAsync());
    },
    async requestPermission() {
      const Contacts = await loadModule();
      if (!Contacts) return 'denied';
      return mapExpoPermission(await Contacts.requestPermissionsAsync());
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
