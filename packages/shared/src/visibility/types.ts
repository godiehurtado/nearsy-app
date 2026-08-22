/**
 * Visibility Journey — pure client domain types (no callable wire types yet).
 */

import type { ProfileMode } from '../profile/profileModeFields';

export type { ProfileMode };

/** Presentation unit for distance controls (parameterized; no GPS). */
export type DistanceDisplayUnit = 'ft' | 'm';

/** Search preferences for one profile face (Personal or Professional). */
export type VisibilitySearchPreferences = {
  ageMin: number;
  ageMax: number;
  /** Canonical meters. */
  maxDistanceMeters: number;
  interestIds: string[];
  /** Epoch ms when prefs for this face were last updated (client or server). */
  updatedAt: number;
};

/** Independent Personal + Professional preference bags. */
export type VisibilitySearchPreferencesByMode = {
  personal: VisibilitySearchPreferences;
  professional: VisibilitySearchPreferences;
};

/** Normalized foreground location permission (no native calls here). */
export type ForegroundPermissionStatus =
  | 'undetermined'
  | 'granted'
  | 'denied'
  | 'restricted';

/** Coarse location availability for client orchestration (pure). */
export type LocationAvailability =
  | { status: 'missing' }
  | { status: 'invalid'; reason: 'accuracy' | 'coords' | 'incomplete' }
  | { status: 'stale'; confirmedAt: number }
  | { status: 'fresh'; confirmedAt: number };

/** Sync lifecycle for remote Visibility state (pure label; no I/O). */
export type VisibilitySyncStatus =
  | 'idle'
  | 'pending'
  | 'synced'
  | 'error';

export type ValidationOk = { ok: true };
export type ValidationFail = { ok: false; reasons: readonly string[] };
export type ValidationResult = ValidationOk | ValidationFail;

/** Result of sanitizing + validating prefs before a users/{uid} write. */
export type PreparedSearchPreferences =
  | { ok: true; prefs: VisibilitySearchPreferences }
  | { ok: false; reasons: readonly string[] };

/**
 * Discriminated Visibility client states — UI-agnostic.
 * Impossible combinations are avoided by using a single `kind` discriminant.
 */
export type VisibilityClientState =
  | { kind: 'loading' }
  | { kind: 'inactive' }
  | { kind: 'activating' }
  | { kind: 'active'; confirmedAt: number }
  | { kind: 'deactivating' }
  | { kind: 'permissionNotDetermined' }
  | { kind: 'permissionDenied' }
  | { kind: 'permissionRestricted' }
  | { kind: 'obtainingLocation' }
  | { kind: 'locationUnavailable' }
  | { kind: 'locationStale'; confirmedAt: number }
  | { kind: 'backgroundPermissionUnavailable' }
  | { kind: 'synchronizationError'; code?: string }
  | { kind: 'offline' };

/** Minimal local candidate shape for pure sort/filter helpers (non-authoritative). */
export type LocalDiscoveryCandidate = {
  uid: string;
  distanceMeters: number;
  ageYears?: number | null;
  interestIds?: readonly string[];
};
