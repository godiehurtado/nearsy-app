import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseCancelPhoneVerificationResponse,
  parseCheckPhoneVerificationResponse,
  parseGetPhoneVerificationStateResponse,
  parseStartPhoneVerificationResponse,
} from '../callables/parse';
import {
  mapPhoneOtpErrorReason,
  normalizeFirebaseErrorCode,
  normalizePhoneOtpCallableError,
} from '../callables/errors';
import {
  resolveOnboardingRoute,
  resolveAuthenticatedStackInitialRoute,
  resolvePostAuthNavigationTarget,
  hasValidOnboardingBirthDate,
} from '../onboardingResolver';
import { createFakePhoneOtpClient } from '../callables/fakeClient';
import { createPhoneOtpController } from '../phoneOtpController';
import { buildPostAuthResetRoutes } from '../postAuthNavigation';
import { performPhoneOtpOnboardingLogout } from '../onboardingLogout';
import {
  createPhoneOtpSignOutPressHandler,
  resetAuthNavigationToLogin,
  runPhoneOtpScreenSignOut,
} from '../phoneOtpSignOut';
import {
  ageFromBirthDate,
  birthPartsFromIso,
  birthPartsToLocalDate,
  isBirthDateInFuture,
  meetsRegistrationAgeRange,
  minRegistrationBirthDate,
  MAX_REGISTRATION_AGE,
  MIN_REGISTRATION_AGE,
  type BirthDateParts,
} from '../../utils/birthDate';

describe('phone OTP contracts', () => {
  it('parses start response with server timestamps', () => {
    const out = parseStartPhoneVerificationResponse({
      challengeId: 'ch_abc12345678',
      maskedPhone: '+1••••••34',
      expiresAt: '2026-09-01T12:05:00.000Z',
      resendAvailableAt: '2026-09-01T12:01:00.000Z',
      sendsRemaining30m: 2,
      sendsRemaining24h: 9,
      smsSent: false,
    });
    assert.equal(out.challengeId, 'ch_abc12345678');
    assert.equal(out.smsSent, false);
  });

  it('rejects invalid getState payload', () => {
    assert.throws(() => parseGetPhoneVerificationStateResponse({ uiState: 'bogus' }));
  });

  it('parses nullable getState fields', () => {
    const out = parseGetPhoneVerificationStateResponse({
      uiState: 'none',
      phoneVerified: false,
      phoneMasked: null,
      challengeId: null,
      expiresAt: null,
      resendAvailableAt: null,
      attemptCount: null,
      attemptsRemaining: null,
      sendsRemaining30m: null,
      sendsRemaining24h: null,
    });
    assert.equal(out.challengeId, null);
  });
});

describe('phone OTP error mapping', () => {
  it('maps firebase unauthenticated', () => {
    const mapped = mapPhoneOtpErrorReason({
      code: 'unauthenticated',
      message: 'Authentication is required.',
    });
    assert.equal(mapped.reason, 'auth_required');
  });

  it('infers code mismatch from message', () => {
    const mapped = mapPhoneOtpErrorReason({
      code: 'failed-precondition',
      message: 'Verification code is incorrect.',
    });
    assert.equal(mapped.reason, 'code_mismatch');
  });

  it('normalizes callable throwable', () => {
    const err = normalizePhoneOtpCallableError({
      code: 'functions/failed-precondition',
      message: 'Phone verification is temporarily unavailable.',
    });
    assert.equal(err.reason, 'feature_disabled');
    assert.match(err.messageKey, /featureDisabled/);
  });

  it('normalizes unknown firebase codes', () => {
    assert.equal(normalizeFirebaseErrorCode('functions/weird_code'), 'unknown');
  });

  it('maps phone not allowed from permission-denied message', () => {
    const mapped = mapPhoneOtpErrorReason({
      code: 'permission-denied',
      message: 'This phone number is not eligible for verification.',
    });
    assert.equal(mapped.reason, 'phone_not_allowed');
  });

  it('maps landline blocked from permission-denied message', () => {
    const mapped = mapPhoneOtpErrorReason({
      code: 'permission-denied',
      message: 'Landline numbers cannot receive SMS verification.',
    });
    assert.equal(mapped.reason, 'landline_blocked');
  });

  it('maps challenge ownership to verification_not_authorized', () => {
    const mapped = mapPhoneOtpErrorReason({
      code: 'permission-denied',
      message: 'Verification challenge does not belong to this user.',
    });
    assert.equal(mapped.reason, 'verification_not_authorized');
    assert.match(mapped.messageKey, /verificationNotAuthorized/);
  });

  it('maps unknown permission-denied to generic fallback', () => {
    const mapped = mapPhoneOtpErrorReason({
      code: 'permission-denied',
      message: 'Access denied.',
    });
    assert.equal(mapped.reason, 'generic');
    assert.equal(mapped.messageKey, 'phoneOtp.errors.generic');
  });
});

