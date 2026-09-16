/**
 * Fabric rejects style updates that set `transform` to null/undefined.
 * Only return a transform object when pressed with a finite scale.
 */

export const DEFAULT_PRESS_SCALE = 0.975;

export type PressTransformStyle =
  | { transform: [{ scale: number }] }
  | Record<string, never>;

export function pressTransformStyle(
  pressed: boolean,
  scale: number = DEFAULT_PRESS_SCALE,
): PressTransformStyle {
  if (!pressed) return {};
  if (!Number.isFinite(scale)) return {};
  return { transform: [{ scale }] };
}

/** Pure guard used by tests — true when a style object assigns transform: null. */
export function styleAssignsNullTransform(
  style: Record<string, unknown> | null | undefined,
): boolean {
  if (!style || typeof style !== 'object') return false;
  return (
    Object.prototype.hasOwnProperty.call(style, 'transform') &&
    style.transform === null
  );
}
