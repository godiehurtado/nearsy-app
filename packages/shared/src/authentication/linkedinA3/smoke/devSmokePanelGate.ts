/**
 * Gate for the LinkedIn A3 Development smoke panel.
 * Must never render in Preview/Production or non-iOS surfaces.
 */

export type LinkedInA3DevSmokePanelGateInput = {
  isDev: boolean;
  platform: string;
  /** Raw EXPO_PUBLIC_NEARSY_FIREBASE_ENV (or equivalent). */
  firebaseEnvironment: string | null | undefined;
  /** Raw EXPO_PUBLIC_LINKEDIN_AUTH_ENABLED or resolved boolean. */
  linkedInAuthEnabled: boolean | string | null | undefined;
};

function isTruthyEnabled(value: boolean | string | null | undefined): boolean {
  if (value === true) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function isDevelopmentFirebaseEnv(
  raw: string | null | undefined,
): boolean {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  return value === 'development' || value === 'dev';
}

/**
 * Show only when ALL are true:
 * __DEV__, iOS, Firebase environment development, LinkedIn enabled.
 */
export function shouldShowLinkedInA3DevSmokePanel(
  input: LinkedInA3DevSmokePanelGateInput,
): boolean {
  if (!input.isDev) return false;
  if (String(input.platform).toLowerCase() !== 'ios') return false;
  if (!isDevelopmentFirebaseEnv(input.firebaseEnvironment)) return false;
  if (!isTruthyEnabled(input.linkedInAuthEnabled)) return false;
  return true;
}
