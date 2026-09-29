/**
 * Non-Android stub — Facebook Login is Android-only (ENH-AUTH-FB-01).
 */
import type { useFacebookSignInFlow as useFacebookSignInFlowAndroid } from './useFacebookSignInFlow.android';

export const useFacebookSignInFlow: typeof useFacebookSignInFlowAndroid = () => ({
  signInWithFacebook: async () => {},
  facebookSubmitting: false,
});
