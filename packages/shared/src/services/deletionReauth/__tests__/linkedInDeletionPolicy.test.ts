import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  LINKEDIN_DELETION_SIGN_IN_AGAIN_KEY,
  isLinkedInDeterministicUid,
  resolveDeletionReauthMethod,
  resolveDeletionReauthMethods,
} from '../index';

const sharedSrc = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(sharedSrc, rel), 'utf8');

describe('LinkedIn deletion policy — recent session or sign in again', () => {
  it('recognizes only the deterministic LinkedIn UID', () => {
    assert.equal(isLinkedInDeterministicUid('li_abc'), true);
    assert.equal(isLinkedInDeterministicUid('li_'), false);
    assert.equal(isLinkedInDeterministicUid('uid-li_abc'), false);
    assert.equal(isLinkedInDeterministicUid(null), false);
    assert.equal(LINKEDIN_DELETION_SIGN_IN_AGAIN_KEY, 'settings.deleteAccount.linkedInSignInAgain');
  });

  it('LinkedIn-only account has no inline method and is asked to sign in again', () => {
    assert.deepEqual(resolveDeletionReauthMethods([]), []);
    assert.deepEqual(resolveDeletionReauthMethod([], { uid: 'li_abc' }), {
      kind: 'unavailable',
      reason: 'linkedin_sign_in_again',
    });
  });

  it('LinkedIn + other providers offers only the credential-based providers', () => {
    const providerData = [
      { providerId: 'facebook.com', uid: 'fb1' },
      { providerId: 'google.com', uid: 'g1' },
      { providerId: 'password', uid: 'p1', email: 'a@b.com' },
      { providerId: 'apple.com', uid: 'a1' },
    ];
    const methods = resolveDeletionReauthMethods(providerData);
    assert.deepEqual(
      methods.map((m) => m.kind),
      ['password', 'google', 'apple', 'facebook'],
    );
    assert.equal(resolveDeletionReauthMethod(providerData, { uid: 'li_abc' }).kind, 'password');
    assert.ok(methods.every((m) => (m.kind as string) !== 'linkedin'));
  });

  it('never derives LinkedIn from the email or a non-LinkedIn UID', () => {
    assert.deepEqual(
      resolveDeletionReauthMethod([{ providerId: 'linkedin.com', email: 'x@linkedin.com' }], {
        uid: 'uid-1',
      }),
      { kind: 'unavailable', reason: 'no_supported_provider' },
    );
    assert.deepEqual(resolveDeletionReauthMethod([], { uid: 'uid-1' }), {
      kind: 'unavailable',
      reason: 'custom_token_only',
    });
  });
});

describe('Normal LinkedIn login stays intact', () => {
  it('login still signs in with the A3 custom token after the browser flow', () => {
    const login = read('authentication/linkedinA3/authenticateWithLinkedIn.ts');
    assert.match(login, /import \{ signInWithCustomToken \} from 'firebase\/auth';/);
    assert.match(login, /await signInWithCustomToken\(firebaseAuth, customToken\)/);
    assert.match(login, /runLinkedInA3BrowserAuthFlow\(\{/);
    assert.match(login, /durableStore: getSharedLinkedInA3DurableStore\(\)/);
  });
});
