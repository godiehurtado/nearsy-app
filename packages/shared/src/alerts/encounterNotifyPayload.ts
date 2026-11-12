/**
 * Encounter-notify push payload (Functions #40).
 * Binary-compatible with kind=contact_nearby + actorUid on current Play binaries.
 */

/**
 * Why the server notified (Functions contract). `unknown` is a motive this
 * binary does not know yet: the push is still received and opens the profile.
 */
export type EncounterNotifyMotive =
  | 'interest'
  | 'contact'
  | 'both'
  | 'affiliation'
  | 'contact_affiliation'
  /** Industry contract §3: same industry, both professional; beats every other motive. */
  | 'industry'
  | 'unknown';

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
  'affiliation',
  'contact_affiliation',
  'industry',
];

/** Motives that include the contacts signal. */
const CONTACT_MOTIVES: readonly EncounterNotifyMotive[] = [
  'contact',
  'both',
  'contact_affiliation',
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
 * A missing motive falls back: fromContacts true → contact, else interest.
 * A motive this binary does not know is `unknown`, never a parse failure.
 */
export function parseEncounterNotifyPayload(
  data: unknown,
): EncounterNotifyPayload | null {
  const row = asRecord(data);
  if (!row) return null;
  if (row.kind !== 'contact_nearby') return null;
  if (typeof row.actorUid !== 'string' || !row.actorUid.trim()) return null;
  const motive: EncounterNotifyMotive =
    parseEncounterNotifyMotive(row.motive) ??
    (typeof row.motive === 'string' && row.motive.trim()
      ? 'unknown'
      : row.fromContacts === true
        ? 'contact'
        : 'interest');
  return {
    kind: 'contact_nearby',
    actorUid: row.actorUid.trim(),
    ...(typeof row.actorName === 'string' && row.actorName.trim()
      ? { actorName: row.actorName.trim() }
      : {}),
    fromContacts: row.fromContacts === true || CONTACT_MOTIVES.includes(motive),
    motive,
  };
}

/** Copy key per motive; `generic` when the motive is not known. */
export function encounterNotifyCopyKey(
  motive: EncounterNotifyMotive,
): Exclude<EncounterNotifyMotive, 'unknown'> | 'generic' {
  return motive === 'unknown' ? 'generic' : motive;
}
