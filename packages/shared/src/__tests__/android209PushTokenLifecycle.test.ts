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

function assertReleaseBefore(src: string, signInCall: string, file: string) {
  const release = src.indexOf('await releaseOutgoingDevicePushToken()');
  const signIn = src.indexOf(signInCall);
  assert.ok(release >= 0, `${file}: missing releaseOutgoingDevicePushToken`);
  assert.ok(signIn >= 0, `${file}: missing ${signInCall}`);
  assert.ok(
    release < signIn,
    `${file}: releaseOutgoingDevicePushToken must run before ${signInCall}`,
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

describe('Logout and deletion unregister under the outgoing UID', () => {
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

  it('Delete Account cleanup unregisters this device before signOut', () => {
    const adapter = readShared('accountDeletion/deleteAccount.android.ts');
    assert.match(
      adapter,
      /unregisterDevicePush: \(\) => unregisterCurrentDevicePushToken\(\),/,
    );
    assert.ok(
      adapter.indexOf('unregisterDevicePush') <
        adapter.indexOf('await firebaseAuth.signOut()'),
    );
  });
});

describe('Direct account switch releases the outgoing token first', () => {
  it('email login and register release before replacing the session', () => {
    const src = readShared('services/authService.android.ts');
    assertReleaseBefore(
      src,
      ').createUserWithEmailAndPassword(email, password)',
      'authService.android.ts',
    );
    const login = src.slice(src.indexOf('export const loginWithEmail'));
    assertReleaseBefore(
      login,
      ').signInWithEmailAndPassword(email, password)',
      'loginWithEmail',
    );
  });

  it('Google, Facebook and LinkedIn sign-in release before credential exchange', () => {
    assertReleaseBefore(
      readShared('services/firebaseGoogleAuth.android.ts'),
      'firebaseAuth.signInWithCredential(credential)',
      'firebaseGoogleAuth.android.ts',
    );
    assertReleaseBefore(
      readShared('services/firebaseFacebookAuth.android.ts'),
      'firebaseAuth.signInWithCredential(credential)',
      'firebaseFacebookAuth.android.ts',
    );
    assertReleaseBefore(
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
    assert.doesNotMatch(reauth, /releaseOutgoingDevicePushToken/);
    assert.doesNotMatch(
      readShared('services/reauth.android.ts'),
      /releaseOutgoingDevicePushToken|unregisterCurrentDevicePushToken/,
    );
    assert.doesNotMatch(
      readShared('services/firebaseAccountLink.android.ts'),
      /releaseOutgoingDevicePushToken|unregisterCurrentDevicePushToken/,
    );
    const deleteAccount = readShared('accountDeletion/deleteAccount.android.ts');
    const googleReauth = deleteAccount.slice(
      deleteAccount.indexOf('async function reauthenticateWithGoogle'),
      deleteAccount.indexOf('async function cleanupAfterDeletion'),
    );
    assert.doesNotMatch(googleReauth, /releaseOutgoingDevicePushToken/);
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
