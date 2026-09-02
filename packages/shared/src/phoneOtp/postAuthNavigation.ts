import type { PostAuthNavigationTarget } from './onboardingResolver';

export type PostAuthNavigationParams = {
  uid: string;
  email?: string | null;
  inputNonce?: number;
};

export function buildPostAuthResetRoutes(
  target: PostAuthNavigationTarget,
  params: PostAuthNavigationParams,
): { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> } {
  if (target === 'MainTabs') {
    return { index: 0, routes: [{ name: 'MainTabs' }] };
  }
  if (target === 'OnboardingBirthDate') {
    return {
      index: 0,
      routes: [
        {
          name: 'OnboardingBirthDate',
          params: {
            uid: params.uid,
            email: params.email ?? '',
            inputNonce: params.inputNonce ?? Date.now(),
          },
        },
      ],
    };
  }
  if (target === 'PhoneVerification') {
    return {
      index: 0,
      routes: [
        {
          name: 'PhoneVerification',
          params: { uid: params.uid, from: 'auth' },
        },
      ],
    };
  }
  return {
    index: 0,
    routes: [
      {
        name: 'ProfileCompletion',
        params: {
          uid: params.uid,
          email: params.email ?? '',
          inputNonce: params.inputNonce ?? Date.now(),
        },
      },
    ],
  };
}
