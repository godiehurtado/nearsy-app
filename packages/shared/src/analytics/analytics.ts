/**
 * Default no-op analytics. Android resolves `analytics.android.ts` instead; any
 * other platform stays silent.
 */
import type { AnalyticsApi } from './analyticsApi';

export const startAnalytics: AnalyticsApi['startAnalytics'] = () => () => {};
export const trackSignupCompleted: AnalyticsApi['trackSignupCompleted'] = () => {};
export const trackProfileCompleted: AnalyticsApi['trackProfileCompleted'] = () => {};
export const syncAnalyticsPersonProfile: AnalyticsApi['syncAnalyticsPersonProfile'] =
  () => {};