describe('onboarding resolver', () => {
  const validDob = {
    birthDate: '1990-12-31',
    phoneVerified: false,
    profileSetupCompleted: false,
  };

  it('complete when profileSetupCompleted', () => {
    assert.equal(
      resolveOnboardingRoute({ profileSetupCompleted: true, phoneVerified: false })
        .kind,
      'complete',
    );
  });

  it('needsDateOfBirth when birthDate missing', () => {
    assert.equal(
      resolveOnboardingRoute({ phoneVerified: false }).kind,
      'needsDateOfBirth',
    );
  });

  it('rejects birthYear-only without birthDate', () => {
    assert.equal(
      hasValidOnboardingBirthDate({ birthYear: 1990 }),
      false,
    );
  });

  it('needsPhoneVerification when DOB valid and phone not verified', () => {
    assert.equal(resolveOnboardingRoute(validDob).kind, 'needsPhoneVerification');
  });

  it('needsProfileCompletion when phone verified', () => {
    assert.equal(
      resolveOnboardingRoute({
        ...validDob,
        phoneVerified: true,
      }).kind,
      'needsProfileCompletion',
    );
  });

  it('complete profile ignores settings phone invalidation', () => {
    assert.equal(
      resolveOnboardingRoute({
        profileSetupCompleted: true,
        phoneVerified: false,
      }).kind,
      'complete',
    );
  });

  it('stack routes OTP before CRJ when phone pending', () => {
    assert.equal(
      resolveAuthenticatedStackInitialRoute(validDob),
      'PhoneVerification',
    );
  });

  it('post-auth target PhoneVerification for valid DOB unverified phone', () => {
    assert.equal(
      resolvePostAuthNavigationTarget(validDob),
      'PhoneVerification',
    );
  });

  it('rejects age over 99 for onboarding', () => {
    const asOf = new Date(2026, 8, 1);
    const tooOld: BirthDateParts = { day: 1, month: 9, year: 1926 };
    assert.equal(ageFromBirthDate(tooOld, asOf), 100);
    assert.equal(hasValidOnboardingBirthDate({ birthDate: '1926-09-01' }, asOf), false);
    assert.equal(
      resolveOnboardingRoute(
        { birthDate: '1926-09-01', phoneVerified: false },
        asOf,
      ).kind,
      'needsDateOfBirth',
    );
  });

  it('accepts age 99 for onboarding', () => {
    const asOf = new Date(2026, 8, 1);
    assert.equal(
      hasValidOnboardingBirthDate({ birthDate: '1927-09-01' }, asOf),
      true,
    );
    assert.equal(
      resolveOnboardingRoute(
        { birthDate: '1927-09-01', phoneVerified: false },
        asOf,
      ).kind,
      'needsPhoneVerification',
    );
  });

  it('social missing DOB never routes to phone verification', () => {
    assert.equal(
      resolveOnboardingRoute({ phoneVerified: false }).kind,
      'needsDateOfBirth',
    );
    assert.equal(
      resolveAuthenticatedStackInitialRoute({ phoneVerified: false }),
      'ProfileCompletion',
    );
  });
});

