export const X_OWNERSHIP_CALLABLE_NAMES = {
  start: 'xOwnershipStart',
  exchange: 'xOwnershipExchange',
  get: 'xOwnershipGet',
  unlink: 'xOwnershipUnlink',
} as const;

export type XOwnershipCallableName =
  (typeof X_OWNERSHIP_CALLABLE_NAMES)[keyof typeof X_OWNERSHIP_CALLABLE_NAMES];

export const X_OWNERSHIP_RETURN_URL = 'nearsy://x-ownership' as const;

/** Social provider identity on verified/get/unlink responses. */
export const X_OWNERSHIP_PLATFORM = 'x' as const;

export const X_OWNERSHIP_MODES = ['personal', 'professional'] as const;
export type XOwnershipMode = (typeof X_OWNERSHIP_MODES)[number];

export const X_OWNERSHIP_CLIENT_PLATFORMS = ['ios', 'android'] as const;
export type XOwnershipClientPlatform =
  (typeof X_OWNERSHIP_CLIENT_PLATFORMS)[number];

/**
 * Start request client OS platform — Identity requires `"ios"` or `"android"`,
 * not `"x"` or `"twitter"`.
 */
export function resolveXOwnershipClientPlatform(): XOwnershipClientPlatform {
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
