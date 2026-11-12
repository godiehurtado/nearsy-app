import { updateUserProfilePartial } from '../services/firestoreService';
import { scheduleReevaluateProximityNotices } from '../alerts/reevaluateProximityNotices';
import { buildProfessionalIndustryPatch } from './industryProfileWrite.ts';

/**
 * Saves the professional industry, then asks Functions to reevaluate
 * proximity notices (contract §5). Rejects on a failed write.
 */
export async function saveProfessionalIndustry(uid: string, id: string | null): Promise<void> {
  await updateUserProfilePartial(uid, buildProfessionalIndustryPatch(id));
  scheduleReevaluateProximityNotices();
}
