import { XOwnershipClientError } from './errors';
import type { XOwnershipController } from './controller';
import type { XOwnershipCallableClient } from './client';

export async function getXOwnershipController(): Promise<XOwnershipController> {
  throw new XOwnershipClientError(
    'X_NOT_ENABLED',
    'X ownership is only available on iOS in this pilot.',
  );
}

export async function getXOwnershipClient(): Promise<XOwnershipCallableClient> {
  throw new XOwnershipClientError(
    'X_NOT_ENABLED',
    'X ownership is only available on iOS in this pilot.',
  );
}
