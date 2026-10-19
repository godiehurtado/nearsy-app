import { YoutubeOwnershipClientError } from './errors';
import type { YoutubeOwnershipController } from './controller';
import type { YoutubeOwnershipCallableClient } from './client';

export async function getYoutubeOwnershipController(): Promise<YoutubeOwnershipController> {
  throw new YoutubeOwnershipClientError(
    'YOUTUBE_NOT_ENABLED',
    'YouTube ownership is only available on iOS in this pilot.',
  );
}

export async function getYoutubeOwnershipClient(): Promise<YoutubeOwnershipCallableClient> {
  throw new YoutubeOwnershipClientError(
    'YOUTUBE_NOT_ENABLED',
    'YouTube ownership is only available on iOS in this pilot.',
  );
}
