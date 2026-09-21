/**
 * Local-only background-location education preferences (ENH-LOC-01).
 * Never written to Firestore.
 */

export const BG_LOCATION_EDUCATION_FULL_SEEN_KEY =
  'NEARSY_BG_LOCATION_EDUCATION_FULL_SEEN' as const;

export type EducationStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type BackgroundEducationVariant = 'full' | 'brief';

export async function hasSeenFullBackgroundEducation(
  storage: EducationStorage,
): Promise<boolean> {
  const raw = await storage.getItem(BG_LOCATION_EDUCATION_FULL_SEEN_KEY);
  return raw === '1';
}

export async function markFullBackgroundEducationSeen(
  storage: EducationStorage,
): Promise<void> {
  await storage.setItem(BG_LOCATION_EDUCATION_FULL_SEEN_KEY, '1');
}

/**
 * Full education on first journey after FG grant; brief on later More retries
 * once the full sheet has been shown.
 */
export async function resolveBackgroundEducationVariant(
  storage: EducationStorage,
): Promise<BackgroundEducationVariant> {
  return (await hasSeenFullBackgroundEducation(storage)) ? 'brief' : 'full';
}

export type BackgroundOfferDecision =
  | { offer: false; reason: 'already-configured' | 'background-granted' }
  | { offer: true; variant: BackgroundEducationVariant };

/**
 * Whether to present background education before requesting Always.
 * Skip when Always is already granted (configured or OS-level).
 */
export async function decideBackgroundEducationOffer(input: {
  storage: EducationStorage;
  backgroundGranted: boolean;
  bgVisible: boolean;
}): Promise<BackgroundOfferDecision> {
  if (input.backgroundGranted && input.bgVisible) {
    return { offer: false, reason: 'already-configured' };
  }
  if (input.backgroundGranted) {
    return { offer: false, reason: 'background-granted' };
  }
  return {
    offer: true,
    variant: await resolveBackgroundEducationVariant(input.storage),
  };
}
