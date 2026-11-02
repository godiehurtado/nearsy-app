/**
 * Pure Alerts mapping — discoverNearby results → rows.
 * No Firebase / UI imports (safe for Node tests).
 */
import type { DiscoverNearbyResult } from '../visibility/callables/wireTypes';

export type AlertKind = 'interest_nearby' | 'contact_nearby';

export type AlertItem = {
  id: string;
  uid?: string;
  name: string;
  avatar?: string | null;
  kind: AlertKind;
  distanceFt?: number;
  sharedInterests?: string[];
  at: number;
  fromContacts?: boolean;
  appearanceKey?: string;
  unseen?: boolean;
};

export type NearbyAlertsViewerDoc = {
  mode?: 'personal' | 'professional' | string;
  searchPreferences?: {
    personal?: { interestIds?: string[] };
    professional?: { interestIds?: string[] };
  };
  personalOnboardingInterests?: Array<{ id?: string }>;
  professionalOnboardingInterests?: Array<{ id?: string }>;
};

function resolveViewerMode(
  me: NearbyAlertsViewerDoc,
): 'personal' | 'professional' {
  return me.mode === 'professional' ? 'professional' : 'personal';
}

export function collectActiveModeInterestIds(
  me: NearbyAlertsViewerDoc,
): Set<string> {
  const mode = resolveViewerMode(me);
  const ids: string[] = [];
  const prefs = me.searchPreferences?.[mode]?.interestIds;
  if (Array.isArray(prefs)) {
    for (const id of prefs) {
      if (typeof id === 'string' && id) ids.push(id);
    }
  }
  const onboarding =
    mode === 'professional'
      ? me.professionalOnboardingInterests
      : me.personalOnboardingInterests;
  for (const row of onboarding ?? []) {
    if (typeof row?.id === 'string' && row.id) ids.push(row.id);
  }
  return new Set(ids);
}

export function fingerprintActiveModeInterests(
  me: NearbyAlertsViewerDoc | null | undefined,
): string {
  if (!me) return '';
  return `${resolveViewerMode(me)}:${[...collectActiveModeInterestIds(me)].sort().join(',')}`;
}

export function mapDiscoverResultsToAlerts(
  results: DiscoverNearbyResult[],
  myInterestIds: Set<string>,
  at: number,
  viewerUid: string,
  metersToFeet: (meters: number) => number,
): AlertItem[] {
  const out: AlertItem[] = [];
  for (const r of results) {
    if (!r.uid || r.uid === viewerUid) continue;
    const shared = (r.profile.interestIds ?? []).filter((id) =>
      myInterestIds.has(id),
    );
    out.push({
      id: r.uid,
      uid: r.uid,
      name: r.profile.displayName || 'Unnamed',
      avatar: r.profile.profileImage,
      kind: shared.length > 0 ? 'interest_nearby' : 'contact_nearby',
      distanceFt: Math.round(metersToFeet(r.distanceMeters)),
      sharedInterests: shared.slice(0, 3),
      at,
      fromContacts: false,
      ...(r.appearanceKey ? { appearanceKey: r.appearanceKey } : {}),
    });
  }
  return out;
}
