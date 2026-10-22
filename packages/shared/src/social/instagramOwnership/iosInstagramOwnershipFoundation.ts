import { InstagramOwnershipClientError } from './errors';
import type { InstagramOwnershipCallableClient } from './client';

export async function getInstagramOwnershipClient(): Promise<InstagramOwnershipCallableClient> {
  throw new InstagramOwnershipClientError(
    'INSTAGRAM_NOT_ENABLED',
    'Instagram ownership is only available on iOS in this pilot.',
  );
}
