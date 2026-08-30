/**
 * Pure geometry for AlignmentScoreRing progress arcs.
 * Score is authoritative (0–100); UI never invents tiers or rounds 66→100.
 */

export type AlignmentRingGeometry = {
  /** Clamped integer score 0–100. */
  score: number;
  /** Exact progress arc in degrees: score * 3.6 */
  totalDegrees: number;
  /** Progress painted by the first half-clip (0–180). */
  firstHalfDegrees: number;
  /** Progress painted by the second half-clip (0–180). */
  secondHalfDegrees: number;
  /** Degrees of gray track that must remain visible. */
  trackRemainingDegrees: number;
  isEmpty: boolean;
  isFull: boolean;
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
  // Derive second half from score remainder so 66 → 57.6 exactly (not 237.6 - 180 float noise).
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
