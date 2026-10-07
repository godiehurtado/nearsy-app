import type { LinkableProvider } from '../domain/accountLinkError';

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

/** Methods that can be connected explicitly from Settings. Email is not. */
const CONNECTABLE: Partial<Record<SignInMethodId, LinkableProvider>> = {
  'google.com': 'google',
  'apple.com': 'apple',
  'facebook.com': 'facebook',
};

export type SignInMethodRow = {
  id: SignInMethodId;
  linked: boolean;
  labelKey: string;
  /** Present when the method is not linked and can be connected explicitly. */
  connectProvider?: LinkableProvider;
};

/**
 * Email and password only when linked; Google, Apple and Facebook always
 * (connected, or connectable). Stable order; unknown provider ids are ignored.
 */
export function buildSignInMethodRows(providerIds: readonly string[]): SignInMethodRow[] {
  const linked = new Set(providerIds);
  return DISPLAY_ORDER.filter((id) => linked.has(id) || CONNECTABLE[id]).map((id) => {
    const isLinked = linked.has(id);
    const connectProvider = CONNECTABLE[id];
    return {
      id,
      linked: isLinked,
      labelKey: SIGN_IN_METHOD_LABEL_KEYS[id],
      ...(!isLinked && connectProvider ? { connectProvider } : {}),
    };
  });
}
