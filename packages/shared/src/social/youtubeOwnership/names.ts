export const YOUTUBE_OWNERSHIP_CALLABLE_NAMES = {
  start: 'youtubeOwnershipStart',
  exchange: 'youtubeOwnershipExchange',
  selectChannel: 'youtubeOwnershipSelectChannel',
  get: 'youtubeOwnershipGet',
  unlink: 'youtubeOwnershipUnlink',
} as const;

export type YoutubeOwnershipCallableName =
  (typeof YOUTUBE_OWNERSHIP_CALLABLE_NAMES)[keyof typeof YOUTUBE_OWNERSHIP_CALLABLE_NAMES];

export const YOUTUBE_OWNERSHIP_RETURN_URL =
  'nearsy://youtube-ownership' as const;

/** Social provider identity on verified/get/unlink responses. */
export const YOUTUBE_OWNERSHIP_PLATFORM = 'youtube' as const;

export const YOUTUBE_OWNERSHIP_MODES = ['personal', 'professional'] as const;
export type YoutubeOwnershipMode = (typeof YOUTUBE_OWNERSHIP_MODES)[number];

export const YOUTUBE_OWNERSHIP_CLIENT_PLATFORMS = ['ios', 'android'] as const;
export type YoutubeOwnershipClientPlatform =
  (typeof YOUTUBE_OWNERSHIP_CLIENT_PLATFORMS)[number];

/**
 * Start request client OS platform — Identity requires `"ios"` or `"android"`,
 * not `"youtube"`.
 */
export function resolveYoutubeOwnershipClientPlatform(): YoutubeOwnershipClientPlatform {
  try {
    // Lazy require keeps Node unit tests free of react-native bundling.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native') as {
      Platform: { OS?: string };
    };
    if (rn.Platform?.OS === 'android') return 'android';
  } catch {
    // non-RN host
  }
  return 'ios';
}