describe('registration age range', () => {
  const asOf = new Date(2026, 8, 1);

  it('allows 18 and 99 by full birth date', () => {
    const eighteen: BirthDateParts = { day: 1, month: 9, year: 2008 };
    const ninetyNine: BirthDateParts = { day: 1, month: 9, year: 1927 };
    assert.equal(meetsRegistrationAgeRange(eighteen, asOf), true);
    assert.equal(meetsRegistrationAgeRange(ninetyNine, asOf), true);
  });

  it('rejects 17 and 100 by full birth date', () => {
    const seventeen: BirthDateParts = { day: 2, month: 9, year: 2008 };
    const hundred: BirthDateParts = { day: 1, month: 9, year: 1926 };
    assert.equal(meetsRegistrationAgeRange(seventeen, asOf), false);
    assert.equal(meetsRegistrationAgeRange(hundred, asOf), false);
  });

  it('uses birthday boundary not year subtraction alone', () => {
    const turnsEighteenTomorrow: BirthDateParts = {
      day: 2,
      month: 9,
      year: 2008,
    };
    assert.equal(meetsRegistrationAgeRange(turnsEighteenTomorrow, asOf), false);
  });

  it('exports canonical registration age bounds', () => {
    assert.equal(MIN_REGISTRATION_AGE, 18);
    assert.equal(MAX_REGISTRATION_AGE, 99);
  });

  it('minRegistrationBirthDate uses day after asOf minus 100 years', () => {
    const asOf = new Date(2026, 8, 1);
    const min = minRegistrationBirthDate(asOf);
    assert.deepEqual(min, { year: 1926, month: 9, day: 2 });
    const minDate = birthPartsToLocalDate(min);
    assert.ok(minDate);
    assert.equal(minDate?.getFullYear(), 1926);
    assert.equal(minDate?.getMonth(), 8);
    assert.equal(minDate?.getDate(), 2);
  });

  it('validates the full 18-99 matrix for 2026-09-01', () => {
    const asOf = new Date(2026, 8, 1);
    const cases: Array<{ iso: string; valid: boolean }> = [
      { iso: '2008-09-01', valid: true },
      { iso: '2008-09-02', valid: false },
      { iso: '1927-09-01', valid: true },
      { iso: '1926-09-02', valid: true },
      { iso: '1926-09-01', valid: false },
      { iso: '2027-01-01', valid: false },
    ];
    for (const testCase of cases) {
      const parts = birthPartsFromIso(testCase.iso);
      assert.ok(parts);
      assert.equal(
        meetsRegistrationAgeRange(parts as BirthDateParts, asOf),
        testCase.valid,
        testCase.iso,
      );
      if (testCase.valid) {
        assert.equal(isBirthDateInFuture(parts as BirthDateParts, asOf), false);
      }
    }
    const min = birthPartsToLocalDate(minRegistrationBirthDate(asOf));
    const oldestValid = birthPartsToLocalDate(
      birthPartsFromIso('1926-09-02') as BirthDateParts,
    );
    assert.ok(min && oldestValid);
    assert.equal(min?.getTime(), oldestValid?.getTime());
  });
});

