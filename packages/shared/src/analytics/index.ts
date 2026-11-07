/**
 * Public analytics API used by screens and services. Every function is safe to
 * call anywhere: with analytics off (the default) it returns immediately, without
 * touching storage or the network, and it can never throw into product code.
 *
 * Pure module: runtime wiring lives in runtime.ts.
 */
import {
  acquisitionProperties,
  campaignAccessProperties,
  classifyAttributionAccess,
  parseCampaignLink,
  type PendingAttributionStore,
} from './attribution';
import type { AnalyticsClient, AuthSnapshot } from './client';
import type { AnalyticsSocialPlatform, OnboardingStep, SignupMethod } from './contract';
import {
  buildScoreProperties,
  createMatchSessionDedupe,
  matchIdSeed,
  MATCH_ID_LENGTH,
} from './discoveryTracking';
import type { EventLedger } from './ledger';
import type { LocationPermissionKind } from './locationPermissions';
import {
  buildOnboardingStepProperties,
  computeCompletionTimeMin,
  type OnboardingStepCounts,
} from './onboarding';
import {
  newlyAddedManualSocials,
  profileWriteAffectsAnalytics,
} from './profileProperties';
import { toIsoCreationTime } from './client';
import {
  decideLinkedInSignup,
  type LinkedInAccountSignal,
} from '../authentication/linkedinA3/accountCreationSignal';

export { createDiscoveryEntryTracker } from './discoveryTracking';
export {
  countSocialConnections,
  summarizeAffiliations,
  summarizeInterests,
  type SelectionSummary,
} from './profileProperties';
export type { AuthSnapshot } from './client';

export type AnalyticsServices = {
  client: AnalyticsClient;
  ledger: EventLedger;
  attribution: PendingAttributionStore;
  attributionHosts: readonly string[];
  now: () => number;
  sha256Hex: (input: string) => Promise<string>;
  scheduleProfileSync: (uid: string) => void;
  noteVerifiedSocialsChanged: (uid: string) => void;
  observeLocationPermissions: (kind: LocationPermissionKind | null) => void;
  noteExternalAuthFlow: (active: boolean) => void;
};

let services: AnalyticsServices | null = null;
let matchDedupe = createMatchSessionDedupe();

/**
 * Only for a push tap in the instant before foreground start. Stays empty, and
 * unused, unless the runtime has declared analytics configured.
 */
let configured = false;
let earlyAlerts: Parameters<typeof trackAlertOpened>[0][] = [];
const MAX_EARLY_ALERTS = 5;

export function markAnalyticsConfigured(): void {
  configured = true;
}

export function bindAnalyticsServices(next: AnalyticsServices | null): void {
  services = next;
  matchDedupe = createMatchSessionDedupe();
  if (!next) {
    configured = false;
    earlyAlerts = [];
    return;
  }
  const queued = earlyAlerts;
  earlyAlerts = [];
  queued.forEach((input) => trackAlertOpened(input));
}

function safely(fn: (s: AnalyticsServices) => void | Promise<void>): void {
  const active = services;
  if (!active || !active.client.isEnabled()) return;
  try {
    void Promise.resolve(fn(active)).catch(() => {});
  } catch {
    // Analytics never affects the product.
  }
}

function currentCreationTime(s: AnalyticsServices, uid: string): string | null {
  return s.client.sessionFor(uid)?.creationTime ?? null;
}

const ACQUISITION_LEDGER_ITEM = 'acquisition_recorded';

/** Only after a confirmed account creation. Login and restore never reach this. */
export function trackSignupCompleted(input: {
  uid: string;
  method: SignupMethod;
}): void {
  safely(async (s) => {
    const creationTime = currentCreationTime(s, input.uid);
    const first = await s.ledger.claim(
      input.uid,
      creationTime,
      'signup_completed',
    );
    if (!first) return;
    const attribution = await s.attribution.take(s.now());
    const acquisition = attribution ? acquisitionProperties(attribution) : {};
    const sent = s.client.captureForUser(input.uid, 'signup_completed', {
      signup_method: input.method,
      ...acquisition,
    });
    if (sent && attribution) {
      s.client.setPersonProperties(input.uid, {}, acquisition);
      await s.ledger.claim(input.uid, creationTime, ACQUISITION_LEDGER_ITEM);
    }
  });
}

