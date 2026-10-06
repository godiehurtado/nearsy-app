/**
 * Sign-in methods shown in Settings, derived only from Firebase `providerData`.
 * LinkedIn (A3 custom token) and phone OTP never appear in `providerData`, so
 * they are intentionally not listed — no state is inferred for them.
 */
export type SignInMethodId = 'password' | 'google.com' | 'apple.com' | 'facebook.com';

const DISPLAY_ORDER: readonly SignInMethodId[] = [
  'password',
  'google.com',
  'apple.com',
  'facebook.com',
];

export const SIGN_IN_METHOD_LABEL_KEYS: Record<SignInMethodId, string> = {
  password: 'settings.signInMethods.providers.password',
  'google.com': 'settings.signInMethods.providers.google',
  'apple.com': 'settings.signInMethods.providers.apple',
  'facebook.com': 'settings.signInMethods.providers.facebook',
};

export type SignInMethodRow = {
  id: SignInMethodId;
  linked: boolean;
  labelKey: string;
};

/**
 * Linked methods in a stable order, followed by Facebook (connected or
 * connectable). Unknown provider ids are ignored.
 */
export function buildSignInMethodRows(providerIds: readonly string[]): SignInMethodRow[] {
  const linked = new Set(providerIds);
  return DISPLAY_ORDER.filter((id) => id === 'facebook.com' || linked.has(id)).map(
    (id) => ({ id, linked: linked.has(id), labelKey: SIGN_IN_METHOD_LABEL_KEYS[id] }),
  );
}