describe('phone OTP controller', () => {
  it('bootstraps pending challenge from getState', async () => {
    const fake = createFakePhoneOtpClient({
      uiState: 'pending',
      challengeId: 'ch_fake_123',
      maskedPhone: '+1••••34',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      resendAvailableAt: new Date(Date.now() + 30_000).toISOString(),
      attemptsRemaining: 4,
    });
    const controller = createPhoneOtpController({ client: fake });
    const view = await controller.bootstrap();
    assert.equal(view.phase, 'pending');
    assert.equal(view.challengeId, 'ch_fake_123');
  });

  it('handles feature disabled on start', async () => {
    const fake = createFakePhoneOtpClient({ featureDisabled: true });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    const view = await controller.startVerification('+15551234567');
    assert.equal(view.phase, 'feature_disabled');
  });

  it('verifies with correct code without client writing phoneVerified', async () => {
    const fake = createFakePhoneOtpClient();
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    await controller.startVerification('+15551234567');
    controller.setCode('123456');
    const view = await controller.checkCode();
    assert.equal(view.phase, 'verified');
    assert.equal(fake.state.phoneVerified, true);
  });

  it('blocks double start while in flight', async () => {
    const fake = createFakePhoneOtpClient();
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    const p1 = controller.startVerification('+15551234567');
    const mid = controller.getState();
    assert.equal(mid.operationInFlight, true);
    await p1;
  });

  it('change phone clears in-memory state', async () => {
    const fake = createFakePhoneOtpClient();
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    await controller.startVerification('+15551234567');
    const view = await controller.changePhone();
    assert.equal(view.phoneE164InMemory, null);
    assert.equal(view.phase, 'capture');
  });

  it('resend requires in-memory E.164 after recovery', async () => {
    const fake = createFakePhoneOtpClient({
      uiState: 'pending',
      challengeId: 'ch_fake_123',
      maskedPhone: '+1••••34',
      resendAvailableAt: new Date(Date.now() - 1000).toISOString(),
    });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    const view = await controller.resend();
    assert.equal(view.phase, 'capture');
  });

  it('bootstraps expired challenge from getState', async () => {
    const fake = createFakePhoneOtpClient({ uiState: 'expired' });
    const controller = createPhoneOtpController({ client: fake });
    const view = await controller.bootstrap();
    assert.equal(view.phase, 'expired');
  });

  it('bootstraps locked challenge from getState', async () => {
    const fake = createFakePhoneOtpClient({ uiState: 'locked' });
    const controller = createPhoneOtpController({ client: fake });
    const view = await controller.bootstrap();
    assert.equal(view.phase, 'locked');
  });

  it('bootstraps cancelled challenge from getState', async () => {
    const fake = createFakePhoneOtpClient({ uiState: 'cancelled' });
    const controller = createPhoneOtpController({ client: fake });
    const view = await controller.bootstrap();
    assert.equal(view.phase, 'cancelled');
  });

  it('recovers from start timeout via getState', async () => {
    const fake = createFakePhoneOtpClient({
      startError: {
        code: 'functions/unavailable',
        message: 'Callable request timed out.',
      },
      uiState: 'none',
    });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    const view = await controller.startVerification('+15551234567');
    assert.equal(view.phase, 'capture');
    assert.equal(fake.state.getStateCalls, 2);
    assert.ok(view.lastError);
  });

  it('recovers from check timeout via getState', async () => {
    const fake = createFakePhoneOtpClient({
      uiState: 'pending',
      challengeId: 'ch_fake_123',
      checkError: {
        code: 'functions/unavailable',
        message: 'Callable request timed out.',
      },
    });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    controller.setCode('000000');
    const view = await controller.checkCode();
    assert.equal(view.phase, 'pending');
    assert.equal(fake.state.getStateCalls, 2);
    assert.ok(view.lastError);
  });

  it('maps app check bootstrap failure', async () => {
    const fake = createFakePhoneOtpClient({
      getStateError: {
        code: 'functions/failed-precondition',
        message: 'App Check is not ready.',
      },
    });
    const controller = createPhoneOtpController({ client: fake });
    const view = await controller.bootstrap();
    assert.equal(view.phase, 'app_check_failure');
  });

  it('maps auth bootstrap failure', async () => {
    const fake = createFakePhoneOtpClient({
      getStateError: {
        code: 'functions/unauthenticated',
        message: 'Authentication is required.',
      },
    });
    const controller = createPhoneOtpController({ client: fake });
    const view = await controller.bootstrap();
    assert.equal(view.phase, 'auth_failure');
  });

  it('maps provider unavailable on start', async () => {
    const fake = createFakePhoneOtpClient({
      startError: {
        code: 'functions/unavailable',
        message: 'Unable to complete phone verification right now.',
      },
    });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    const view = await controller.startVerification('+15551234567');
    assert.equal(view.phase, 'capture');
    assert.equal(view.lastError?.reason, 'provider_unavailable');
  });

  it('prepareLogout cancels active challenge', async () => {
    const fake = createFakePhoneOtpClient({
      uiState: 'pending',
      challengeId: 'ch_fake_123',
    });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    await controller.prepareLogout();
    assert.equal(fake.state.cancelCalls, 1);
  });

  it('prepareLogout is no-op without challenge', async () => {
    const fake = createFakePhoneOtpClient();
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    await controller.prepareLogout();
    assert.equal(fake.state.cancelCalls, 0);
  });

  it('prepareLogout continues when cancel fails', async () => {
    const fake = createFakePhoneOtpClient({
      uiState: 'pending',
      challengeId: 'ch_fake_123',
      cancelFails: true,
    });
    const controller = createPhoneOtpController({
      client: fake,
      logoutCancelTimeoutMs: 50,
    });
    await controller.bootstrap();
    await assert.doesNotReject(async () => controller.prepareLogout());
    assert.equal(fake.state.cancelCalls, 1);
  });

  it('absorbs late cancel rejection after prepareLogout timeout', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const fake = createFakePhoneOtpClient({
        uiState: 'pending',
        challengeId: 'ch_fake_123',
        cancelDelayedRejectMs: 50,
      });
      const controller = createPhoneOtpController({
        client: fake,
        logoutCancelTimeoutMs: 10,
      });
      await controller.bootstrap();
      await controller.prepareLogout();
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(unhandled.length, 0);
      assert.equal(fake.state.cancelCalls, 1);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('resetSensitiveSessionState clears in-memory fields', async () => {
    const fake = createFakePhoneOtpClient();
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    await controller.startVerification('+15551234567');
    controller.setCode('123456');
    const cleared = controller.resetSensitiveSessionState();
    assert.equal(cleared.phoneE164InMemory, null);
    assert.equal(cleared.challengeId, null);
    assert.equal(cleared.code, '');
  });

  it('dispose prevents further state updates', async () => {
    const fake = createFakePhoneOtpClient();
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    controller.dispose();
    const next = controller.setCode('123456');
    assert.equal(next.code, '');
  });
});

describe('onboarding OTP logout helper', () => {
  it('performs cancel, clears memory, and signs out', async () => {
    const fake = createFakePhoneOtpClient({
      uiState: 'pending',
      challengeId: 'ch_fake_123',
    });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    let signedOut = false;
    let cleared = false;
    const result = await performPhoneOtpOnboardingLogout({
      controller,
      signOut: async () => {
        signedOut = true;
      },
      clearSensitiveLocalState: () => {
        cleared = true;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(fake.state.cancelCalls, 1);
    assert.equal(signedOut, true);
    assert.equal(cleared, true);
    assert.equal(controller.setCode('123456').code, '');
  });

  it('keeps controller usable when signOut fails', async () => {
    const fake = createFakePhoneOtpClient({
      uiState: 'pending',
      challengeId: 'ch_fake_123',
    });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    let cleared = false;
    const result = await performPhoneOtpOnboardingLogout({
      controller,
      signOut: async () => {
        throw new Error('network');
      },
      clearSensitiveLocalState: () => {
        cleared = true;
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.messageKey, 'phoneOtp.signOut.failed');
    assert.equal(cleared, false);
    assert.equal(controller.setCode('123456').code, '123456');
  });

  it('allows a later successful signOut after failure', async () => {
    const fake = createFakePhoneOtpClient({
      uiState: 'pending',
      challengeId: 'ch_fake_123',
    });
    const controller = createPhoneOtpController({ client: fake });
    await controller.bootstrap();
    let shouldFail = true;
    const first = await performPhoneOtpOnboardingLogout({
      controller,
      signOut: async () => {
        if (shouldFail) throw new Error('network');
      },
    });
    assert.equal(first.ok, false);
    assert.equal(controller.setCode('654321').code, '654321');

    shouldFail = false;
    let cleared = false;
    const second = await performPhoneOtpOnboardingLogout({
      controller,
      signOut: async () => {},
      clearSensitiveLocalState: () => {
        cleared = true;
      },
    });
    assert.equal(second.ok, true);
    assert.equal(cleared, true);
    assert.equal(controller.setCode('111111').code, '');
  });

  it('blocks double logout tap via caller guard pattern', async () => {
    let inFlight = false;
    let signOutCalls = 0;
    const run = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await performPhoneOtpOnboardingLogout({
          controller: null,
          signOut: async () => {
            signOutCalls += 1;
          },
        });
        assert.equal(result.ok, true);
      } finally {
        inFlight = false;
      }
    };
    await Promise.all([run(), run()]);
    assert.equal(signOutCalls, 1);
  });
});

describe('phone OTP screen sign-out wiring', () => {
  it('resetAuthNavigationToLogin prefers parent navigator reset', () => {
    let parentReset = 0;
    let selfReset = 0;
    resetAuthNavigationToLogin({
      getParent: () => ({
        reset: () => {
          parentReset += 1;
        },
      }),
      reset: () => {
        selfReset += 1;
      },
    });
    assert.equal(parentReset, 1);
    assert.equal(selfReset, 0);
  });

  it('runPhoneOtpScreenSignOut resets navigation only after success', async () => {
    let navResets = 0;
    const fail = await runPhoneOtpScreenSignOut({
      controller: null,
      signOut: async () => {
        throw new Error('network');
      },
      resetNavigationToLogin: () => {
        navResets += 1;
      },
      clearSocialPrefill: () => {},
    });
    assert.equal(fail.ok, false);
    assert.equal(navResets, 0);

    const ok = await runPhoneOtpScreenSignOut({
      controller: null,
      signOut: async () => {},
      resetNavigationToLogin: () => {
        navResets += 1;
      },
      clearSocialPrefill: () => {},
    });
    assert.equal(ok.ok, true);
    assert.equal(navResets, 1);
  });

  it('createPhoneOtpSignOutPressHandler invokes runSignOut and blocks double tap', async () => {
    let signingOut = false;
    let runCalls = 0;
    const handler = createPhoneOtpSignOutPressHandler({
      isSigningOut: () => signingOut,
      setSigningOut: (next) => {
        signingOut = next;
      },
      setSignOutError: () => {},
      translate: (key) => key,
      isMounted: () => true,
      runSignOut: async () => {
        runCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { ok: true };
      },
    });

    await Promise.all([handler(), handler()]);
    assert.equal(runCalls, 1);
    assert.equal(signingOut, false);
  });

  it('createPhoneOtpSignOutPressHandler surfaces failure and allows retry', async () => {
    let signingOut = false;
    let error: string | null = null;
    let shouldFail = true;
    const handler = createPhoneOtpSignOutPressHandler({
      isSigningOut: () => signingOut,
      setSigningOut: (next) => {
        signingOut = next;
      },
      setSignOutError: (message) => {
        error = message;
      },
      translate: (key) => key,
      isMounted: () => true,
      runSignOut: async () => {
        if (shouldFail) {
          return { ok: false, messageKey: 'phoneOtp.signOut.failed' };
        }
        return { ok: true };
      },
    });

    await handler();
    assert.equal(error, 'phoneOtp.signOut.failed');
    assert.equal(signingOut, false);

    shouldFail = false;
    await handler();
    assert.equal(signingOut, false);
  });
});

describe('post auth navigation routes', () => {
  it('routes verified onboarding users to ProfileCompletion', () => {
    const routes = buildPostAuthResetRoutes('ProfileCompletion', {
      uid: 'u1',
      email: 'a@b.com',
    });
    assert.equal(routes.routes[0]?.name, 'ProfileCompletion');
  });

  it('routes phone pending to PhoneVerification', () => {
    const routes = buildPostAuthResetRoutes('PhoneVerification', { uid: 'u1' });
    assert.equal(routes.routes[0]?.name, 'PhoneVerification');
  });
});
