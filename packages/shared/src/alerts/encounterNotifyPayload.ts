/**
 * Encounter-notify push payload (Functions #40).
 * Binary-compatible with kind=contact_nearby + actorUid on current binaries.
 */

export type EncounterNotifyMotive = 'interest' | 'contact' | 'both';

export type EncounterNotifyPayload = {
  kind: 'contact_nearby';
  actorUid: string;
  actorName?: string;
  fromContacts: boolean;
  motive: EncounterNotifyMotive;
};

const MOTIVES: readonly EncounterNotifyMotive[] = [
  'interest',
  'contact',
  'both',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseEncounterNotifyMotive(
  value: unknown,
): EncounterNotifyMotive | null {
  if (typeof value !== 'string') return null;
  return MOTIVES.includes(value as EncounterNotifyMotive)
    ? (value as EncounterNotifyMotive)
    : null;
}

/**
 * One notification. Motive is optional; fromContacts remains for old payloads.
 * Missing/invalid motive falls back: fromContacts true → contact, else interest.
 */
export function parseEncounterNotifyPayload(
  data: unknown,
): EncounterNotifyPayload | null {
  const row = asRecord(data);
  if (!row) return null;
  if (row.kind !== 'contact_nearby') return null;
  if (typeof row.actorUid !== 'string' || !row.actorUid.trim()) return null;
  const motive =
    parseEncounterNotifyMotive(row.motive) ??
    (row.fromContacts === true ? 'contact' : 'interest');
  return {
    kind: 'contact_nearby',
    actorUid: row.actorUid.trim(),
    ...(typeof row.actorName === 'string' && row.actorName.trim()
      ? { actorName: row.actorName.trim() }
      : {}),
    fromContacts:
      row.fromContacts === true || motive === 'contact' || motive === 'both',
    motive,
  };
}
