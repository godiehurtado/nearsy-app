import Constants from 'expo-constants';

import { isContactsDiagnosticsActive } from './contactsDiagnostics';

/** Set only by the TestFlight diagnostics EAS profile; absent everywhere else. */
export function isContactsDiagnosticsVisible(): boolean {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  return isContactsDiagnosticsActive(
    extra?.NEARSY_CONTACTS_DIAGNOSTICS_UNTIL,
    Date.now(),
  );
}
