import { createContext } from 'react';

/** Compatibility of the profile on screen, for analytics; undefined when unknown. */
export const DiscoveryProfileScoreContext = createContext<number | undefined>(undefined);
