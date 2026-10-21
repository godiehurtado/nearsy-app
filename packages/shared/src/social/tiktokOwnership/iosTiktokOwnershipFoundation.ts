import { TiktokOwnershipClientError } from './errors';
import type { TiktokOwnershipController } from './controller';
import type { TiktokOwnershipCallableClient } from './client';

export async function getTiktokOwnershipController(): Promise<TiktokOwnershipController> {
  throw new TiktokOwnershipClientError(
    'TIKTOK_NOT_ENABLED',
    'TikTok ownership is only available on iOS in this pilot.',
  );
}

export async function getTiktokOwnershipClient(): Promise<TiktokOwnershipCallableClient> {
  throw new TiktokOwnershipClientError(
    'TIKTOK_NOT_ENABLED',
    'TikTok ownership is only available on iOS in this pilot.',
  );
}
