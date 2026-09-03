/**
 * Development smoke panel gate tests (I1-M).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldShowLinkedInA3DevSmokePanel } from '../smoke/devSmokePanelGate';
import { resolveNearsyFirebaseEnvironment } from '../environment/nearsyFirebaseEnvironment';

describe('shouldShowLinkedInA3DevSmokePanel', () => {
  const allTrue = {
    isDev: true,
    platform: 'ios',
    firebaseEnvironment: 'development',
    linkedInAuthEnabled: 'true',
  };

  it('requires __DEV__, ios, development, LinkedIn enabled, and explicit smoke enable', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        ...{
          isDev: true,
          platform: 'ios',
          firebaseEnvironment: 'development',
          linkedInAuthEnabled: 'true',
          smokePanelExplicitlyEnabled: 'true',
        },
      }),
      true,
    );
  });

  it('hides when not __DEV__', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        isDev: false,
        platform: 'ios',
        firebaseEnvironment: 'development',
        linkedInAuthEnabled: 'true',
        smokePanelExplicitlyEnabled: 'true',
      }),
      false,
    );
  });

  it('hides on android', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        isDev: true,
        platform: 'android',
        firebaseEnvironment: 'development',
        linkedInAuthEnabled: 'true',
        smokePanelExplicitlyEnabled: 'true',
      }),
      false,
    );
  });

  it('hides for production Firebase environment (Preview/Production)', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        isDev: true,
        platform: 'ios',
        firebaseEnvironment: 'production',
        linkedInAuthEnabled: 'true',
        smokePanelExplicitlyEnabled: 'true',
      }),
      false,
    );
  });

  it('hides when LinkedIn is disabled', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        isDev: true,
        platform: 'ios',
        firebaseEnvironment: 'development',
        linkedInAuthEnabled: 'false',
        smokePanelExplicitlyEnabled: 'true',
      }),
      false,
    );
  });

  it('hides by default when smoke flag absent', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        isDev: true,
        platform: 'ios',
        firebaseEnvironment: 'development',
        linkedInAuthEnabled: 'true',
      }),
      false,
    );
  });
});

describe('environment gates Development vs Production', () => {
  it('Development maps to nearsy-dev + debug + LinkedIn enabled', () => {
    const env = resolveNearsyFirebaseEnvironment('development');
    assert.equal(env.firebaseProjectId, 'nearsy-dev');
    assert.equal(env.appCheckProvider, 'debug');
    assert.equal(env.linkedInAuthEnabled, true);
  });

  it('Production/Preview maps to nearsy-pj + non-debug + LinkedIn enabled', () => {
    const env = resolveNearsyFirebaseEnvironment('production');
    assert.equal(env.firebaseProjectId, 'nearsy-pj');
    assert.equal(env.appCheckProvider, 'production');
    assert.notEqual(env.appCheckProvider, 'debug');
    assert.equal(env.linkedInAuthEnabled, true);
  });
});
