/**
 * Encounter-notify push payload (Functions #40, motives extended by the
 * approved affiliation contract).
 * Binary-compatible with kind=contact_nearby + actorUid on current binaries.
 */

export type EncounterNotifyMotive =
  | 'interest'
  | 'contact'
  | 'both'
  | 'affiliation'
  | 'contact_affiliation';

export type EncounterNotifyPayload = {
  kind: 'contact_nearby';
  actorUid: string;
  actorName?: string;
  fromContacts: boolean;
  /** Absent when the payload names a motive this binary does not know. */
  motive?: EncounterNotifyMotive;
};

export const ENCOUNTER_NOTIFY_MOTIVES: readonly EncounterNotifyMotive[] = [
  'interest',
  'contact',
  'both',
  'affiliation',
  'contact_affiliation',
];

const CONTACT_MOTIVES: ReadonlySet<EncounterNotifyMotive> = new Set([
  'contact',
  'both',
  'contact_affiliation',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseEncounterNotifyMotive(
  value: unknown,
): EncounterNotifyMotive | null {
  if (typeof value !== 'string') return null;
  return ENCOUNTER_NOTIFY_MOTIVES.includes(value as EncounterNotifyMotive)
    ? (value as EncounterNotifyMotive)
    : null;
}

/**
 * One notification. Motive is optional; fromContacts remains for old payloads.
 * - Known motive: used as is.
 * - No motive (old payloads): fromContacts true → contact, else interest.
 * - A motive this binary does not know: left out, never guessed. The tap still
 *   opens the profile; only the motive is unknown.
 */
export function parseEncounterNotifyPayload(
  data: unknown,
): EncounterNotifyPayload | null {
  const row = asRecord(data);
  if (!row) return null;
  if (row.kind !== 'contact_nearby') return null;
  if (typeof row.actorUid !== 'string' || !row.actorUid.trim()) return null;
  const known = parseEncounterNotifyMotive(row.motive);
  const motive: EncounterNotifyMotive | undefined =
    known ??
    (row.motive === undefined || row.motive === null
      ? row.fromContacts === true
        ? 'contact'
        : 'interest'
      : undefined);
  return {
    kind: 'contact_nearby',
    actorUid: row.actorUid.trim(),
    ...(typeof row.actorName === 'string' && row.actorName.trim()
      ? { actorName: row.actorName.trim() }
      : {}),
    fromContacts:
      row.fromContacts === true || (motive !== undefined && CONTACT_MOTIVES.has(motive)),
    ...(motive ? { motive } : {}),
  };
}
