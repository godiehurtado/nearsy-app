import { DeleteMyAccountError } from './contract';
import type { DeleteMyAccountPort } from './port';

export function getDeleteMyAccountPort(): Promise<DeleteMyAccountPort> {
  return Promise.reject(new DeleteMyAccountError('UNKNOWN', false));
}

export function resetDeleteMyAccountPortForTests(): void {
  // no-op
}
