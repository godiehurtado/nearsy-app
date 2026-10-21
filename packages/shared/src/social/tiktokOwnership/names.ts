export const TIKTOK_OWNERSHIP_CALLABLE_NAMES = {
  start: 'tiktokOwnershipStart',
  exchange: 'tiktokOwnershipExchange',
  get: 'tiktokOwnershipGet',
  unlink: 'tiktokOwnershipUnlink',
} as const;

export type TiktokOwnershipCallableName =
  (typeof TIKTOK_OWNERSHIP_CALLABLE_NAMES)[keyof typeof TIKTOK_OWNERSHIP_CALLABLE_NAMES];

export const TIKTOK_OWNERSHIP_RETURN_URL = 'nearsy://tiktok-ownership' as const;

/** Social provider identity on verified/get/unlink responses. */
export const TIKTOK_OWNERSHIP_PLATFORM = 'tiktok' as const;

export const TIKTOK_OWNERSHIP_MODES = ['personal', 'professional'] as const;
export type TiktokOwnershipMode = (typeof TIKTOK_OWNERSHIP_MODES)[number];

export const TIKTOK_OWNERSHIP_CLIENT_PLATFORMS = ['ios', 'android'] as const;
export type TiktokOwnershipClientPlatform =
  (typeof TIKTOK_OWNERSHIP_CLIENT_PLATFORMS)[number];

/**
 * Start request client OS platform — Identity requires `"ios"` or `"android"`,
 * not `"tiktok"`.
 */
export function resolveTiktokOwnershipClientPlatform(): TiktokOwnershipClientPlatform {
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
