/**
 * Identity Functions region for LinkedIn A3 callables.
 * Must match nearsy-identity-functions `FUNCTIONS_REGION`.
 */
export const IDENTITY_FUNCTIONS_REGION = 'us-central1' as const;

export type IdentityFunctionsRegion = typeof IDENTITY_FUNCTIONS_REGION;
