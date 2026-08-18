/**
 * Firebase callable HTTP protocol for CRJ affiliation search.
 *
 * iOS Auth is Firebase JS SDK. RNFB Auth is intentionally shimmed, so
 * RNFB httpsCallable cannot attach request.auth. This helper sends:
 * - Authorization: Bearer <JS ID token>
 * - X-Firebase-AppCheck: <RNFB App Check token>
 * Tokens are never logged.
 */

import {
  AffiliationEntitySearchClientError,
  SEARCH_AFFILIATION_ENTITIES_FUNCTION,
  mapAffiliationSearchCallableError,
  type AffiliationEntitySearchRequest,
} from './affiliationEntitySearchContract';

export const AFFILIATION_CALLABLE_HTTP_PROJECT = 'nearsy-dev' as const;
export const AFFILIATION_CALLABLE_HTTP_REGION = 'us-central1' as const;

export type AffiliationCallableHttpDeps = {
  fetchImpl?: typeof fetch;
};

export function buildAffiliationSearchCallableUrl(
  projectId: string,
  region: string,
  functionName: string,
): string {
  const project = projectId.trim().toLowerCase();
  const regionNorm = region.trim().toLowerCase();
  const name = functionName.trim();
  if (project !== AFFILIATION_CALLABLE_HTTP_PROJECT) {
    throw new AffiliationEntitySearchClientError(
      'FAILED_PRECONDITION',
      'Affiliation search callable is Development / nearsy-dev only.',
    );
  }
  if (regionNorm !== AFFILIATION_CALLABLE_HTTP_REGION) {
    throw new AffiliationEntitySearchClientError(
      'FAILED_PRECONDITION',
      'Affiliation search callable requires us-central1.',
    );
  }
  if (name !== SEARCH_AFFILIATION_ENTITIES_FUNCTION) {
    throw new AffiliationEntitySearchClientError(
      'INVALID_ARGUMENT',
      'Unsupported affiliation search function.',
    );
  }
  return `https://${regionNorm}-${project}.cloudfunctions.net/${name}`;
}

export function unwrapFirebaseCallableHttpBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AffiliationEntitySearchClientError(
      'INTERNAL',
      'Invalid affiliation search response.',
    );
  }
  const raw = body as { result?: unknown; error?: unknown; data?: unknown };
  if (raw.error && typeof raw.error === 'object' && !Array.isArray(raw.error)) {
    const err = raw.error as { status?: unknown; code?: unknown };
    const status = String(err.status ?? err.code ?? '').trim();
    throw mapAffiliationSearchCallableError({
      code: status.includes('/') ? status : `functions/${status.toLowerCase()}`,
    });
  }
  if ('result' in raw) return raw.result;
  // Do not accept RNFB `{ data }` here — that shape hid the JS-auth gap.
  throw new AffiliationEntitySearchClientError(
    'INTERNAL',
    'Invalid affiliation search response.',
  );
}

export async function invokeAffiliationSearchCallableHttp(
  input: {
    projectId: string;
    region: string;
    functionName: typeof SEARCH_AFFILIATION_ENTITIES_FUNCTION;
    idToken: string;
    appCheckToken: string;
    data: AffiliationEntitySearchRequest;
  },
  deps: AffiliationCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw new AffiliationEntitySearchClientError(
      'UNAUTHENTICATED',
      'Affiliation search requires sign-in.',
    );
  }
  if (!input.appCheckToken.trim()) {
    throw new AffiliationEntitySearchClientError(
      'FAILED_PRECONDITION',
      'Affiliation search is not ready.',
    );
  }

  const url = buildAffiliationSearchCallableUrl(
    input.projectId,
    input.region,
    input.functionName,
  );
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.idToken}`,
      'X-Firebase-AppCheck': input.appCheckToken,
    },
    body: JSON.stringify({ data: input.data }),
  });

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    if (parsed) {
      try {
        unwrapFirebaseCallableHttpBody(parsed);
      } catch (err) {
        if (err instanceof AffiliationEntitySearchClientError) throw err;
      }
    }
    if (response.status === 401) {
      throw new AffiliationEntitySearchClientError(
        'UNAUTHENTICATED',
        'Affiliation search requires sign-in.',
      );
    }
    if (response.status === 403) {
      throw new AffiliationEntitySearchClientError(
        'FAILED_PRECONDITION',
        'Affiliation search is not ready.',
      );
    }
    throw new AffiliationEntitySearchClientError(
      'UNAVAILABLE',
      'Affiliation search is unavailable.',
    );
  }

  return unwrapFirebaseCallableHttpBody(parsed);
}