/** Social providers: `isNewUser` from Firebase is the creation confirmation. */
export function trackSocialAuthSession(
  method: Extract<SignupMethod, 'google' | 'apple' | 'facebook'>,
  session: { uid?: string | null; isNewUser?: boolean } | null | undefined,
): void {
  if (session?.isNewUser !== true || !session.uid) return;
  trackSignupCompleted({ uid: session.uid, method });
}


/**
 * LinkedIn counts only with the Identity signal: outcome `created` and a creation
 * time that matches the signed-in Firebase user, which ties it to this account
 * generation. No signal, `existing` or another generation emit nothing.
 * Dedupe is the same as every signup: UID + Firebase creation time.
 */
export function trackLinkedInAuthSession(
  uid: string,
  signal: LinkedInAccountSignal | null,
): void {
  if (!uid || !signal) return;
  safely((s) => {
    const creationTime = s.client.sessionFor(uid)?.creationTime ?? null;
    if (decideLinkedInSignup(signal, creationTime) !== 'emit') return;
    trackSignupCompleted({ uid, method: 'linkedin' });
  });
}

export function trackOnboardingStepCompleted(
  uid: string | null | undefined,
  step: OnboardingStep,
  counts?: OnboardingStepCounts,
): void {
  if (!uid) return;
  safely(async (s) => {
    const first = await s.ledger.claim(
      uid,
      currentCreationTime(s, uid),
      `onboarding:${step}`,
    );
    if (!first) return;
    s.client.captureForUser(
      uid,
      'onboarding_step_completed',
      buildOnboardingStepProperties(step, counts),
    );
  });
}

export function trackProfileCompleted(uid: string | null | undefined): void {
  if (!uid) return;
  safely(async (s) => {
    const creationTime = currentCreationTime(s, uid);
    const first = await s.ledger.claim(uid, creationTime, 'profile_completed');
    if (!first) return;
    s.client.captureForUser(uid, 'profile_completed', {
      completion_time_min: computeCompletionTimeMin(creationTime, s.now()),
      account_created_at: toIsoCreationTime(creationTime) ?? undefined,
    });
  });
}

/**
 * Wraps a sign-in that can leave the app for a moment, so its return is not
 * reported as an open. Runs the sign-in the same with analytics off.
 */
export async function withExternalAuthFlow<T>(run: () => Promise<T>): Promise<T> {
  safely((s) => s.noteExternalAuthFlow(true));
  const active = services;
  try {
    return await run();
  } finally {
    if (active === services) safely((s) => s.noteExternalAuthFlow(false));
  }
}

export function noteProfileWrite(
  uid: string,
  patch: Readonly<Record<string, unknown>>,
): void {
  safely((s) => {
    if (profileWriteAffectsAnalytics(patch)) s.scheduleProfileSync(uid);
  });
}

export function noteActiveProfileModeChanged(uid: string): void {
  safely((s) => s.scheduleProfileSync(uid));
}

export function noteLocationPermissionResolved(
  kind: LocationPermissionKind,
): void {
  safely((s) => s.observeLocationPermissions(kind));
}

export function trackVisibilityChanged(enabled: boolean): void {
  safely((s) =>
    s.client.captureForCurrentUser('visibility_changed', { enabled }),
  );
}

export function trackDiscoveryOpened(
  uid: string,
  input: { loadTimeMs: number; peopleShown: number },
): void {
  safely((s) => {
    s.client.captureForUser(uid, 'discovery_opened', {
      load_time_sec: Math.round(Math.max(0, input.loadTimeMs) / 100) / 10,
      people_shown: input.peopleShown,
    });
  });
}

export function trackProfileViewed(uid: string, score?: number | null): void {
  safely((s) => {
    s.client.captureForUser(uid, 'profile_viewed', buildScoreProperties(score));
  });
}

/**
 * Compatibility presented, not a mutual match: a list row at least 50% visible or
 * a profile opened, with a valid score. Row and later opening share one count.
 */
