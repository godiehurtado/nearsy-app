/**
 * Defensive runtime parsing of Visibility/Discovery wire responses.
 * Invalid responses throw VisibilityDiscoveryClientError — no partial data.
 */

import {
  CONTRACT_VERSION,
  FORBIDDEN_CLIENT_DTO_KEYS,
  MAX_DISCOVERY_LIMIT,
  MAX_GALLERY_ITEMS,
} from '../constants';
import { parseDiscoveryAffiliations } from '../discoveryAffiliations';
import { parseDiscoverySocialLinks } from '../discoverySocialLinks';
import { createContractResponseError } from './errors';
import type {
  ActivateVisibilityResponse,
  DeactivateVisibilityResponse,
  DiscoverNearbyResponse,
  DiscoverNearbyResult,
  DiscoveryGalleryItem,
  DiscoveryProfileDetail,
  DiscoveryProfileSummary,
  GetDiscoveryProfileResponse,
  PublishLocationResponse,
} from './wireTypes';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoForbiddenKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenKeys(item, `${path}[${index}]`),
    );
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (
      (FORBIDDEN_CLIENT_DTO_KEYS as readonly string[]).includes(key)
    ) {
      throw createContractResponseError(
        `Forbidden public DTO field "${key}" at ${path}`,
        value,
      );
    }
    assertNoForbiddenKeys(value[key], `${path}.${key}`);
  }
}

function requireFiniteNumber(
  value: unknown,
  field: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw createContractResponseError(`Invalid number for ${field}`, value);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, field: string): number {
  const n = requireFiniteNumber(value, field);
  if (n < 0) {
    throw createContractResponseError(`${field} must be >= 0`, value);
  }
  return n;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createContractResponseError(`Invalid string for ${field}`, value);
  }
  return value;
}

function requireContractVersion(value: unknown): typeof CONTRACT_VERSION {
  if (value !== CONTRACT_VERSION) {
    throw createContractResponseError(
      'Unsupported or missing contractVersion',
      value,
    );
  }
  return CONTRACT_VERSION;
}

function parseInterestIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw createContractResponseError('interestIds must be an array', value);
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw createContractResponseError('interestIds entries must be non-empty strings', item);
    }
    out.push(item);
  }
  return out;
}

function assertRejectedProfileKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw createContractResponseError(
        `Forbidden profile field "${key}"`,
        value[key],
      );
    }
  }
}

/**
 * Temporal age privacy bridge:
 * - legacy backends may still send ageYears → validate then discard
 * - new backends omit ageYears → OK
 * Public UI model never receives age.
 */
function consumeLegacyAgeYears(value: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(value, 'ageYears')) {
    return;
  }
  requireFiniteNumber(value.ageYears, 'profile.ageYears');
}

function parseSummaryFields(
  value: Record<string, unknown>,
): DiscoveryProfileSummary {
  const mode = value.mode;
  if (mode !== 'personal' && mode !== 'professional') {
    throw createContractResponseError(
      'profile.mode must be personal|professional',
      mode,
    );
  }

  const displayName = requireNonEmptyString(
    value.displayName,
    'profile.displayName',
  );
  consumeLegacyAgeYears(value);
  const interestIds = parseInterestIds(value.interestIds);

  if (typeof value.occupation !== 'string') {
    throw createContractResponseError(
      'profile.occupation must be a string',
      value.occupation,
    );
  }

  let profileImage: string | null;
  if (value.profileImage === null) {
    profileImage = null;
  } else if (typeof value.profileImage === 'string') {
    profileImage = value.profileImage;
  } else {
    throw createContractResponseError(
      'profile.profileImage must be string|null',
      value.profileImage,
    );
  }

  return {
    mode,
    displayName,
    profileImage,
    occupation: value.occupation,
    interestIds,
  };
}

export function parseDiscoveryProfileSummary(
  value: unknown,
): DiscoveryProfileSummary {
  if (!isPlainObject(value)) {
    throw createContractResponseError('profile must be an object', value);
  }
  assertNoForbiddenKeys(value, 'profile');
  assertRejectedProfileKeys(value, [
    'activeProfile',
    'photoUrl',
    'age',
    'status',
    'company',
    'bio',
    'birthDate',
    'birthYear',
    'dateOfBirth',
  ]);
  return parseSummaryFields(value);
}

export function parseDiscoveryProfileDetail(
  value: unknown,
): DiscoveryProfileDetail {
  if (!isPlainObject(value)) {
    throw createContractResponseError('profile must be an object', value);
  }
  assertNoForbiddenKeys(value, 'profile');
  assertRejectedProfileKeys(value, [
    'activeProfile',
    'photoUrl',
    'age',
    'status',
    'birthDate',
    'birthYear',
    'dateOfBirth',
  ]);
  const summary = parseSummaryFields(value);
  if (typeof value.company !== 'string') {
    throw createContractResponseError(
      'profile.company must be a string',
      value.company,
    );
  }
  if (typeof value.bio !== 'string') {
    throw createContractResponseError(
      'profile.bio must be a string',
      value.bio,
    );
  }
  return {
    ...summary,
    company: value.company,
    bio: value.bio,
  };
}

function parseDiscoverNearbyResult(value: unknown): DiscoverNearbyResult {
  if (!isPlainObject(value)) {
    throw createContractResponseError('result must be an object', value);
  }
  assertNoForbiddenKeys(value, 'result');
  return {
    uid: requireNonEmptyString(value.uid, 'result.uid'),
    distanceMeters: requireNonNegativeNumber(
      value.distanceMeters,
      'result.distanceMeters',
    ),
    profile: parseDiscoveryProfileSummary(value.profile),
  };
}

