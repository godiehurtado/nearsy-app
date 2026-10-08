import {
  GoogleAuthProvider,
  linkWithCredential,
  OAuthProvider,
  type AuthCredential,
  type User,
  type UserCredential,
} from 'firebase/auth';

import { AccountLinkError } from '../../domain/accountLinkError';
import type {
  FirebaseAccountLinkingPort,
  FirebaseProviderLinkInput,
  LinkCredentialInput,
  LinkedAccountSnapshot,
} from './firebaseAccountLinkingPort';

type LinkableUser = Pick<User, 'uid' | 'providerData' | 'reload'>;

export interface FirebaseJsAccountLinkingRuntime {
  OAuthProvider: new (providerId: string) => {
    credential(params: { idToken: string; rawNonce: string }): AuthCredential;
  };
  GoogleAuthProvider: {
    credential(idToken: string, accessToken?: string | null): AuthCredential;
  };
  linkWithCredential: (
    user: LinkableUser,
    credential: AuthCredential,
  ) => Promise<Pick<UserCredential, 'user'>>;
  auth: { readonly currentUser: LinkableUser | null };
}

function resolveDefaultAuth(): FirebaseJsAccountLinkingRuntime['auth'] {
  // Lazy require avoids pulling RN Firebase config into Node unit tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../../../config/firebaseConfig') as {
    firebaseAuth: FirebaseJsAccountLinkingRuntime['auth'];
  };
  return mod.firebaseAuth;
}

function toSnapshot(user: Pick<User, 'uid' | 'providerData'>): LinkedAccountSnapshot {
  const providerIds = (user.providerData ?? [])
    .map((info) => info?.providerId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return { uid: user.uid, providerIds };
}

/**
 * Firebase JS SDK linking adapter. Only `linkWithCredential(currentUser, …)`:
 * fresh Google / Apple / Facebook (Limited Login OIDC) tokens become a
 * credential attached to the already signed-in Nearsy account.
 */
export function createFirebaseJsAccountLinkingAdapter(
  runtimeOverrides?: Partial<FirebaseJsAccountLinkingRuntime>,
): FirebaseAccountLinkingPort {
  const resolveAuth = () => runtimeOverrides?.auth ?? resolveDefaultAuth();
  const OAuth = runtimeOverrides?.OAuthProvider ?? OAuthProvider;
  const Google = runtimeOverrides?.GoogleAuthProvider ?? GoogleAuthProvider;
  const link =
    runtimeOverrides?.linkWithCredential ??
    (linkWithCredential as unknown as FirebaseJsAccountLinkingRuntime['linkWithCredential']);

  const buildCredential = (input: LinkCredentialInput): AuthCredential => {
    switch (input.provider) {
      case 'google':
        return Google.credential(input.idToken, input.accessToken ?? null);
      case 'apple':
        return new OAuth('apple.com').credential({
          idToken: input.idToken,
          rawNonce: input.rawNonce,
        });
      case 'facebook':
        return new OAuth('facebook.com').credential({
          idToken: input.idToken,
          rawNonce: input.rawNonce,
        });
    }
  };

  return {
    getCurrentAccount() {
      const user = resolveAuth().currentUser;
      return user ? toSnapshot(user) : null;
    },

    async linkProviderCredential(input: FirebaseProviderLinkInput) {
      const { provider } = input.credential;
      const user = resolveAuth().currentUser;
      if (!user) {
        throw new AccountLinkError('NOT_AUTHENTICATED', provider, 'NO_CURRENT_USER_AT_LINK');
      }
      if (user.uid !== input.expectedUid) {
        throw new AccountLinkError('IDENTITY_CHANGED', provider, 'UID_CHANGED_BEFORE_LINK');
      }
      const result = await link(user, buildCredential(input.credential));
      return toSnapshot(result.user);
    },

    async reloadCurrentAccount() {
      const user = resolveAuth().currentUser;
      if (!user) return null;
      try {
        await user.reload();
      } catch {
        // Keep the cached snapshot; providerData is already updated by link.
      }
      const fresh = resolveAuth().currentUser;
      return fresh ? toSnapshot(fresh) : null;
    },
  };
}
