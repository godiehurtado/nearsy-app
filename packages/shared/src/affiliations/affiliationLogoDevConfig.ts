import { isLogoDevPublishableKey } from './affiliationLogoDev';

export const LOGO_DEV_PUBLISHABLE_KEY_ENV =
  'EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY' as const;

/**
 * Client-safe publishable key only. Never returns sk_ values.
 * Expo inlines EXPO_PUBLIC_* from Development env / app.config extra.
 */
export function readLogoDevPublishableKey(): string | undefined {
  const raw = String(process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV] ?? '').trim();
  if (!isLogoDevPublishableKey(raw)) return undefined;
  return raw;
}
