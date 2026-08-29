/**
 * Discovery profile compatibility (Matching V1) — defensive client parsing.
 * Never surfaces vectors, cosines, provider/model, cache keys, or job internals.
 */

export const DISCOVERY_COMPATIBILITY_FORMULA_VERSION = '1' as const;

export type DiscoveryCompatibilityFormulaVersion =
  typeof DISCOVERY_COMPATIBILITY_FORMULA_VERSION;

/** V1 unavailable reasons — diagnostic only; never render in UI. */
export type DiscoveryCompatibilityUnavailableReason =
  | 'embeddings-missing'
  | 'embeddings-pending'
  | 'embeddings-failed'
  | 'embeddings-stale'
  | 'model-mismatch'
  | 'mode-mismatch'
  | 'mode-incomplete'
  | 'embedding-corrupt'
  | 'insufficient-comparable-dimensions';

export type DiscoveryCompatibilityAvailable = {
  available: true;
  score: number;
  formulaVersion: DiscoveryCompatibilityFormulaVersion;
};

export type DiscoveryCompatibilityUnavailable = {
  available: false;
  formulaVersion: DiscoveryCompatibilityFormulaVersion;
  /** Diagnostic only — never render in UI. */
  reason?: DiscoveryCompatibilityUnavailableReason;
};

export type DiscoveryCompatibility =
  | DiscoveryCompatibilityAvailable
  | DiscoveryCompatibilityUnavailable;

export const DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS: readonly DiscoveryCompatibilityUnavailableReason[] =
  [
    'embeddings-missing',
    'embeddings-pending',
    'embeddings-failed',
    'embeddings-stale',
    'model-mismatch',
    'mode-mismatch',
    'mode-incomplete',
    'embedding-corrupt',
    'insufficient-comparable-dimensions',
  ] as const;

const KNOWN_REASONS = new Set<string>(
  DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS,
);

/** Keys that must never enter the client UI contract from compatibility payloads. */
export const FORBIDDEN_DISCOVERY_COMPATIBILITY_KEYS = [
  'vector',
  'vectors',
  'values',
  'cosine',
  'cosines',
  'cosinesSample',
  'cacheKey',
  'sourceTextHash',
  'bagSourceHash',
  'provider',
  'model',
  'dimensionScores',
  'diagnostics',
  'rawWeighted',
  'modelText',
  'keyText',
  'manifest',
  'manifests',
  'job',
  'jobs',
  'hashes',
  'hash',
] as const;

const UNAVAILABLE_SAFE: DiscoveryCompatibilityUnavailable = {
  available: false,
  formulaVersion: DISCOVERY_COMPATIBILITY_FORMULA_VERSION,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasForbiddenCompatibilityKeys(value: Record<string, unknown>): boolean {
  for (const key of Object.keys(value)) {
    if (
      (FORBIDDEN_DISCOVERY_COMPATIBILITY_KEYS as readonly string[]).includes(key)
    ) {
      return true;
    }
  }
  return false;
}

function parseUnavailableReason(
  value: unknown,
): DiscoveryCompatibilityUnavailableReason | undefined {
  if (typeof value !== 'string' || !KNOWN_REASONS.has(value)) {
    return undefined;
  }
  return value as DiscoveryCompatibilityUnavailableReason;
}

function parseAvailableCompatibility(
  value: Record<string, unknown>,
): DiscoveryCompatibility {
  const score = value.score;
  if (
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 100
  ) {
    return UNAVAILABLE_SAFE;
  }
  if (value.reason !== undefined && value.reason !== null) {
    return UNAVAILABLE_SAFE;
  }
  return {
    available: true,
    score,
    formulaVersion: DISCOVERY_COMPATIBILITY_FORMULA_VERSION,
  };
}

function parseUnavailableCompatibility(
  value: Record<string, unknown>,
): DiscoveryCompatibilityUnavailable {
  const reason = parseUnavailableReason(value.reason);
  if (reason) {
    return {
      available: false,
      formulaVersion: DISCOVERY_COMPATIBILITY_FORMULA_VERSION,
      reason,
    };
  }
  return UNAVAILABLE_SAFE;
}

/**
 * Parse optional `compatibility` from getDiscoveryProfile.
 * - absent → undefined (rollout-safe; caller may hide UI)
 * - invalid → unavailable (never fails the profile response)
 */
export function parseDiscoveryCompatibility(
  value: unknown,
): DiscoveryCompatibility | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    return UNAVAILABLE_SAFE;
  }
  if (hasForbiddenCompatibilityKeys(value)) {
    return UNAVAILABLE_SAFE;
  }
  if (value.formulaVersion !== DISCOVERY_COMPATIBILITY_FORMULA_VERSION) {
    return UNAVAILABLE_SAFE;
  }
  if (value.available === true) {
    return parseAvailableCompatibility(value);
  }
  if (value.available === false) {
    return parseUnavailableCompatibility(value);
  }
  return UNAVAILABLE_SAFE;
}
