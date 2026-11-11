/**
 * Pure Alerts mapping — discoverNearby results → rows.
 * No Firebase / UI imports (safe for Node tests).
 */
import type { DiscoverNearbyResult } from '../visibility/callables/wireTypes';

export type AlertKind = 'interest_nearby' | 'affiliation_nearby' | 'contact_nearby';

export type AlertItem = {
  id: string;
  uid?: string;
  name: string;
  avatar?: string | null;
  kind: AlertKind;
  distanceFt?: number;
  sharedInterests?: string[];
  /** Server-computed: at least one stable affiliation identity is shared. */
  sharedAffiliations?: boolean;
  /** Server-resolved names of the shared affiliations; absent → generic copy. */
  sharedAffiliationNames?: string[];
  /** sharedAffiliationCount; "and N more" uses N = total − 1. */
  sharedAffiliationTotal?: number;
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
  const seenUids = new Set<string>();
  for (const r of results) {
    if (!r.uid || r.uid === viewerUid) continue;
    // One row per person, whatever the server returns.
    if (seenUids.has(r.uid)) continue;
    const shared = (r.profile.interestIds ?? []).filter((id) =>
      myInterestIds.has(id),
    );
    // Only a non-negative integer from the server counts; absent means none.
    const count =
      typeof r.sharedAffiliationCount === 'number' &&
      Number.isSafeInteger(r.sharedAffiliationCount) &&
      r.sharedAffiliationCount > 0
        ? r.sharedAffiliationCount
        : 0;
    // Only the count qualifies a row. Names come only from the server, next to
    // a positive count (contract §3a), and are display-only, never matched.
    const sharedAffiliations = count > 0;
    const names =
      sharedAffiliations && r.sharedAffiliationNames?.length
        ? r.sharedAffiliationNames.slice(0, count)
        : undefined;
    if (shared.length === 0 && !sharedAffiliations) continue;
    seenUids.add(r.uid);
    out.push({
      id: r.uid,
      uid: r.uid,
      name: r.profile.displayName || 'Unnamed',
      avatar: r.profile.profileImage,
      kind: sharedAffiliations ? 'affiliation_nearby' : 'interest_nearby',
      ...(sharedAffiliations ? { sharedAffiliations: true } : {}),
      ...(names
        ? {
            sharedAffiliationNames: names,
            sharedAffiliationTotal: count,
          }
        : {}),
      distanceFt: Math.round(metersToFeet(r.distanceMeters)),
      sharedInterests: shared.slice(0, 3),
      at,
      fromContacts: false,
      ...(r.appearanceKey ? { appearanceKey: r.appearanceKey } : {}),
    });
  }
  return out;
}
