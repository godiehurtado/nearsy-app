export type AnalyticsApi = {
  /** Starts listeners from the mounted app. Returns a detach function. */
  startAnalytics(): () => void;
  trackSignupCompleted(uid: string): void;
  trackProfileCompleted(uid: string): void;
  syncAnalyticsPersonProfile(uid: string, doc: unknown): void;
};
