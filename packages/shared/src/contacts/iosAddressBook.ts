import type { ContactsAddressBookPort, ContactsPermissionStatus } from './port';

export function createContactsAddressBookPort(): ContactsAddressBookPort {
  return {
    async getPermission() {
      return 'denied';
    },
    async requestPermission() {
      return 'denied';
    },
    async readRows() {
      return [];
    },
  };
}

export function mapExpoPermission(
  status: string | undefined,
): ContactsPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}
