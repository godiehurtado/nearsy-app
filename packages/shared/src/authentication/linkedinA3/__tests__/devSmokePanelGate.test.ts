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

  it('requires __DEV__, ios, development, and LinkedIn enabled together', () => {
    assert.equal(shouldShowLinkedInA3DevSmokePanel(allTrue), true);
  });

  it('hides when not __DEV__', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({ ...allTrue, isDev: false }),
      false,
    );
  });

  it('hides on android', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({ ...allTrue, platform: 'android' }),
      false,
    );
  });

  it('hides for production Firebase environment (Preview/Production)', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        ...allTrue,
        firebaseEnvironment: 'production',
      }),
      false,
    );
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        ...allTrue,
        firebaseEnvironment: '',
      }),
      false,
    );
  });

  it('hides when LinkedIn is disabled', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        ...allTrue,
        linkedInAuthEnabled: 'false',
      }),
      false,
    );
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        ...allTrue,
        linkedInAuthEnabled: false,
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

  it('Production/Preview maps to nearsy-pj + non-debug + LinkedIn disabled', () => {
    const env = resolveNearsyFirebaseEnvironment('production');
    assert.equal(env.firebaseProjectId, 'nearsy-pj');
    assert.equal(env.appCheckProvider, 'production_pending');
    assert.notEqual(env.appCheckProvider, 'debug');
    assert.equal(env.linkedInAuthEnabled, false);
  });
});
