import type { ProfileMode } from '../profile/profileModeFields';
import { firestoreDeleteField } from '../services/firestoreFieldDelete';
import { updateUserProfilePartial } from '../services/firestoreService';
import {
  buildManualSocialLinkWrite,
  type ManualSocialLinkId,
} from './manualSocialLinkCard';

export async function persistManualSocialLink(
  uid: string,
  mode: ProfileMode,
  field: ManualSocialLinkId,
  url: string | null,
): Promise<void> {
  await updateUserProfilePartial(
    uid,
    buildManualSocialLinkWrite(mode, field, url, firestoreDeleteField()),
  );
}
