import {
  linkWithCredential,
  OAuthProvider,
  type AuthCredential,
  type User,
  type UserCredential,
} from 'firebase/auth';

import { FacebookLinkError } from '../../domain/facebookLinkError';
import type {
  FirebaseAccountLinkingPort,
  FirebaseFacebookOidcLinkInput,
  LinkedAccountSnapshot,
} from './firebaseAccountLinkingPort';

type LinkableUser = Pick<User, 'uid' | 'providerData' | 'reload'>;

export interface FirebaseJsAccountLinkingRuntime {
  OAuthProvider: new (providerId: string) => {
    credential(params: { idToken: string; rawNonce: string }): AuthCredential;
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
 * the Facebook Limited Login OIDC token + raw nonce become an `OAuthProvider`
 * credential attached to the already signed-in Nearsy account.
 */
export function createFirebaseJsAccountLinkingAdapter(
  runtimeOverrides?: Partial<FirebaseJsAccountLinkingRuntime>,
): FirebaseAccountLinkingPort {
  const resolveAuth = () => runtimeOverrides?.auth ?? resolveDefaultAuth();
  const FacebookOAuth = runtimeOverrides?.OAuthProvider ?? OAuthProvider;
  const link =
    runtimeOverrides?.linkWithCredential ??
    (linkWithCredential as unknown as FirebaseJsAccountLinkingRuntime['linkWithCredential']);

  return {
    getCurrentAccount() {
      const user = resolveAuth().currentUser;
      return user ? toSnapshot(user) : null;
    },

    async linkFacebookOidcCredential(input: FirebaseFacebookOidcLinkInput) {
      const user = resolveAuth().currentUser;
      if (!user) {
        throw new FacebookLinkError('NOT_AUTHENTICATED', 'NO_CURRENT_USER_AT_LINK');
      }
      if (user.uid !== input.expectedUid) {
        throw new FacebookLinkError('IDENTITY_CHANGED', 'UID_CHANGED_BEFORE_LINK');
      }
      const credential = new FacebookOAuth('facebook.com').credential({
        idToken: input.idToken,
        rawNonce: input.rawNonce,
      });
      const result = await link(user, credential);
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
