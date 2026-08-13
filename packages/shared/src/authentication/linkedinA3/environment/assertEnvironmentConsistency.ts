/**
 * Fail-fast environment consistency checks (sanitized — no secrets in messages).
 */

import {
  FUNCTIONS_REGION,
  isDebugAppCheckAllowed,
  type AppCheckProviderKind,
  type NearsyFirebaseEnvironmentName,
} from './nearsyFirebaseEnvironment';

export type EnvironmentConsistencyInput = {
  environment: NearsyFirebaseEnvironmentName;
  expectedProjectId: string;
  nativeProjectId: string | null | undefined;
  jsProjectId: string | null | undefined;
  functionsRegion: string | null | undefined;
  appCheckProvider: AppCheckProviderKind;
};

export type EnvironmentConsistencyResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function normalizeProjectId(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function assertEnvironmentConsistency(
  input: EnvironmentConsistencyInput,
): EnvironmentConsistencyResult {
  const expected = normalizeProjectId(input.expectedProjectId);
  const native = normalizeProjectId(input.nativeProjectId);
  const js = normalizeProjectId(input.jsProjectId);
  const region = String(input.functionsRegion ?? '').trim();

  if (!expected) {
    return {
      ok: false,
      code: 'ENV_EXPECTED_PROJECT_MISSING',
      message: 'Expected Firebase project id is missing.',
    };
  }

  if (!native) {
    return {
      ok: false,
      code: 'ENV_NATIVE_PROJECT_MISSING',
      message: 'Native Firebase project id is missing.',
    };
  }

  if (!js) {
    return {
      ok: false,
      code: 'ENV_JS_PROJECT_MISSING',
      message: 'Firebase JS project id is missing.',
    };
  }

  if (native !== expected) {
    return {
      ok: false,
      code: 'ENV_NATIVE_PROJECT_MISMATCH',
      message: 'Native Firebase project does not match the selected environment.',
    };
  }

  if (js !== expected) {
    return {
      ok: false,
      code: 'ENV_JS_PROJECT_MISMATCH',
      message:
        'Firebase JS project does not match the selected environment.',
    };
  }

  if (native !== js) {
    return {
      ok: false,
      code: 'ENV_PROJECT_CROSS_MISMATCH',
      message: 'Native and Firebase JS projects must match.',
    };
  }

  if (region !== FUNCTIONS_REGION) {
    return {
      ok: false,
      code: 'ENV_FUNCTIONS_REGION_INVALID',
      message: `Functions region must be ${FUNCTIONS_REGION}.`,
    };
  }

  if (
    input.appCheckProvider === 'debug' &&
    !isDebugAppCheckAllowed(input.environment)
  ) {
    return {
      ok: false,
      code: 'ENV_DEBUG_APP_CHECK_FORBIDDEN',
      message: 'App Check Debug Provider is forbidden outside development.',
    };
  }

  return { ok: true };
}
