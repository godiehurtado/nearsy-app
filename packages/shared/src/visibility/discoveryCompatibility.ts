/**
 * Discovery wire `compatibility` parsing (Matching V1 + Alignment M4A).
 * UI consumes {@link toAlignment}; never surfaces vectors, cosines, or job internals.
 */

export const DISCOVERY_COMPATIBILITY_FORMULA_VERSION = '1' as const;
export const ALIGNMENT_VERSION = '1' as const;

export type DiscoveryCompatibilityFormulaVersion =
  typeof DISCOVERY_COMPATIBILITY_FORMULA_VERSION;

export type AlignmentVersion = typeof ALIGNMENT_VERSION;

/** Backend authority — iOS never derives tiers from score thresholds. */
export type AlignmentTier = 'weak' | 'partial' | 'strong' | 'full';

export const ALIGNMENT_TIERS: readonly AlignmentTier[] = [
  'weak',
  'partial',
  'strong',
  'full',
] as const;

const VALID_TIERS = new Set<string>(ALIGNMENT_TIERS);

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
  /** Present only when backend sent valid M4A tier metadata. */
  alignmentVersion?: AlignmentVersion;
  alignmentTier?: AlignmentTier;
};

export type DiscoveryCompatibilityUnavailable = {
  available: false;
  formulaVersion: DiscoveryCompatibilityFormulaVersion;
  alignmentVersion?: AlignmentVersion;
  /** Diagnostic only — never render in UI. */
  reason?: DiscoveryCompatibilityUnavailableReason;
};

export type DiscoveryCompatibility =
  | DiscoveryCompatibilityAvailable
  | DiscoveryCompatibilityUnavailable;

/** UI-facing Alignment model (non-breaking alias over wire compatibility). */
export type AlignmentAvailable = {
  available: true;
  score: number;
  tier?: AlignmentTier;
};

export type AlignmentUnavailable = {
  available: false;
};

export type Alignment = AlignmentAvailable | AlignmentUnavailable;

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

function parseAlignmentTier(value: unknown): AlignmentTier | undefined {
  if (typeof value !== 'string' || !VALID_TIERS.has(value)) {
    return undefined;
  }
  return value as AlignmentTier;
}

function parseAlignmentMetadata(
  value: Record<string, unknown>,
): Pick<DiscoveryCompatibilityAvailable, 'alignmentTier' | 'alignmentVersion'> {
  const alignmentVersion =
    value.alignmentVersion === ALIGNMENT_VERSION
      ? ALIGNMENT_VERSION
      : undefined;
  if (!alignmentVersion) {
    return {};
  }
  const alignmentTier = parseAlignmentTier(value.alignmentTier);
  if (!alignmentTier) {
    return { alignmentVersion };
  }
  return { alignmentVersion, alignmentTier };
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
  const meta = parseAlignmentMetadata(value);
  return {
    available: true,
    score,
    formulaVersion: DISCOVERY_COMPATIBILITY_FORMULA_VERSION,
    ...meta,
  };
}

function parseUnavailableCompatibility(
  value: Record<string, unknown>,
): DiscoveryCompatibilityUnavailable {
  const reason = parseUnavailableReason(value.reason);
  const alignmentVersion =
    value.alignmentVersion === ALIGNMENT_VERSION
      ? ALIGNMENT_VERSION
      : undefined;
  if (reason) {
    return {
      available: false,
      formulaVersion: DISCOVERY_COMPATIBILITY_FORMULA_VERSION,
      ...(alignmentVersion ? { alignmentVersion } : {}),
      reason,
    };
  }
  return {
    available: false,
    formulaVersion: DISCOVERY_COMPATIBILITY_FORMULA_VERSION,
    ...(alignmentVersion ? { alignmentVersion } : {}),
  };
}

/**
 * Parse optional wire `compatibility`.
 * - absent → undefined (rollout-safe)
 * - invalid score/formula → unavailable (never fails parent DTO)
 * - invalid tier/version on available → score preserved, tier omitted
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

/** Map wire compatibility to UI Alignment (never invents tiers). */
export function toAlignment(
  compatibility: DiscoveryCompatibility | undefined,
): Alignment | undefined {
  if (compatibility === undefined) {
    return undefined;
  }
  if (!compatibility.available) {
    return { available: false };
  }
  return {
    available: true,
    score: compatibility.score,
    tier: compatibility.alignmentTier,
  };
}

/** Nearby list: only surface score ring when alignment is available. */
export function compatibilityForNearbyList(
  value: unknown,
): DiscoveryCompatibilityAvailable | undefined {
  const parsed = parseDiscoveryCompatibility(value);
  if (!parsed?.available) {
    return undefined;
  }
  return parsed;
}