function parseGallery(value: unknown): DiscoveryGalleryItem[] {
  if (!Array.isArray(value)) {
    throw createContractResponseError('gallery must be an array', value);
  }
  if (value.length > MAX_GALLERY_ITEMS) {
    throw createContractResponseError(
      `gallery exceeds max ${MAX_GALLERY_ITEMS}`,
      value.length,
    );
  }
  const out: DiscoveryGalleryItem[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) {
      throw createContractResponseError('gallery item must be an object', item);
    }
    assertNoForbiddenKeys(item, 'gallery[]');
    if (Object.prototype.hasOwnProperty.call(item, 'path')) {
      throw createContractResponseError(
        'gallery[].path is not part of the public contract',
        item.path,
      );
    }
    out.push({ url: requireNonEmptyString(item.url, 'gallery[].url') });
  }
  return out;
}

function parseLocationSuccessShared(
  value: Record<string, unknown>,
): Omit<ActivateVisibilityResponse, 'visibility'> {
  return {
    contractVersion: requireContractVersion(value.contractVersion),
    observedAt: requireFiniteNumber(value.observedAt, 'observedAt'),
    confirmedAt: requireFiniteNumber(value.confirmedAt, 'confirmedAt'),
    updatedAt: requireFiniteNumber(value.updatedAt, 'updatedAt'),
    accuracyMeters: requireNonNegativeNumber(
      value.accuracyMeters,
      'accuracyMeters',
    ),
    serverTime: requireFiniteNumber(value.serverTime, 'serverTime'),
  };
}

export function parseActivateVisibilityResponse(
  data: unknown,
): ActivateVisibilityResponse {
  if (!isPlainObject(data)) {
    throw createContractResponseError('activateVisibility response must be an object', data);
  }
  assertNoForbiddenKeys(data, 'activateVisibility');
  if (data.visibility !== true) {
    throw createContractResponseError(
      'activateVisibility.visibility must be true',
      data.visibility,
    );
  }
  return { visibility: true, ...parseLocationSuccessShared(data) };
}

export function parsePublishLocationResponse(
  data: unknown,
): PublishLocationResponse {
  if (!isPlainObject(data)) {
    throw createContractResponseError('publishLocation response must be an object', data);
  }
  assertNoForbiddenKeys(data, 'publishLocation');
  if (data.visibility !== true) {
    throw createContractResponseError(
      'publishLocation.visibility must be true',
      data.visibility,
    );
  }
  return { visibility: true, ...parseLocationSuccessShared(data) };
}

export function parseDeactivateVisibilityResponse(
  data: unknown,
): DeactivateVisibilityResponse {
  if (!isPlainObject(data)) {
    throw createContractResponseError('deactivateVisibility response must be an object', data);
  }
  assertNoForbiddenKeys(data, 'deactivateVisibility');
  if (data.visibility !== false) {
    throw createContractResponseError(
      'deactivateVisibility.visibility must be false',
      data.visibility,
    );
  }
  return {
    contractVersion: requireContractVersion(data.contractVersion),
    visibility: false,
    serverTime: requireFiniteNumber(data.serverTime, 'serverTime'),
  };
}

export function parseDiscoverNearbyResponse(
  data: unknown,
): DiscoverNearbyResponse {
  if (!isPlainObject(data)) {
    throw createContractResponseError('discoverNearby response must be an object', data);
  }
  assertNoForbiddenKeys(data, 'discoverNearby');
  if (!Array.isArray(data.results)) {
    throw createContractResponseError('results must be an array', data.results);
  }
  if (data.results.length > MAX_DISCOVERY_LIMIT) {
    throw createContractResponseError(
      `results exceed max ${MAX_DISCOVERY_LIMIT}`,
      data.results.length,
    );
  }
  if (data.nextCursor !== null) {
    throw createContractResponseError(
      'nextCursor must be null in MVP',
      data.nextCursor,
    );
  }

  const results = data.results.map(parseDiscoverNearbyResult);
  const uids = results.map((r) => r.uid);
  if (new Set(uids).size !== uids.length) {
    throw createContractResponseError('duplicate result UIDs', uids);
  }

  return {
    contractVersion: requireContractVersion(data.contractVersion),
    results,
    nextCursor: null,
    serverTime: requireFiniteNumber(data.serverTime, 'serverTime'),
  };
}

export function parseGetDiscoveryProfileResponse(
  data: unknown,
): GetDiscoveryProfileResponse {
  if (!isPlainObject(data)) {
    throw createContractResponseError(
      'getDiscoveryProfile response must be an object',
      data,
    );
  }
  assertNoForbiddenKeys(data, 'getDiscoveryProfile');
  return {
    contractVersion: requireContractVersion(data.contractVersion),
    uid: requireNonEmptyString(data.uid, 'uid'),
    distanceMeters: requireNonNegativeNumber(
      data.distanceMeters,
      'distanceMeters',
    ),
    profile: parseDiscoveryProfileDetail(data.profile),
    gallery: parseGallery(data.gallery),
    // Temporal compat: missing field → []; present-but-invalid → invalid-response.
    socialLinks: parseDiscoverySocialLinks(data.socialLinks),
    affiliations: parseDiscoveryAffiliations(data.affiliations),
    serverTime: requireFiniteNumber(data.serverTime, 'serverTime'),
  };
}
