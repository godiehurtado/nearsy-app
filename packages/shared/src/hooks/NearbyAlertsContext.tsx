/**
 * Single shared source for Alerts tray + tab badge (one discoverNearby poller).
 */
import React, { createContext, useContext, type ReactNode } from 'react';

import {
  useNearbyAlertsState,
  type NearbyAlertsState,
} from './useNearbyAlerts';

const NearbyAlertsContext = createContext<NearbyAlertsState | null>(null);

export function NearbyAlertsProvider({ children }: { children: ReactNode }) {
  const value = useNearbyAlertsState();
  return (
    <NearbyAlertsContext.Provider value={value}>
      {children}
    </NearbyAlertsContext.Provider>
  );
}

export function useNearbyAlerts(): NearbyAlertsState {
  const ctx = useContext(NearbyAlertsContext);
  if (!ctx) {
    throw new Error(
      'useNearbyAlerts must be used within NearbyAlertsProvider',
    );
  }
  return ctx;
}
