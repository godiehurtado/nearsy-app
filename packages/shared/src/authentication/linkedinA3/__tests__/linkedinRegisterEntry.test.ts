/**
 * Register-entry LinkedIn: Welcome social row reuses the Login A3 hook.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { resolveAppleAuthNavigationTarget } from '../../social/application/appleSignInUiPolicy';
import { resetNavigationAfterLinkedInA3SignIn } from '../linkedinA3Navigation';
import { resolveNearsyFirebaseEnvironment } from '../environment/nearsyFirebaseEnvironment';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '../../..', relativeFromSharedSrc), 'utf8');
}

describe('LinkedIn register-entry wiring', () => {
  it('Welcome (register entry) enables LinkedIn via the Login A3 hook once', () => {
    const welcome = readSharedSource('screens/WelcomeScreen.tsx');
    const hook = readSharedSource('hooks/useLinkedInSignInFlow.ios.ts');
    const provider = welcome.slice(
      welcome.indexOf('function onProvider'),
      welcome.indexOf('const socialLabels'),
    );
    assert.match(welcome, /useLinkedInSignInFlow/);
    assert.match(provider, /p === 'linkedin'/);
    assert.match(provider, /signInWithLinkedIn\(\)/);
    assert.equal((provider.match(/signInWithLinkedIn\(\)/g) ?? []).length, 1);
    assert.doesNotMatch(provider, /signInWithLinkedInA3/);
    assert.doesNotMatch(welcome, /linkedinAuthStart|linkedinAuthExchange/);
    assert.match(hook, /if \(submitting\) return/);
    assert.match(hook, /signInWithLinkedInA3\(\)/);
    assert.match(hook, /resetNavigationAfterLinkedInA3SignIn/);
  });

  it('busy state includes LinkedIn and blocks double tap with Google/Apple', () => {
    const welcome = readSharedSource('screens/WelcomeScreen.tsx');
    const row = readSharedSource('components/AuthSocialButtonRow.tsx');
    assert.match(
      welcome,
      /googleSubmitting \|\| appleSubmitting \|\| linkedInSubmitting/,
    );
    assert.match(welcome, /linkedInSubmitting/);
    assert.match(welcome, /\? 'linkedin'/);
    assert.match(row, /disabled=\{busy\}/);
    assert.match(welcome, /useGoogleSignInFlow/);
    assert.match(welcome, /useAppleSignInFlow/);
  });

  it('cancel/dismiss does not alert and releases submitting in finally', () => {
    const hook = readSharedSource('hooks/useLinkedInSignInFlow.ios.ts');
    const cancelBlock = hook.slice(
      hook.indexOf("result.status === 'cancelled'"),
      hook.indexOf("result.status === 'expired'"),
    );
    assert.match(cancelBlock, /cancelled/);
    assert.match(cancelBlock, /dismissed/);
    assert.doesNotMatch(cancelBlock, /Alert\.alert/);
    assert.match(hook, /finally \{\s*\n\s*setSubmitting\(false\)/);
  });

  it('complete profile routes to MainTabs; incomplete to ProfileCompletion', () => {
    const calls: Array<{ index: number; routes: Array<{ name: string }> }> = [];
    const navigation = {
      reset: (state: {
        index: number;
        routes: Array<{ name: string; params?: Record<string, unknown> }>;
      }) => {
        calls.push(state);
      },
    };
    resetNavigationAfterLinkedInA3SignIn(navigation, {
      profileRoute: 'MainTabs',
      session: { uid: 'u1', email: 'a@b.c' },
      email: 'a@b.c',
    });
    resetNavigationAfterLinkedInA3SignIn(navigation, {
      profileRoute: 'CompleteProfile',
      session: { uid: 'u2', email: 'n@b.c' },
      email: 'n@b.c',
    });
    assert.equal(resolveAppleAuthNavigationTarget('MainTabs'), 'MainTabs');
    assert.equal(
      resolveAppleAuthNavigationTarget('CompleteProfile'),
      'ProfileCompletion',
    );
    assert.equal(calls[0]?.routes[0]?.name, 'MainTabs');
    assert.equal(calls[1]?.routes[0]?.name, 'ProfileCompletion');
  });

  it('Production environment does not enable LinkedIn A3', () => {
    const resolved = resolveNearsyFirebaseEnvironment('production');
    assert.equal(resolved.environment, 'production');
    assert.equal(resolved.linkedInAuthEnabled, false);
    const hook = readSharedSource('hooks/useLinkedInSignInFlow.ios.ts');
    assert.match(hook, /isLinkedInA3SignInEnabledForRuntime\(\)/);
    assert.match(
      hook,
      /if \(!isLinkedInA3SignInEnabledForRuntime\(\)\) \{/,
    );
  });

  it('email RegisterScreen stays the wizard; Google/Apple on Welcome stay intact', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    const welcome = readSharedSource('screens/WelcomeScreen.tsx');
    assert.match(register, /EMAIL_REGISTER_STEPS/);
    assert.doesNotMatch(register, /useLinkedInSignInFlow/);
    assert.doesNotMatch(register, /AuthSocialButtonRow/);
    assert.match(welcome, /useGoogleSignInFlow/);
    assert.match(welcome, /useAppleSignInFlow/);
    assert.match(welcome, /p === 'google'/);
    assert.match(welcome, /p === 'apple'/);
  });
});
