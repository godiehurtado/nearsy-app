import { isLogoDevPublishableKey, LOGO_DEV_IMAGE_HOST } from './affiliationLogoDev';

export const LOGO_DEV_PUBLISHABLE_KEY_ENV =
  'EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY' as const;

function readKeyCandidate(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!isLogoDevPublishableKey(trimmed)) return undefined;
  return trimmed;
}

function readExtraPublishableKey(): string | undefined {
  try {
    // Dynamic require: Node tests must not load expo-constants / RN.
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
    };
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
    return readKeyCandidate(extra[LOGO_DEV_PUBLISHABLE_KEY_ENV]);
  } catch {
    return undefined;
  }
}

/**
 * Client-safe publishable key only. Never returns sk_ values.
 * Expo inlines EXPO_PUBLIC_* from Development env; EAS also copies it to extra.
 */
export function readLogoDevPublishableKey(): string | undefined {
  return (
    readKeyCandidate(process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV]) ??
    readExtraPublishableKey()
  );
}

/** Booleans/host only — never the key value, query string, or entity data. */
export function describeAffiliationLogoRuntime(): {
  keyPresent: boolean;
  envKeyPresent: boolean;
  extraKeyPresent: boolean;
  host: typeof LOGO_DEV_IMAGE_HOST;
} {
  return {
    keyPresent: Boolean(readLogoDevPublishableKey()),
    envKeyPresent: Boolean(
      readKeyCandidate(process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV]),
    ),
    extraKeyPresent: Boolean(readExtraPublishableKey()),
    host: LOGO_DEV_IMAGE_HOST,
  };
}
