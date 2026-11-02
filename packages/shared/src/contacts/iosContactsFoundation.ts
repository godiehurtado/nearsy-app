/**
 * Non-iOS stub — Identity Contacts HMAC is composed on iOS via JS Auth HTTP.
 */

import type { ContactsHmacClient } from './port';

export function getContactsHmacClient(): Promise<ContactsHmacClient> {
  return Promise.reject(
    new Error('Contacts Identity client is only available on iOS.'),
  );
}

export function resetContactsHmacClientForTests(): void {
  // no-op
}