export function trackMatchPresented(
  viewerUid: string,
  otherUid: string,
  score: number | null | undefined,
): void {
  const scoreProperties = buildScoreProperties(score);
  if (Object.keys(scoreProperties).length === 0) return;
  safely(async (s) => {
    // The rule is per SDK session, so it needs the SDK running to read it.
    await s.client.start();
    const sessionId = s.client.getSessionId();
    if (!sessionId || !matchDedupe.claim(sessionId, viewerUid, otherUid)) return;
    // match_id is a convenience for this emitter: the event stands without it.
    const matchId = await s
      .sha256Hex(matchIdSeed(viewerUid, otherUid))
      .then((digest) => digest.slice(0, MATCH_ID_LENGTH))
      .catch(() => undefined);
    s.client.captureForUser(viewerUid, 'match_made', {
      match_id: matchId,
      ...scoreProperties,
    });
  });
}

export function trackMatchSocialTapped(input: {
  platform: AnalyticsSocialPlatform;
  score?: number | null;
  openResult: 'opened' | 'invalid' | 'failed' | 'unknown';
}): void {
  safely((s) => {
    s.client.captureForCurrentUser('match_social_tapped', {
      social_platform: input.platform,
      open_result: input.openResult,
      ...buildScoreProperties(input.score),
    });
  });
}

export function trackVerifiedSocialLinked(
  uid: string | null | undefined,
  platform: AnalyticsSocialPlatform,
): void {
  if (!uid) return;
  safely((s) => {
    s.client.captureForUser(uid, 'social_linked', {
      social_platform: platform,
      link_type: 'verified',
    });
    s.noteVerifiedSocialsChanged(uid);
  });
}

export function noteVerifiedSocialRemoved(uid: string | null | undefined): void {
  if (!uid) return;
  safely((s) => s.noteVerifiedSocialsChanged(uid));
}

/** Call after a manual link save landed, with the bag before and after it. */
export function trackManualSocialLinksSaved(
  uid: string | null | undefined,
  previous: unknown,
  next: unknown,
): void {
  if (!uid) return;
  safely((s) => {
    for (const platform of newlyAddedManualSocials(previous, next)) {
      s.client.captureForUser(uid, 'social_linked', {
        social_platform: platform,
        link_type: 'manual',
      });
    }
  });
}

export function trackAlertOpened(input: {
  source: 'push' | 'inbox';
  alertId?: string;
  motive?: string;
}): void {
  if (configured && !services) {
    if (earlyAlerts.length < MAX_EARLY_ALERTS) earlyAlerts.push(input);
    return;
  }
  safely((s) => {
    s.client.captureForCurrentUser('alert_opened', {
      source: input.source,
      alert_id: input.alertId,
      alert_motive: input.motive,
    });
  });
}

/** Original acquisition stays with the first account; later links are access. */
export async function resolvePendingAttribution(
  s: AnalyticsServices,
  user: AuthSnapshot,
): Promise<void> {
  const attribution = await s.attribution.take(s.now());
  if (!attribution) return;
  const alreadyRecorded = !(await s.ledger.claim(
    user.uid,
    user.creationTime,
    ACQUISITION_LEDGER_ITEM,
  ));
  const kind = classifyAttributionAccess({
    creationTime: user.creationTime,
    nowMs: s.now(),
    acquisitionAlreadyRecorded: alreadyRecorded,
  });
  if (kind === 'late_acquisition') {
    const acquisition = acquisitionProperties(attribution);
    s.client.captureForUser(user.uid, 'acquisition_attributed', acquisition);
    s.client.setPersonProperties(user.uid, {}, acquisition);
    return;
  }
  s.client.captureForUser(
    user.uid,
    'campaign_accessed',
    campaignAccessProperties(attribution),
  );
}

export function handleCampaignLink(url: unknown): void {
  safely(async (s) => {
    const attribution = parseCampaignLink(url, s.attributionHosts, s.now());
    if (!attribution) return;
    await s.attribution.save(attribution);
    const user = s.client.currentAuth();
    if (user) await resolvePendingAttribution(s, user);
  });
}
