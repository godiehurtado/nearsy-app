import { AppState, type AppStateStatus, Platform } from 'react-native';
import * as Location from 'expo-location';

import { BG_LOCATION_TASK } from './locationTask.android';
import { recordPresenceEvent, type LocBgPlatform } from './presenceDiagnostics';

async function startedSnapshot(): Promise<boolean | undefined> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {
    return undefined;
  }
}

/**
 * Foreground resume dump. `started` is an Expo snapshot only — not proof the
 * OS service is still alive.
 */
export function attachBackgroundPresenceResume(): () => void {
  const platform: LocBgPlatform =
    Platform.OS === 'ios' ? 'ios' : 'android';
  const onChange = (next: AppStateStatus) => {
    if (next !== 'active') return;
    void (async () => {
      const started = await startedSnapshot();
      await recordPresenceEvent({
        event: 'resume',
        platform,
        appState: 'active',
        started,
      });
    })();
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
