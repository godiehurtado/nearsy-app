import { Platform } from 'react-native';

import { getTiktokOwnershipClient } from './iosTiktokOwnershipFoundation';

export type TiktokOwnershipConnectedByMode = {
  personal: boolean;
  professional: boolean;
};

/**
 * Mode-scoped Get for Own Profile social summary counts.
 * Fail-soft: non-iOS and callable errors return both false.
 */
export async function resolveTiktokOwnershipConnectedByMode(): Promise<TiktokOwnershipConnectedByMode> {
  if (Platform.OS !== 'ios') {
    return { personal: false, professional: false };
  }
  try {
    const client = await getTiktokOwnershipClient();
    const [personal, professional] = await Promise.all([
      client.get('personal'),
      client.get('professional'),
    ]);
    return {
      personal: personal.result === 'verified',
      professional: professional.result === 'verified',
    };
  } catch {
    return { personal: false, professional: false };
  }
}
