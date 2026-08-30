/**
 * Pure geometry for AlignmentScoreRing (tests + SVG dash metrics).
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
  firstHalfDegrees: number;
  secondHalfDegrees: number;
  trackRemainingDegrees: number;
  isEmpty: boolean;
  isFull: boolean;
};

export type AlignmentRingSvgMetrics = AlignmentRingGeometry & {
  center: number;
  radius: number;
  strokeWidth: number;
  circumference: number;
  /** progressLength = circumference * (score / 100) */
  progressLength: number;
  /** remainingLength = circumference - progressLength */
  remainingLength: number;
  /**
   * SVG strokeDashoffset for dasharray `${circumference} ${circumference}`:
   * circumference * (1 - score / 100)
   */
  strokeDashoffset: number;
};

function clampAlignmentScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Semantic geometry for an integer alignment score (tests / degrees).
 * 66 → 237.6° blue / 122.4° track — never a full circle.
 */
export function computeAlignmentRingGeometry(
  score: number,
): AlignmentRingGeometry {
  const clamped = clampAlignmentScore(score);
  const totalDegrees = (clamped * 360) / 100;
  const firstHalfDegrees = Math.min(totalDegrees, 180);
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
 * SVG dash metrics — dash is computed directly from score (not half-clips).
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
  const strokeDashoffset = circumference * (1 - geometry.score / 100);
  return {
    ...geometry,
    center,
    radius,
    strokeWidth,
    circumference,
    progressLength,
    remainingLength,
    strokeDashoffset,
  };
}
