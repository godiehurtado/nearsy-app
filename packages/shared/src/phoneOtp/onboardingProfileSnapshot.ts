import {
  birthDateToIso,
  birthPartsFromIso,
  localDateToBirthParts,
} from '../utils/birthDate.ts';
import type { OnboardingProfileSnapshot } from './onboardingResolver.ts';

function toLocalDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    if (date && !Number.isNaN(date.getTime())) return date;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  return null;
}

export function normalizeBirthDateIsoValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return birthPartsFromIso(trimmed) ? trimmed : null;
  }

  const date = toLocalDate(value);
  if (!date) return null;

  const parts = localDateToBirthParts(date);
  return birthDateToIso(parts);
}

export function normalizeOnboardingProfileSnapshot(
  profile: unknown,
): OnboardingProfileSnapshot {
  const raw = (profile ?? {}) as Record<string, unknown>;
  const birthDate = normalizeBirthDateIsoValue(raw.birthDate);

  return {
    profileSetupCompleted:
      raw.profileSetupCompleted === true ? true : undefined,
    birthDate: birthDate ?? undefined,
    birthYear:
      typeof raw.birthYear === 'number' && Number.isFinite(raw.birthYear)
        ? raw.birthYear
        : birthDate
          ? Number(birthDate.slice(0, 4))
          : undefined,
    phoneVerified: raw.phoneVerified === true ? true : undefined,
  };
}

export function mergeOnboardingProfileSnapshots(
  base: unknown,
  overlay: unknown,
): OnboardingProfileSnapshot {
  const baseRaw = base && typeof base === 'object' ? base : {};
  const overlayRaw = overlay && typeof overlay === 'object' ? overlay : {};
  return normalizeOnboardingProfileSnapshot({
    ...baseRaw,
    ...overlayRaw,
  });
}
