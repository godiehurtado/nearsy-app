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

/** Shared mapper for tests / non-iOS stubs when the SDK exposes limited. */
export function mapExpoPermission(
  status: string | undefined,
  accessPrivileges?: string,
): ContactsPermissionStatus {
  if (status === 'undetermined') return 'undetermined';
  if (status === 'denied') return 'denied';
  if (status === 'limited') return 'limited';
  if (status === 'granted') {
    if (accessPrivileges === 'limited') return 'limited';
    return 'granted';
  }
  return 'denied';
}
