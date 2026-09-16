/**
 * Firebase callable HTTP protocol for CRJ affiliation search.
 *
 * Thin wrapper over the shared callable HTTP helper with affiliation
 * validation and AffiliationEntitySearchClientError mapping.
 */

import {
  buildCloudFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  unwrapFirebaseCallableHttpBody as unwrapSharedCallableHttpBody,
  type InvokeFirebaseCallableHttpDeps,
} from '../firebase/callableHttp.ts';
import {
  AffiliationEntitySearchClientError,
  SEARCH_AFFILIATION_ENTITIES_FUNCTION,
  mapAffiliationSearchCallableError,
  type AffiliationEntitySearchRequest,
} from './affiliationEntitySearchContract.ts';

export const AFFILIATION_CALLABLE_HTTP_PROJECTS = [
  'nearsy-dev',
  'nearsy-pj',
] as const;
export const AFFILIATION_CALLABLE_HTTP_REGION = 'us-central1' as const;

function isAllowedAffiliationCallableProject(
  project: string,
): project is (typeof AFFILIATION_CALLABLE_HTTP_PROJECTS)[number] {
  return (AFFILIATION_CALLABLE_HTTP_PROJECTS as readonly string[]).includes(
    project,
  );
}

export type AffiliationCallableHttpDeps = InvokeFirebaseCallableHttpDeps;

export function buildAffiliationSearchCallableUrl(
  projectId: string,
  region: string,
  functionName: string,
): string {
  const project = projectId.trim().toLowerCase();
  const regionNorm = region.trim().toLowerCase();
  const name = functionName.trim();
  if (!isAllowedAffiliationCallableProject(project)) {
    throw new AffiliationEntitySearchClientError(
      'FAILED_PRECONDITION',
      'Affiliation search callable requires a known Firebase project.',
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
  return buildCloudFunctionsCallableUrl(project, regionNorm, name);
}

export function unwrapFirebaseCallableHttpBody(body: unknown): unknown {
  try {
    return unwrapSharedCallableHttpBody(body);
  } catch (err) {
    if (isFirebaseCallableHttpError(err)) {
      throw mapAffiliationSearchCallableError({ code: err.code });
    }
    throw new AffiliationEntitySearchClientError(
      'INTERNAL',
      'Invalid affiliation search response.',
    );
  }
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

  try {
    const url = buildAffiliationSearchCallableUrl(
      input.projectId,
      input.region,
      input.functionName,
    );
    return await invokeFirebaseCallableHttp(
      {
        url,
        idToken: input.idToken,
        appCheckToken: input.appCheckToken,
        data: input.data as unknown as Record<string, unknown>,
      },
      deps,
    );
  } catch (err) {
    if (err instanceof AffiliationEntitySearchClientError) throw err;
    if (isFirebaseCallableHttpError(err)) {
      if (err.httpStatus === 401) {
        throw new AffiliationEntitySearchClientError(
          'UNAUTHENTICATED',
          'Affiliation search requires sign-in.',
        );
      }
      if (err.httpStatus === 403) {
        throw new AffiliationEntitySearchClientError(
          'FAILED_PRECONDITION',
          'Affiliation search is not ready.',
        );
      }
      throw mapAffiliationSearchCallableError({ code: err.code });
    }
    throw mapAffiliationSearchCallableError(err);
  }
}
