import type { LocationObjectCoords } from 'expo-location';

export function locationAccuracyFromCoords(
  coords?: Pick<LocationObjectCoords, 'accuracy'>,
): number | undefined {
  const accuracy = coords?.accuracy;
  return typeof accuracy === 'number' && Number.isFinite(accuracy)
    ? accuracy
    : undefined;
}

export function buildLocationPayload(
  lat: number,
  lng: number,
  coords?: Pick<LocationObjectCoords, 'accuracy'>,
) {
  const now = Date.now();
  const accuracy = locationAccuracyFromCoords(coords);

  return {
    location: {
      lat,
      lng,
      ...(accuracy != null ? { accuracy } : {}),
      updatedAt: now,
    },
    updatedAt: now,
  };
}
