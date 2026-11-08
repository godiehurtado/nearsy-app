import type { OnboardingStepInput } from './analyticsOnboarding.ts';
import type { VerifiedSocialPlatform } from './analyticsSocial.ts';

export type SocialConnectionType = 'manual' | 'verified';
export type AlertOpenSource = 'push' | 'inbox';
export type MatchPresentedIn = 'nearby_list' | 'discovery_profile';

export type AnalyticsApi = {
  /** Starts listeners from the mounted app. Returns a detach function. */
  startAnalytics(): () => void;
  trackSignupCompleted(uid: string): void;
  /** Firebase confirmed this sign-in was an existing account (`isNewUser === false`). */
  noteExistingAccountSignIn(uid: string): void;
  /** What LinkedIn Exchange said about the account it just signed in, if anything. */
  noteLinkedInAccountOutcome(
    uid: string,
    signal: { accountOutcome: 'created' | 'existing'; authCreationTimeMs: number } | undefined,
  ): void;
  trackProfileCompleted(uid: string): void;
  syncAnalyticsPersonProfile(uid: string, doc: unknown): void;

  /** The CRJ resumed at this step: milestones behind it count as done, unsent. */
  noteOnboardingResume(uid: string, stepKind: string): void;
  trackOnboardingStep(uid: string, input: OnboardingStepInput): void;

  /**
   * A confirmed verified status of the mode. Pending or failed reads are not.
   * `ownerUid`: the account the read was made for; dropped if it is no longer signed in.
   */
  noteSocialOwnership(
    mode: string,
    platform: VerifiedSocialPlatform,
    connected: boolean,
    ownerUid?: string | null,
  ): void;
  /** A failed or rejected read: unknown, never a disconnection. */
  noteSocialOwnershipFailed(
    mode: string,
    platform: VerifiedSocialPlatform,
    ownerUid?: string | null,
  ): void;
  /**
   * A verification or OAuth connection attempt started. Its first confirmed
   * connected read counts as linked, once, even when the finalizer failed.
   */
  noteSocialVerificationPending(mode: string, platform: VerifiedSocialPlatform): void;
  /** A connection was just added. Never call it for hydration or an edit. */
  trackSocialLinked(
    platform: unknown,
    connectionType: SocialConnectionType,
    mode: string,
  ): void;
  /** Tap on a network of a Discovery profile; not a connection between people. */
  trackMatchSocialTapped(input: {
    platform: unknown;
    score: unknown;
    openResult: unknown;
  }): void;

  trackVisibilityChanged(uid: string, enabled: boolean): void;
  trackDiscoveryOpened(
    uid: string,
    properties: { load_time_sec: number; people_shown: number },
  ): void;
  trackProfileViewed(uid: string, score: unknown): void;
  /** `peerUid` is only a local dedupe key; it is never sent. */
  trackMatchPresented(
    uid: string,
    peerUid: string,
    score: unknown,
    presentedIn: MatchPresentedIn,
  ): void;
  trackAlertOpened(source: AlertOpenSource, alertId?: string): void;
};
