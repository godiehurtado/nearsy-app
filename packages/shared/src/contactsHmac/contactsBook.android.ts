/**
 * Android OS contacts reader. Identifiers only — never a client hash.
 * Denied permission must not upload an empty snapshot.
 */
import { collectContactIdentifiers } from './contactsHmacCore.ts';
import type { ContactIdentifierInput } from './contactsHmacContract.ts';
import type { ContactsBookPort, ContactsPermissionStatus } from './contactsSyncFlow.ts';

type ExpoContactsModule = {
  Fields: { Emails: string; PhoneNumbers: string };
  getPermissionsAsync: () => Promise<{ status?: string }>;
  requestPermissionsAsync: () => Promise<{ status?: string }>;
  getContactsAsync: (opts: {
    fields: string[];
    pageSize: number;
    pageOffset: number;
  }) => Promise<{
    data?: Array<{
      emails?: Array<{ email?: string | null } | null> | null;
      phoneNumbers?: Array<{ number?: string | null } | null> | null;
    }>;
    hasNextPage?: boolean;
  }>;
};

function loadExpoContacts(): ExpoContactsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-contacts') as ExpoContactsModule;
  } catch {
    return null;
  }
}

function mapPermission(status: string | undefined): ContactsPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

export function createAndroidContactsBook(): ContactsBookPort {
  const Contacts = loadExpoContacts();
  return {
    async getPermission() {
      if (!Contacts) return 'denied';
      const snap = await Contacts.getPermissionsAsync();
      return mapPermission(snap.status);
    },
    async requestPermission() {
      if (!Contacts) return 'denied';
      const snap = await Contacts.requestPermissionsAsync();
      return mapPermission(snap.status);
    },
    async readRecords() {
      if (!Contacts) return [];
      const pageSize = 200;
      let pageOffset = 0;
      let hasNext = true;
      const records: Array<{
        emails?: Array<{ email?: string | null } | null> | null;
        phoneNumbers?: Array<{ number?: string | null } | null> | null;
      }> = [];
      while (hasNext) {
        const page = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
          pageSize,
          pageOffset,
        });
        records.push(...(page.data ?? []));
        hasNext = page.hasNextPage === true;
        pageOffset += pageSize;
        if (records.length > 20_000) break;
      }
      const collected = collectContactIdentifiers(records);
      if (!collected.ok) return { capExceeded: true };
      return collected.identifiers as ContactIdentifierInput[];
    },
  };
}
