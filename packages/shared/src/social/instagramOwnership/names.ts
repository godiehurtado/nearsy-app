export const INSTAGRAM_OWNERSHIP_CALLABLE_NAMES = {
  start: 'instagramOwnershipStart',
  get: 'instagramOwnershipGet',
  unlink: 'instagramOwnershipUnlink',
  inboxAuthorizeStart: 'instagramInboxAuthorizeStart',
} as const;

export type InstagramOwnershipCallableName =
  (typeof INSTAGRAM_OWNERSHIP_CALLABLE_NAMES)[keyof typeof INSTAGRAM_OWNERSHIP_CALLABLE_NAMES];

export const INSTAGRAM_OWNERSHIP_PLATFORM = 'instagram' as const;

export const INSTAGRAM_OWNERSHIP_MODES = ['personal', 'professional'] as const;
export type InstagramOwnershipMode = (typeof INSTAGRAM_OWNERSHIP_MODES)[number];

export const INSTAGRAM_OWNERSHIP_CLIENT_PLATFORMS = ['ios', 'android'] as const;
export type InstagramOwnershipClientPlatform =
  (typeof INSTAGRAM_OWNERSHIP_CLIENT_PLATFORMS)[number];

/** iOS Own Profile always sends Start `platform: "ios"`. */
export function resolveInstagramOwnershipClientPlatform(): InstagramOwnershipClientPlatform {
  return 'ios';
}
