/**
 * Default no-op analytics. Android resolves `analytics.android.ts` instead; any
 * other platform stays silent.
 */
import type { AnalyticsApi } from './analyticsApi';

export const startAnalytics: AnalyticsApi['startAnalytics'] = () => () => {};
export const trackSignupCompleted: AnalyticsApi['trackSignupCompleted'] = () => {};
export const noteExistingAccountSignIn: AnalyticsApi['noteExistingAccountSignIn'] = () => {};
export const noteLinkedInAccountOutcome: AnalyticsApi['noteLinkedInAccountOutcome'] = () => {};
export const trackProfileCompleted: AnalyticsApi['trackProfileCompleted'] = () => {};
export const syncAnalyticsPersonProfile: AnalyticsApi['syncAnalyticsPersonProfile'] =
  () => {};
export const noteOnboardingResume: AnalyticsApi['noteOnboardingResume'] = () => {};
export const trackOnboardingStep: AnalyticsApi['trackOnboardingStep'] = () => {};
export const noteSocialOwnership: AnalyticsApi['noteSocialOwnership'] = () => {};
export const noteSocialOwnershipFailed: AnalyticsApi['noteSocialOwnershipFailed'] = () => {};
export const noteSocialVerificationPending: AnalyticsApi['noteSocialVerificationPending'] =
  () => {};
export const trackSocialLinked: AnalyticsApi['trackSocialLinked'] = () => {};
export const trackMatchSocialTapped: AnalyticsApi['trackMatchSocialTapped'] = () => {};
export const trackVisibilityChanged: AnalyticsApi['trackVisibilityChanged'] = () => {};
export const trackDiscoveryOpened: AnalyticsApi['trackDiscoveryOpened'] = () => {};
export const trackProfileViewed: AnalyticsApi['trackProfileViewed'] = () => {};
export const trackMatchPresented: AnalyticsApi['trackMatchPresented'] = () => {};
export const trackAlertOpened: AnalyticsApi['trackAlertOpened'] = () => {};
