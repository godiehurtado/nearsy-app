/**
 * Non-Android fallback — identity Functions client is Android A3.4 scope.
 * Importing must not perform network I/O.
 */
import {
  IDENTITY_FUNCTIONS_REGION,
  type IdentityFunctionsRegion,
} from './identityFunctionsRegion';

export { IDENTITY_FUNCTIONS_REGION };
export type { IdentityFunctionsRegion };

export function getIdentityFunctions(): never {
  throw new Error(
    'getIdentityFunctions is only available on Android in A3.4.',
  );
}

export function getIdentityFunctionsRegion(): IdentityFunctionsRegion {
  return IDENTITY_FUNCTIONS_REGION;
}
