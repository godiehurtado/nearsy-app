export function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapValue(value: number, min: number, step: number): number {
  if (step <= 0) return value;
  return min + Math.round((value - min) / step) * step;
}

export function valueToRatio(
  value: number,
  min: number,
  max: number,
): number {
  if (max <= min) return 0;
  return clampValue((value - min) / (max - min), 0, 1);
}

export function ratioToValue(
  ratio: number,
  min: number,
  max: number,
  step: number,
): number {
  const raw = min + ratio * (max - min);
  return clampValue(snapValue(raw, min, step), min, max);
}
