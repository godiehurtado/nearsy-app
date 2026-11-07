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

export type LinkedInAccountCreationSignal = 'created' | 'existing' | 'unknown';

/** LinkedIn counts only with an explicit Identity signal. Unknown emits nothing. */
export function trackLinkedInAuthSession(
  uid: string,
  signal: LinkedInAccountCreationSignal,
): void {
  if (signal !== 'created') return;
  trackSignupCompleted({ uid, method: 'linkedin' });
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

/** A discovered profile with a real compatibility score was shown on screen. */
export function trackMatchPresented(
  viewerUid: string,
  otherUid: string,
  score: number | null | undefined,
): void {
  if (typeof score !== 'number') return;
  safely(async (s) => {
    const sessionId = s.client.getSessionId();
    if (!matchDedupe.claim(sessionId, viewerUid, otherUid)) return;
    const digest = await s.sha256Hex(matchIdSeed(viewerUid, otherUid));
    s.client.captureForUser(viewerUid, 'match_made', {
      match_id: digest.slice(0, MATCH_ID_LENGTH),
      ...buildScoreProperties(score),
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
    'campaign_access',
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
