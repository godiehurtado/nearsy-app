/**
 * Android: regional Firebase Functions client for Nearsy identity callables.
 * Does not invoke any callable. Region is always explicit (us-central1).
 */
import { getApp } from '@react-native-firebase/app';
import { getFunctions } from '@react-native-firebase/functions';
import {
  IDENTITY_FUNCTIONS_REGION,
  type IdentityFunctionsRegion,
} from './identityFunctionsRegion';

export { IDENTITY_FUNCTIONS_REGION };
export type { IdentityFunctionsRegion };

/** Returns the Functions instance pinned to the identity backend region. */
export function getIdentityFunctions() {
  return getFunctions(getApp(), IDENTITY_FUNCTIONS_REGION);
}

export function getIdentityFunctionsRegion(): IdentityFunctionsRegion {
  return IDENTITY_FUNCTIONS_REGION;
}
