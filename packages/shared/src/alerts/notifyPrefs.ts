/**
 * Encounter-notify preference defaults (Functions #40).
 * Missing notifyNearbyInterests → true (including existing accounts).
 * contactsSyncEnabled missing → false (Identity-owned).
 * notifyNearbyContacts is true only after sync is on, unless explicitly false.
 */

export function resolveNotifyNearbyInterests(value: unknown): boolean {
  return value !== false;
}

/** Industry contract §2: absent → true; only an explicit false turns it off. */
export function resolveNotifyNearbyIndustry(value: unknown): boolean {
  return value !== false;
}

export function resolveContactsSyncEnabled(value: unknown): boolean {
  return value === true;
}

export function resolveNotifyNearbyContacts(input: {
  contactsSyncEnabled?: unknown;
  notifyNearbyContacts?: unknown;
}): boolean {
  if (!resolveContactsSyncEnabled(input.contactsSyncEnabled)) return false;
  return input.notifyNearbyContacts !== false;
}

export type EncounterNotifyPrefsPatch = {
  notifyNearbyInterests?: boolean;
  notifyNearbyContacts?: boolean;
  notifyNearbyIndustry?: boolean;
};

export function buildNotifyNearbyInterestsPatch(
  enabled: boolean,
): EncounterNotifyPrefsPatch {
  return { notifyNearbyInterests: enabled };
}

/** Written only when the person toggles it, never at sign-up. */
export function buildNotifyNearbyIndustryPatch(
  enabled: boolean,
): EncounterNotifyPrefsPatch {
  return { notifyNearbyIndustry: enabled };
}

/** Mute without deleting Identity hashes / sources. */
export function buildNotifyNearbyContactsMutePatch(
  enabled: boolean,
): EncounterNotifyPrefsPatch {
  return { notifyNearbyContacts: enabled };
}
