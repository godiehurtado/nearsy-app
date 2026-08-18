import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveAppleAuthNavigationTarget,
  shouldSuppressAppleSignInAlert,
} from '../application/appleSignInUiPolicy';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(
    join(here, '..', '..', '..', relativeFromSharedSrc),
    'utf8',
  );
}

describe('Apple sign-in UI / hook policy', () => {
  it('maps orchestrator routes to AppNavigator screens', () => {
    assert.equal(resolveAppleAuthNavigationTarget('MainTabs'), 'MainTabs');
    assert.equal(
      resolveAppleAuthNavigationTarget('CompleteProfile'),
      'ProfileCompletion',
    );
  });

  it('suppresses alerts for cancel and in-progress', () => {
    assert.equal(shouldSuppressAppleSignInAlert('CANCELLED'), true);
    assert.equal(shouldSuppressAppleSignInAlert('IN_PROGRESS'), true);
    assert.equal(shouldSuppressAppleSignInAlert('ACCOUNT_CONFLICT'), false);
    assert.equal(shouldSuppressAppleSignInAlert('TOKEN_INVALID'), false);
  });

  it('LoginScreen wires Apple flow and keeps Meta/LinkedIn coming soon', () => {
    const source = readSharedSource('screens/LoginScreen.tsx');
    assert.match(source, /useAppleSignInFlow/);
    assert.match(source, /signInWithApple/);
    assert.match(source, /useGoogleSignInFlow/);
    assert.match(source, /signInWithGoogle/);
    assert.match(source, /provider === 'apple'/);
    assert.match(source, /provider === 'google'/);
    assert.match(source, /comingSoonTitle/);
    assert.doesNotMatch(source, /appleComingSoon/);
  });

  it('WelcomeScreen wires Apple flow alongside Google', () => {
    const source = readSharedSource('screens/WelcomeScreen.tsx');
    assert.match(source, /useAppleSignInFlow/);
    assert.match(source, /signInWithApple/);
    assert.match(source, /p === 'apple'/);
    assert.match(source, /p === 'google'/);
    assert.match(source, /comingSoonTitle/);
  });

  it('loading state includes appleSubmitting to prevent double tap', () => {
    const login = readSharedSource('screens/LoginScreen.tsx');
    const welcome = readSharedSource('screens/WelcomeScreen.tsx');
    assert.match(login, /googleSubmitting \|\| appleSubmitting|appleSubmitting/);
    assert.match(
      login,
      /submitting \|\| googleSubmitting \|\| appleSubmitting \|\| linkedInSubmitting/,
    );
    assert.match(welcome, /socialBusy = googleSubmitting \|\| appleSubmitting/);
    assert.match(login, /appleSubmitting\s+\? 'apple'/);
    assert.match(welcome, /appleSubmitting \? 'apple'/);
  });
});
