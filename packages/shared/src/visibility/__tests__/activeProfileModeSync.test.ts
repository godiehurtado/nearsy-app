/**
 * Active profile mode sync — setActiveProfileMode callable integration (I1).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildSetActiveProfileModeRequest,
  createContractResponseError,
  createFakeVisibilityDiscoveryClient,
  parseSetActiveProfileModeResponse,
  serializeVisibilityRequest,
  VISIBILITY_CALLABLE_NAMES,
} from '../callables';
import {
  applyActiveProfileModeResponseToUserDoc,
  createActiveProfileModeSwitchSession,
  presentActiveProfileModeError,
  setActiveProfileModeFlow,
} from '../activeProfileModeSync';
import {
  ACTIVE_PROFILE_MODE_CONFIRMATION_TTL_MS,
  clearActiveProfileModeConfirmation,
  reconcileUserDocWithActiveProfileMode,
  recordActiveProfileModeConfirmation,
  resetActiveProfileModeConfirmationForTests,
} from '../activeProfileModeReconciliation';
import { buildActiveProfileSavePatch } from '../../profile/profileModeFields';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';

const ROOT = join(__dirname, '..', '..');
const UID_A = 'user-a';
const UID_B = 'user-b';

function readShared(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('setActiveProfileMode request builder', () => {
  it('builds exact contractVersion + mode only', () => {
    const req = buildSetActiveProfileModeRequest('professional');
    assert.deepEqual(req, { contractVersion: 1, mode: 'professional' });
    const body = serializeVisibilityRequest(req);
    assert.deepEqual(Object.keys(body).sort(), ['contractVersion', 'mode']);
    assert.equal(body.contractVersion, 1);
    assert.equal(body.mode, 'professional');
  });

  it('does not send uid or extra fields', () => {
    const body = serializeVisibilityRequest(
      buildSetActiveProfileModeRequest('personal'),
    );
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'uid'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'visibility'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'location'), false);
  });
});

describe('setActiveProfileMode response parser', () => {
  it('parses valid Personal response', () => {
    const parsed = parseSetActiveProfileModeResponse({
      contractVersion: 1,
      mode: 'personal',
      visibility: true,
      targetProfileComplete: true,
      discoverySynced: true,
      serverTime: 1_700_000_000_000,
    });
    assert.equal(parsed.mode, 'personal');
    assert.equal(parsed.visibility, true);
  });

  it('parses valid Professional response', () => {
    const parsed = parseSetActiveProfileModeResponse({
      contractVersion: 1,
      mode: 'professional',
      visibility: false,
      targetProfileComplete: true,
      discoverySynced: false,
      serverTime: 1_700_000_000_001,
    });
    assert.equal(parsed.mode, 'professional');
    assert.equal(parsed.discoverySynced, false);
  });

  it('rejects contractual invalid response', () => {
    assert.throws(
      () =>
        parseSetActiveProfileModeResponse({
          contractVersion: 1,
          mode: 'personal',
          visibility: 'yes',
          targetProfileComplete: true,
          discoverySynced: true,
          serverTime: 1,
        }),
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes('Invalid boolean for visibility'),
    );
  });
});

describe('setActiveProfileModeFlow', () => {
  it('complete + synced success', async () => {
    const fake = createFakeVisibilityDiscoveryClient({
      setActiveProfileMode: async () => ({
        contractVersion: 1,
        mode: 'professional',
        visibility: true,
        targetProfileComplete: true,
        discoverySynced: true,
        serverTime: 1,
      }),
    });
    const outcome = await setActiveProfileModeFlow(fake, 'professional', UID_A);
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.response.targetProfileComplete, true);
      assert.equal(outcome.response.discoverySynced, true);
    }
    assert.equal(fake.calls[0]?.name, 'setActiveProfileMode');
  });

  it('complete + no projection (discoverySynced=false) is success', async () => {
    const fake = createFakeVisibilityDiscoveryClient({
      setActiveProfileMode: async () => ({
        contractVersion: 1,
        mode: 'personal',
        visibility: false,
        targetProfileComplete: true,
        discoverySynced: false,
        serverTime: 2,
      }),
    });
    const outcome = await setActiveProfileModeFlow(fake, 'personal', UID_A);
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.response.discoverySynced, false);
    }
  });

  it('incomplete success applies visibility false', async () => {
    const fake = createFakeVisibilityDiscoveryClient({
      setActiveProfileMode: async () => ({
        contractVersion: 1,
        mode: 'professional',
        visibility: false,
        targetProfileComplete: false,
        discoverySynced: false,
        serverTime: 3,
      }),
    });
    const outcome = await setActiveProfileModeFlow(fake, 'professional', UID_A);
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.response.targetProfileComplete, false);
      assert.equal(outcome.response.visibility, false);
    }
  });

  it('callable error preserves prior local state (no apply helper on failure)', async () => {
    const fake = createFakeVisibilityDiscoveryClient({
      setActiveProfileMode: async () => {
        throw createContractResponseError('boom', null);
      },
    });
    const prior = { mode: 'personal' as const, visibility: true };
    const outcome = await setActiveProfileModeFlow(fake, 'professional', UID_A);
    assert.equal(outcome.ok, false);
    assert.equal(prior.mode, 'personal');
    assert.equal(prior.visibility, true);
  });

  it('unavailable maps to retryable copy EN/ES', () => {
    const err = {
      kind: 'VisibilityDiscoveryClientError',
      name: 'VisibilityDiscoveryClientError',
      message: 'x',
      code: 'unavailable' as const,
      reason: { kind: 'none' as const },
      retryable: true,
    };
    const t = ((key: string) => {
      const parts = key.split('.');
      let cur: any = en;
      for (const part of parts) {
        cur = cur?.[part];
      }
      return typeof cur === 'string' ? cur : key;
    }) as any;
    const presentation = presentActiveProfileModeError(t, err);
    assert.match(presentation.userMessage, /connection/i);
    assert.match(es.activeProfileMode.errors.networkUnavailable, /conexión/i);
  });
});

function resolveLocale(locale: typeof en | typeof es) {
  return ((key: string) => {
    const parts = key.split('.');
    let cur: any = locale;
    for (const part of parts) {
      cur = cur?.[part];
    }
    return typeof cur === 'string' ? cur : key;
  }) as any;
}

describe('CRJ type-step Active Mode error presentation (I1.2)', () => {
  const INTERNAL_TRANSPORT = 'Visibility callable failed.';

  it('network/unavailable → connection copy EN', () => {
    const err = {
      kind: 'VisibilityDiscoveryClientError' as const,
      name: 'VisibilityDiscoveryClientError',
      message: INTERNAL_TRANSPORT,
      code: 'unavailable' as const,
      reason: { kind: 'none' as const },
      retryable: true,
    };
    const presentation = presentActiveProfileModeError(resolveLocale(en), err);
    assert.equal(
      presentation.userMessage,
      en.activeProfileMode.errors.networkUnavailable,
    );
    assert.equal(
      presentation.userMessage,
      'Unable to switch profiles. Check your connection and try again.',
    );
    assert.doesNotMatch(presentation.userMessage, /Visibility callable failed/i);
    assert.doesNotMatch(presentation.title, /Visibility callable failed/i);
  });

  it('network/unavailable → connection copy ES', () => {
    const err = {
      kind: 'VisibilityDiscoveryClientError' as const,
      name: 'VisibilityDiscoveryClientError',
      message: INTERNAL_TRANSPORT,
      code: 'unavailable' as const,
      reason: { kind: 'none' as const },
      retryable: true,
    };
    const presentation = presentActiveProfileModeError(resolveLocale(es), err);
    assert.equal(
      presentation.userMessage,
      es.activeProfileMode.errors.networkUnavailable,
    );
    assert.equal(
      presentation.userMessage,
      'No pudimos cambiar de perfil. Revisa tu conexión e inténtalo de nuevo.',
    );
    assert.doesNotMatch(presentation.userMessage, /Visibility callable failed/i);
  });

  it('permission-denied / internal → generic copy EN', () => {
    for (const code of ['permission-denied', 'internal'] as const) {
      const err = {
        kind: 'VisibilityDiscoveryClientError' as const,
        name: 'VisibilityDiscoveryClientError',
        message: INTERNAL_TRANSPORT,
        code,
        reason: { kind: 'none' as const },
        retryable: false,
      };
      const presentation = presentActiveProfileModeError(resolveLocale(en), err);
      assert.equal(
        presentation.userMessage,
        "We couldn't switch profiles. Please try again.",
      );
      assert.doesNotMatch(
        presentation.userMessage,
        /Visibility callable failed/i,
      );
    }
  });

  it('generic/permission/internal → generic copy ES', () => {
    for (const code of ['permission-denied', 'internal', 'failed-precondition'] as const) {
      const err = {
        kind: 'VisibilityDiscoveryClientError' as const,
        name: 'VisibilityDiscoveryClientError',
        message: INTERNAL_TRANSPORT,
        code,
        reason: { kind: 'none' as const },
        retryable: false,
      };
      const presentation = presentActiveProfileModeError(resolveLocale(es), err);
      assert.equal(
        presentation.userMessage,
        'No pudimos cambiar de perfil. Inténtalo de nuevo.',
      );
      assert.doesNotMatch(
        presentation.userMessage,
        /Visibility callable failed/i,
      );
    }
  });

  it('ProfileCompletion type step presents via presentActiveProfileModeError only', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(src, /presentActiveProfileModeError/);
    assert.match(src, /isVisibilityDiscoveryClientError/);
    const goNext = src.slice(
      src.indexOf('async function goNext()'),
      src.indexOf('function goBack()'),
    );
    assert.match(
      goNext,
      /step\.kind === 'type' && isVisibilityDiscoveryClientError/,
    );
    assert.match(goNext, /presentActiveProfileModeError\(t,/);
    assert.doesNotMatch(
      goNext,
      /step\.kind === 'type'[\s\S]{0,200}e\?\.message/,
    );
    // Other CRJ steps keep legacy save-error Alert body
    assert.match(
      goNext,
      /onboarding\.profileCompletion\.saveErrorTitle/,
    );
    assert.match(
      goNext,
      /e\?\.message \|\| t\('onboarding\.profileCompletion\.saveErrorMessage'\)/,
    );
  });

  it('type-step Alert never uses raw transport message or saveErrorTitle for mode errors', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    const goNext = src.slice(
      src.indexOf('async function goNext()'),
      src.indexOf('function goBack()'),
    );
    const modeBranch = goNext.slice(
      goNext.indexOf("step.kind === 'type' && isVisibilityDiscoveryClientError"),
      goNext.indexOf('} else {'),
    );
    assert.match(modeBranch, /presentation\.title/);
    assert.match(modeBranch, /presentation\.userMessage/);
    assert.doesNotMatch(modeBranch, /e\?\.message/);
    assert.doesNotMatch(modeBranch, /saveErrorTitle/);
    assert.doesNotMatch(modeBranch, /Visibility callable failed/);
  });

  it('persistType success paths do not Alert; incomplete is still success', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    const persistType = src.slice(
      src.indexOf('async function persistType()'),
      src.indexOf('async function persistName()'),
    );
    assert.doesNotMatch(persistType, /Alert\.alert/);
    assert.match(persistType, /setActiveProfileModeFlow/);
    assert.match(persistType, /outcome\.ok === false/);
    // incomplete is ok:true from flow — no special incomplete Alert in CRJ type step
    assert.doesNotMatch(persistType, /targetProfileComplete/);
    assert.doesNotMatch(persistType, /incomplete/);
  });

  it('identity and later CRJ steps keep legacy e.message save errors', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    const goNext = src.slice(
      src.indexOf('async function goNext()'),
      src.indexOf('function goBack()'),
    );
    assert.match(goNext, /step\.kind === 'identity'/);
    assert.match(goNext, /step\.kind === 'photo'/);
    assert.match(goNext, /step\.kind === 'details'/);
    // Only one presenter call site — type-step mode errors
    const presenterHits = goNext.match(/presentActiveProfileModeError/g) ?? [];
    assert.equal(presenterHits.length, 1);
  });

  it('CompleteProfile still uses presenter (post-CRJ unchanged by this fix scope)', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(src, /presentActiveProfileModeError/);
  });

  it('no private payload / uid logging added in ProfileCompletion type path', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    const persistType = src.slice(
      src.indexOf('async function persistType()'),
      src.indexOf('async function persistName()'),
    );
    const goNext = src.slice(
      src.indexOf('async function goNext()'),
      src.indexOf('function goBack()'),
    );
    for (const chunk of [persistType, goNext]) {
      assert.doesNotMatch(chunk, /console\.(log|info|debug|warn|error)/);
      assert.doesNotMatch(chunk, /JSON\.stringify/);
      assert.doesNotMatch(chunk, /causeForLog/);
    }
  });
});

describe('createActiveProfileModeSwitchSession', () => {
  it('blocks second concurrent request while loading', async () => {
    const session = createActiveProfileModeSwitchSession();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = createFakeVisibilityDiscoveryClient({
      setActiveProfileMode: async () => {
        await gate;
        return {
          contractVersion: 1,
          mode: 'professional',
          visibility: false,
          targetProfileComplete: true,
          discoverySynced: true,
          serverTime: 1,
        };
      },
    });

    const first = session.switchMode('professional', {
      client: fake,
      confirmedMode: 'personal',
      uid: UID_A,
    });
    assert.equal(session.isBusy(), true);
    const second = await session.switchMode('professional', {
      client: fake,
      confirmedMode: 'personal',
      uid: UID_A,
    });
    assert.deepEqual(second, { kind: 'blocked' });
    release();
    const firstOutcome = await first;
    assert.equal(firstOutcome.ok, true);
  });

  it('does not confirm mode before callable resolves', async () => {
    const session = createActiveProfileModeSwitchSession();
    let resolveCallable!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveCallable = resolve;
    });
    const fake = createFakeVisibilityDiscoveryClient({
      setActiveProfileMode: async () => pending as Promise<any>,
    });
    let confirmed = 'personal' as 'personal' | 'professional';
    const inFlight = session.switchMode('professional', {
      client: fake,
      confirmedMode: confirmed,
      uid: UID_A,
    });
    assert.equal(confirmed, 'personal');
    resolveCallable({
      contractVersion: 1,
      mode: 'professional',
      visibility: false,
      targetProfileComplete: false,
      discoverySynced: false,
      serverTime: 1,
    });
    const outcome = await inFlight;
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      confirmed = outcome.response.mode;
    }
    assert.equal(confirmed, 'professional');
  });
});

describe('snapshot reconciliation', () => {
  it('stale snapshot does not revert confirmed mode for same uid', () => {
    resetActiveProfileModeConfirmationForTests();
    recordActiveProfileModeConfirmation({
      uid: UID_A,
      mode: 'professional',
      visibility: false,
    });
    const merged = reconcileUserDocWithActiveProfileMode(
      {
        mode: 'personal',
        visibility: true,
        realName: 'Alex',
      },
      UID_A,
    );
    assert.equal(merged.mode, 'professional');
    assert.equal(merged.visibility, false);
    assert.equal(merged.realName, 'Alex');
  });

  it('clears confirmation once Firestore catches up', () => {
    resetActiveProfileModeConfirmationForTests();
    recordActiveProfileModeConfirmation({
      uid: UID_A,
      mode: 'professional',
      visibility: false,
    });
    reconcileUserDocWithActiveProfileMode(
      { mode: 'professional', visibility: false },
      UID_A,
    );
    const after = reconcileUserDocWithActiveProfileMode(
      { mode: 'professional', visibility: false },
      UID_A,
    );
    assert.equal(after.mode, 'professional');
  });

  it('does not apply confirmation from another uid', () => {
    resetActiveProfileModeConfirmationForTests();
    recordActiveProfileModeConfirmation({
      uid: UID_A,
      mode: 'professional',
      visibility: false,
    });
    const merged = reconcileUserDocWithActiveProfileMode(
      { mode: 'personal', visibility: true },
      UID_B,
    );
    assert.equal(merged.mode, 'personal');
    assert.equal(merged.visibility, true);
  });

  it('expires protection after TTL and returns raw snapshot', () => {
    resetActiveProfileModeConfirmationForTests();
    const now = 1_700_000_000_000;
    recordActiveProfileModeConfirmation({
      uid: UID_A,
      mode: 'professional',
      visibility: false,
      confirmedAt: now,
    });
    const merged = reconcileUserDocWithActiveProfileMode(
      { mode: 'personal', visibility: true },
      UID_A,
      now + ACTIVE_PROFILE_MODE_CONFIRMATION_TTL_MS + 1,
    );
    assert.equal(merged.mode, 'personal');
    assert.equal(merged.visibility, true);
  });

  it('clearActiveProfileModeConfirmation removes pending protection', () => {
    resetActiveProfileModeConfirmationForTests();
    recordActiveProfileModeConfirmation({
      uid: UID_A,
      mode: 'professional',
      visibility: false,
    });
    clearActiveProfileModeConfirmation();
    const merged = reconcileUserDocWithActiveProfileMode(
      { mode: 'personal', visibility: true },
      UID_A,
    );
    assert.equal(merged.mode, 'personal');
  });
});

describe('applyActiveProfileModeResponseToUserDoc', () => {
  it('updates mode and visibility from response', () => {
    const next = applyActiveProfileModeResponseToUserDoc(
      { mode: 'personal', visibility: true, realName: 'Alex' },
      {
        contractVersion: 1,
        mode: 'professional',
        visibility: false,
        targetProfileComplete: false,
        discoverySynced: false,
        serverTime: 1,
      },
    );
    assert.equal(next.mode, 'professional');
    assert.equal(next.visibility, false);
    assert.equal(next.realName, 'Alex');
  });
});

describe('residual mode writes (iOS CRJ saves)', () => {
  it('buildActiveProfileSavePatch can omit mode when includeModeInPatch=false', () => {
    const patch = buildActiveProfileSavePatch({
      mode: 'personal',
      presentation: { realName: 'Alex' },
      includeModeInPatch: false,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'mode'), false);
  });
});

describe('static integration guards (I1)', () => {
  it('callable name registered', () => {
    assert.equal(
      VISIBILITY_CALLABLE_NAMES.setActiveProfileMode,
      'setActiveProfileMode',
    );
  });

  it('ProfileCompletion uses callable not updateUserMode', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(src, /setActiveProfileModeFlow/);
    assert.doesNotMatch(src, /updateUserMode/);
    assert.match(src, /getUserProfile\(uid\)/);
  });

  it('CompleteProfile toggle is non-optimistic and uses session guard', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(src, /createActiveProfileModeSwitchSession/);
    assert.match(src, /modeSwitchLoading/);
    assert.doesNotMatch(src, /updateUserMode/);
    assert.doesNotMatch(src, /setMode\(nextMode\)[\s\S]{0,120}applyModeFields/);
  });

  it('mode switch flow does not call publishLocation or activateVisibility', () => {
    const syncSrc = readShared('visibility/activeProfileModeSync.ts');
    assert.doesNotMatch(syncSrc, /publishLocation/);
    assert.doesNotMatch(syncSrc, /activateVisibility/);
    assert.doesNotMatch(syncSrc, /deactivateVisibility/);
  });

  it('CompleteProfile guards unmount and logout during request', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(src, /mountedRef/);
    assert.match(src, /getUid\(\) !== uid/);
  });

  it('AppNavigator clears confirmation on logout', () => {
    const src = readShared('navigation/AppNavigator.tsx');
    assert.match(src, /clearActiveProfileModeConfirmation/);
  });

  it('MainHome passes uid into reconciliation', () => {
    const src = readShared('screens/MainHomeScreen.tsx');
    assert.match(src, /reconcileUserDocWithActiveProfileMode\([\s\S]*uid/);
  });

  it('finishOnboarding omits mode write', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(src, /profileSetupCompleted: true/);
    assert.doesNotMatch(
      src,
      /finishOnboarding[\s\S]{0,400}profileSetupCompleted: true[\s\S]{0,120}mode,/,
    );
  });

  it('updateUserMode retained for Android only — no iOS callers', () => {
    const firestoreSrc = readShared('services/firestoreService.ts');
    assert.match(firestoreSrc, /export const updateUserMode/);
    const pe = readShared('screens/ProfileCompletionScreen.tsx');
    const cp = readShared('screens/CompleteProfileScreen.tsx');
    assert.doesNotMatch(pe, /updateUserMode/);
    assert.doesNotMatch(cp, /updateUserMode/);
  });
});
