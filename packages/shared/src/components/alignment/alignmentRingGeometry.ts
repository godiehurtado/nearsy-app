/**
 * Pure geometry for AlignmentScoreRing progress arcs.
 * Score is authoritative (0–100); UI never invents tiers or rounds 66→100.
 */

/** Fixed square sizes — do not flex or scale with Dynamic Type. */
export const ALIGNMENT_RING_DETAIL_SIZE = 76;
export const ALIGNMENT_RING_COMPACT_SIZE = 48;
export const ALIGNMENT_RING_DETAIL_STROKE = 7;
export const ALIGNMENT_RING_COMPACT_STROKE = 4;

export type AlignmentRingGeometry = {
  /** Clamped integer score 0–100. */
  score: number;
  /** Exact progress arc in degrees: (score * 360) / 100 */
  totalDegrees: number;
  /** Progress in the first 180° sector (legacy half-metrics / tests). */
  firstHalfDegrees: number;
  /** Progress in the second 180° sector (legacy half-metrics / tests). */
  secondHalfDegrees: number;
  /** Degrees of gray track that must remain visible. */
  trackRemainingDegrees: number;
  isEmpty: boolean;
  isFull: boolean;
};

export type AlignmentRingSvgMetrics = AlignmentRingGeometry & {
  center: number;
  radius: number;
  strokeWidth: number;
  circumference: number;
  /** Arc length of the progress stroke. */
  progressLength: number;
  /** Arc length of the undrawn remainder (visible track). */
  remainingLength: number;
};

function clampAlignmentScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Authoritative ring geometry for an integer alignment score.
 * 66 → 237.6° blue / 122.4° track — never a full circle.
 */
export function computeAlignmentRingGeometry(
  score: number,
): AlignmentRingGeometry {
  const clamped = clampAlignmentScore(score);
  // Prefer (score * 360) / 100 over score * 3.6 to avoid float noise (66 → 237.6).
  const totalDegrees = (clamped * 360) / 100;
  const firstHalfDegrees = Math.min(totalDegrees, 180);
  // Derive second half from score remainder so 66 → 57.6 exactly.
  const secondHalfDegrees =
    clamped <= 50 ? 0 : ((clamped - 50) * 360) / 100;
  return {
    score: clamped,
    totalDegrees,
    firstHalfDegrees,
    secondHalfDegrees,
    trackRemainingDegrees: 360 - totalDegrees,
    isEmpty: clamped === 0,
    isFull: clamped === 100,
  };
}

/**
 * SVG stroke-dash metrics for a square ring of `size` with `strokeWidth`.
 * Track and progress share center + radius; progress length is proportional to score.
 */
export function computeAlignmentRingSvgMetrics(
  size: number,
  strokeWidth: number,
  score: number,
): AlignmentRingSvgMetrics {
  const geometry = computeAlignmentRingGeometry(score);
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressLength = circumference * (geometry.score / 100);
  const remainingLength = circumference - progressLength;
  return {
    ...geometry,
    center,
    radius,
    strokeWidth,
    circumference,
    progressLength,
    remainingLength,
  };
}
