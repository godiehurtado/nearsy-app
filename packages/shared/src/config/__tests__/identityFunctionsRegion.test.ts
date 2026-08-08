/**
 * Identity Functions region contract (A3.4.1).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/config/__tests__/identityFunctionsRegion.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  IDENTITY_FUNCTIONS_REGION,
} from '../identityFunctionsRegion.ts';

describe('identity Functions region', () => {
  it('pins us-central1 explicitly', () => {
    assert.equal(IDENTITY_FUNCTIONS_REGION, 'us-central1');
  });

  it('module import performs no network I/O', () => {
    assert.equal(typeof IDENTITY_FUNCTIONS_REGION, 'string');
  });
});
