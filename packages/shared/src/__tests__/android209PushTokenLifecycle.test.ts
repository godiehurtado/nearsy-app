/**
 * Android 2.0.9 push-token lifecycle wiring — all real auth paths.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/android209PushTokenLifecycle.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

function assertGuardBefore(src: string, signInCall: string, file: string) {
  const guard = src.indexOf('runWithOutgoingPushRelease');
  const signIn = src.indexOf(signInCall);
  assert.ok(guard >= 0, `${file}: missing runWithOutgoingPushRelease`);
  assert.ok(signIn >= 0, `${file}: missing ${signInCall}`);
  assert.ok(
    guard < signIn,
    `${file}: runWithOutgoingPushRelease must wrap ${signInCall}`,
  );
}

describe('Android push-token persistence stays this-device only', () => {
  it('never prompts and never wipes the pushTokens collection', () => {
    const push = readShared('services/pushTokens.android.ts');
    const lifecycle = readShared('services/pushTokenLifecycle.ts');
    assert.match(push, /getPermissionsAsync/);
    assert.doesNotMatch(push, /requestPermissionsAsync/);
    assert.doesNotMatch(lifecycle, /requestPermissionsAsync/);
    assert.doesNotMatch(push, /collection\('pushTokens'\)\.get\(/);
    assert.doesNotMatch(lifecycle, /deleteAll|collection\('pushTokens'\)\.get\(/);
    assert.match(
      push,
      /\.collection\('users'\)\s*\.doc\(uid\)\s*\.collection\('pushTokens'\)\s*\.doc\(token\)/,
    );
    assert.match(push, /assertCurrentUid\(uid\)/);
    assert.match(lifecycle, /stillSameUid\(input\.getUid, uid\) && input\.store\.writesAllowed/);
    const rules = readFileSync(
      join(here, '..', 'services/__tests__/rules/firestore.rules'),
      'utf8',
    );
    assert.match(
      rules,
      /match \/users\/\{userId\}\/pushTokens\/\{tokenId\} \{\s*allow read, write: if isOwner\(userId\);/,
    );
    assert.match(rules, /function isOwner\(userId\) \{\s*return isSignedIn\(\) && request\.auth\.uid == userId;/);
  });

  it('App and Alerts still register only through registerPushToken', () => {
    const app = readShared('App.tsx');
    const alerts = readShared('screens/AlertsScreen.tsx');
    assert.match(app, /await registerPushToken\(\)/);
    assert.match(alerts, /registerPushToken\(\)\.catch/);
    assert.doesNotMatch(app, /requestPermissionsAsync/);
    assert.doesNotMatch(alerts, /requestPermissionsAsync/);
  });
});

describe('Logout unregisters under the outgoing UID; Delete Account does not rewrite', () => {
  it('contractual logout unregisters after providers and before signOut', () => {
    const src = readShared('location/contractualLogout.ts');
    assert.match(src, /unregisterDevicePush\?: \(\) => void \| Promise<void>;/);
    const unregister = src.indexOf('await deps.unregisterDevicePush?.();');
    const signOut = src.indexOf('await deps.signOut();');
    assert.ok(unregister >= 0 && signOut > unregister);
  });

  it('More logout passes unregister only on Android', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(
      more,
      /unregisterDevicePush:\s*Platform\.OS === 'android'\s*\? \(\) => unregisterCurrentDevicePushToken\(\)\s*: undefined/,
    );
    assert.ok(
      more.indexOf('unregisterDevicePush') < more.indexOf('await firebaseAuth.signOut()'),
    );
  });

  it('Delete Account seals writes before the callable and never unregisters in cleanup', () => {
    const adapter = readShared('accountDeletion/deleteAccount.android.ts');
    assert.match(adapter, /await sealPushTokenWritesForAccountDeletion\(\);/);
    assert.ok(
      adapter.indexOf('sealPushTokenWritesForAccountDeletion') <
        adapter.indexOf('httpsCallable'),
    );
    assert.match(
      adapter,
      /await restorePushTokenWritesAfterAbortedDeletion\(uid\);/,
    );
    assert.doesNotMatch(adapter, /unregisterDevicePush|unregisterCurrentDevicePushToken/);
    const cleanup = adapter.slice(adapter.indexOf('async function cleanupAfterDeletion'));
    assert.doesNotMatch(cleanup, /registerPushToken|persistToken|collection\('pushTokens'\)/);
  });
});

describe('Direct account switch releases then restores A on failure', () => {
  it('the shared guard releases first and restores only if the outgoing UID remains', () => {
    const push = readShared('services/pushTokens.android.ts');
    assert.match(
      push,
      /release: releaseOutgoingDevicePushToken,\s*restore: registerPushToken,/,
    );
    const lifecycle = readShared('services/pushTokenLifecycle.ts');
    assert.match(lifecycle, /await input\.release\(\);/);
    assert.match(
      lifecycle,
      /if \(uid && input\.getUid\(\) === uid\) \{\s*await input\.restore\(\)/,
    );
  });

  it('email login and register wrap credential exchange in the guard', () => {
    const src = readShared('services/authService.android.ts');
    assertGuardBefore(
      src,
      'createUserWithEmailAndPassword(email, password)',
      'authService.android.ts',
    );
    const login = src.slice(src.indexOf('export const loginWithEmail'));
    assertGuardBefore(
      login,
      'signInWithEmailAndPassword(email, password)',
      'loginWithEmail',
    );
  });

  it('Google, Facebook and LinkedIn sign-in wrap credential exchange in the guard', () => {
    assertGuardBefore(
      readShared('services/firebaseGoogleAuth.android.ts'),
      'firebaseAuth.signInWithCredential(credential)',
      'firebaseGoogleAuth.android.ts',
    );
    assertGuardBefore(
      readShared('services/firebaseFacebookAuth.android.ts'),
      'firebaseAuth.signInWithCredential(credential)',
      'firebaseFacebookAuth.android.ts',
    );
    assertGuardBefore(
      readShared('authentication/linkedin/linkedinAuth.android.ts'),
      'firebaseAuth.signInWithCustomToken(customToken)',
      'linkedinAuth.android.ts',
    );
  });

  it('reauthentication and account linking never release the device token', () => {
    const facebook = readShared('services/firebaseFacebookAuth.android.ts');
    const reauth = facebook.slice(
      facebook.indexOf('export async function reauthenticateWithFacebookAccessToken'),
    );
    assert.doesNotMatch(reauth, /runWithOutgoingPushRelease|releaseOutgoingDevicePushToken/);
    assert.doesNotMatch(
      readShared('services/reauth.android.ts'),
      /runWithOutgoingPushRelease|releaseOutgoingDevicePushToken|unregisterCurrentDevicePushToken/,
    );
    assert.doesNotMatch(
      readShared('services/firebaseAccountLink.android.ts'),
      /runWithOutgoingPushRelease|releaseOutgoingDevicePushToken|unregisterCurrentDevicePushToken/,
    );
    const deleteAccount = readShared('accountDeletion/deleteAccount.android.ts');
    const googleReauth = deleteAccount.slice(
      deleteAccount.indexOf('async function reauthenticateWithGoogle'),
      deleteAccount.indexOf('async function cleanupAfterDeletion'),
    );
    assert.doesNotMatch(googleReauth, /runWithOutgoingPushRelease|releaseOutgoingDevicePushToken/);
    assert.match(googleReauth, /reauthenticateWithCredential/);
  });
});

describe('Android signOut paths that are not account-switch stay untouched', () => {
  it('OTP Android screen still has no Sign out', () => {
    const screen = readShared('screens/PhoneVerificationScreen.android.tsx');
    assert.doesNotMatch(screen, /runPhoneOtpScreenSignOut|unregisterCurrentDevicePushToken/);
  });

  it('Login email-verification signOut remains iOS-only', () => {
    const login = readShared('screens/LoginScreen.tsx');
    assert.match(
      login,
      /if \(Platform\.OS !== 'android' && !user\.emailVerified\) \{[\s\S]*?await firebaseAuth\.signOut\(\)/,
    );
  });
});
