/**
 * @deprecated OBSOLETE (TS-006 / ADR-007)
 *
 * Legacy expo-auth-session Google stub. Do not use for production Google Sign-In.
 * Replaced by packages/shared/src/authentication/social Google provider adapter
 * using @react-native-google-signin/google-signin.
 *
 * Retained temporarily as historical reference. Do not import from LoginScreen.
 */
export function useGoogleAuth(): never {
  throw new Error(
    '[googleAuth.ios] Obsolete AuthSession Google stub. Use authentication/social Google provider adapter (TS-006).',
  );
}
