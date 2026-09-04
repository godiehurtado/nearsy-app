/**
 * Distance / unit conversion — pure (V3.0.1).
 * Region/unit is always a parameter; no locale APIs.
 */

import {
  CANONICAL_DISTANCE_EPSILON_METERS,
  DEFAULT_METRIC_DISTANCE_METERS,
  DEFAULT_US_DISTANCE_METERS,
  DISTANCE_STEP_FEET,
  DISTANCE_STEP_METERS,
  FEET_PER_METER,
  MAX_DISTANCE_FEET,
  MAX_DISTANCE_METERS,
  MAX_DISTANCE_METERS_UI,
  MIN_DISTANCE_FEET,
  MIN_DISTANCE_METERS,
  MIN_DISTANCE_METERS_UI,
} from './constants';
import type { DistanceDisplayUnit } from './types';

export function feetToMeters(feet: number): number {
  return feet / FEET_PER_METER;
}

export function metersToFeet(meters: number): number {
  return meters * FEET_PER_METER;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Snap to nearest multiple of `step` (ties toward +∞ via Math.round). */
export function snapToStep(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) return value;
  return Math.round(value / step) * step;
}

export function snapFeetForUi(feet: number): number {
  return clamp(
    snapToStep(feet, DISTANCE_STEP_FEET),
    MIN_DISTANCE_FEET,
    MAX_DISTANCE_FEET,
  );
}

export function snapMetersForUi(meters: number): number {
  return clamp(
    snapToStep(meters, DISTANCE_STEP_METERS),
    MIN_DISTANCE_METERS_UI,
    MAX_DISTANCE_METERS_UI,
  );
}

export function clampCanonicalDistanceMeters(meters: number): number {
  return clamp(meters, MIN_DISTANCE_METERS, MAX_DISTANCE_METERS);
}

export function isCanonicalDistanceInRange(meters: number): boolean {
  return (
    Number.isFinite(meters) &&
    meters >= MIN_DISTANCE_METERS &&
    meters <= MAX_DISTANCE_METERS
  );
}

/** Default canonical meters for a presentation unit (first prefs creation). */
export function defaultCanonicalDistanceMeters(
  unit: DistanceDisplayUnit,
): number {
  return unit === 'ft'
    ? DEFAULT_US_DISTANCE_METERS
    : DEFAULT_METRIC_DISTANCE_METERS;
}

/**
 * Present canonical meters for a UI control (snap + clamp in display units).
 */
export function presentDistanceFromCanonical(
  canonicalMeters: number,
  unit: DistanceDisplayUnit,
): number {
  if (unit === 'ft') {
    return snapFeetForUi(metersToFeet(canonicalMeters));
  }
  return snapMetersForUi(canonicalMeters);
}

/**
 * Convert a UI control value (already in display units) to canonical meters.
 * Applies snap + clamp in display space, then converts.
 */
export function canonicalFromDisplayDistance(
  displayValue: number,
  unit: DistanceDisplayUnit,
): number {
  if (unit === 'ft') {
    return clampCanonicalDistanceMeters(feetToMeters(snapFeetForUi(displayValue)));
  }
  return clampCanonicalDistanceMeters(snapMetersForUi(displayValue));
}

export function canonicalDistancesEqual(
  a: number,
  b: number,
  epsilonMeters: number = CANONICAL_DISTANCE_EPSILON_METERS,
): boolean {
  return Math.abs(a - b) <= epsilonMeters;
}

export function hasCanonicalDistanceChanged(
  previousCanonicalMeters: number,
  nextCanonicalMeters: number,
  epsilonMeters: number = CANONICAL_DISTANCE_EPSILON_METERS,
): boolean {
  return !canonicalDistancesEqual(
    previousCanonicalMeters,
    nextCanonicalMeters,
    epsilonMeters,
  );
}

/**
 * Close a distance editor without a user gesture: keep previous canonical
 * when reconversion stays within CANONICAL_DISTANCE_EPSILON_METERS.
 */
export function resolveCanonicalAfterDisplayClose(
  previousCanonicalMeters: number,
  displayValue: number,
  unit: DistanceDisplayUnit,
): number {
  const next = canonicalFromDisplayDistance(displayValue, unit);
  if (!hasCanonicalDistanceChanged(previousCanonicalMeters, next)) {
    return previousCanonicalMeters;
  }
  return next;
}
