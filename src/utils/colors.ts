// utils/colors.ts
export function adjustColor(hex: string, amount: number): string {
  const clean = (hex || '#3B5A85').replace('#', '');
  const r = Math.min(
    255,
    Math.max(0, parseInt(clean.substring(0, 2), 16) + amount),
  );
  const g = Math.min(
    255,
    Math.max(0, parseInt(clean.substring(2, 4), 16) + amount),
  );
  const b = Math.min(
    255,
    Math.max(0, parseInt(clean.substring(4, 6), 16) + amount),
  );
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
