/**
 * BUG-VIS-01 — provisional Active while validating after CRJ / stale false→true.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveVisibilityPresentation,
  shouldRearmVisibilityHydration,
} from '../visibilityPresentation';

const sharedSrc = join(__dirname, '../..');

function readShared(rel: string): string {
  return readFileSync(join(sharedSrc, rel), 'utf8');
}

describe('BUG-VIS-01 shouldRearmVisibilityHydration', () => {
  it('rearms when entering ON from false (stale snapshot)', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: true,
        previouslyPersistedOn: false,
        hydrationValidationDone: true,
        recoveryInFlight: false,
      }),
      true,
    );
  });

  it('rearms on first ON while hydration still open', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: true,
        previouslyPersistedOn: true,
        hydrationValidationDone: false,
        recoveryInFlight: false,
      }),
      true,
    );
  });

  it('does not re-lock stable ON after hydration done', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: true,
        previouslyPersistedOn: true,
        hydrationValidationDone: true,
        recoveryInFlight: false,
      }),
      false,
    );
  });

  it('skips rearm during recovery journey', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: true,
        previouslyPersistedOn: false,
        hydrationValidationDone: true,
        recoveryInFlight: true,
      }),
      false,
    );
  });

  it('never rearms when persisted OFF', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: false,
        previouslyPersistedOn: true,
        hydrationValidationDone: false,
        recoveryInFlight: false,
      }),
      false,
    );
  });
});

describe('BUG-VIS-01 presentation matrix', () => {
  it('true pending → visual Active, runtime false', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: null,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, false);
  });

  it('true validated → visual Active, runtime true', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, true);
  });

  it('true with conclusive failure → Inactive', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: false,
    });
    assert.equal(ui.visualActive, false);
    assert.equal(ui.canStartRuntime, false);
  });

  it('stable false → Inactive', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
    });
    assert.equal(ui.visualActive, false);
  });

  it('false→true rearm yields Active provisional (no Inactive paint)', () => {
    // After shouldRearm: pending true + validated null with persisted true
    const afterRearm = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: null,
    });
    assert.equal(afterRearm.visualActive, true);
    assert.equal(afterRearm.canStartRuntime, false);
  });
});

describe('BUG-VIS-01 Home wiring', () => {
  it('Home rearms on enter-ON and kicks focus validation', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /shouldRearmVisibilityHydration/);
    assert.match(home, /visibilityHydrationKick/);
    assert.match(home, /setVisibilityValidationPending\(true\)/);
    assert.match(home, /setValidatedEffectiveVisibility\(null\)/);
    assert.match(home, /\[loading, visibilityHydrationKick\]/);
  });

  it('Home recovery still skips preparation modal', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const restore = home.slice(
      home.indexOf('runPostGrantRestore'),
      home.indexOf("decision.action === 'preserve-intent-then-deactivate'"),
    );
    assert.doesNotMatch(restore, /setLocationPreparing\(true\)/);
  });
});
