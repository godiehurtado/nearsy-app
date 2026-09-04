/**
 * Affiliation entity search provider selection — fail-closed for invalid envs.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/affiliations/__tests__/affiliationEntitySearchRuntime.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import {
  getAffiliationEntitySearchProvider,
  registerAffiliationEntitySearchCallable,
  resolveAffiliationEntitySearchProviderKind,
  resolveAffiliationEntitySearchProviderKindFromEnvironment,
  setAffiliationExpoExtraForTests,
} from '../affiliationEntitySearchRuntime.ts';
import { AffiliationEntitySearchClientError } from '../affiliationEntitySearchContract.ts';

describe('affiliation entity search env resolution', () => {
  beforeEach(() => {
    setAffiliationExpoExtraForTests(null);
    registerAffiliationEntitySearchCallable(null);
  });

  it('development↔nearsy-dev → firebase', () => {
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'development',
        'nearsy-dev',
      ),
      'firebase',
    );
  });

  it('production↔nearsy-pj → firebase', () => {
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'production',
        'nearsy-pj',
      ),
      'firebase',
    );
  });

  it('mismatched pairs fail closed (unavailable), never fixture', () => {
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'development',
        'nearsy-pj',
      ),
      'unavailable',
    );
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'production',
        'nearsy-dev',
      ),
      'unavailable',
    );
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment('', ''),
      'unavailable',
    );
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment('staging', 'x'),
      'unavailable',
    );
  });

  it('explicit rawKind fixture is harness-only; unknown is unavailable', () => {
    assert.equal(resolveAffiliationEntitySearchProviderKind('fixture'), 'fixture');
    assert.equal(resolveAffiliationEntitySearchProviderKind('firebase'), 'firebase');
    assert.equal(resolveAffiliationEntitySearchProviderKind(''), 'unavailable');
    assert.equal(resolveAffiliationEntitySearchProviderKind('mock'), 'unavailable');
  });

  it('invalid env runtime provider rejects (no fixture results)', async () => {
    const provider = getAffiliationEntitySearchProvider(null, {
      firebaseEnv: 'development',
      projectId: 'nearsy-pj',
    });
    assert.equal(provider.id, 'unavailable');
    await assert.rejects(
      () => provider.search('Microsoft', 'professional'),
      (err: unknown) =>
        err instanceof AffiliationEntitySearchClientError &&
        err.code === 'FAILED_PRECONDITION',
    );
  });

  it('valid env without callable fails closed (no fixture fallback)', async () => {
    const provider = getAffiliationEntitySearchProvider(null, {
      firebaseEnv: 'development',
      projectId: 'nearsy-dev',
    });
    assert.equal(provider.id, 'unavailable');
    await assert.rejects(() => provider.search('Microsoft', 'professional'));
  });

  it('explicit fixture harness still returns fixture provider', async () => {
    const provider = getAffiliationEntitySearchProvider('fixture');
    assert.equal(provider.id, 'fixture');
    const rows = await provider.search('Microsoft', 'professional');
    assert.ok(Array.isArray(rows));
  });
});
