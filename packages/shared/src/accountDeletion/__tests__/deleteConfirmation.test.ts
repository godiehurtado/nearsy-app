/**
 * Delete Account confirmation word: exact `DELETE`, trim only.
 * Run: node --experimental-strip-types --test packages/shared/src/accountDeletion/__tests__/deleteConfirmation.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isDeleteConfirmationText } from '../deleteConfirmation.ts';

describe('isDeleteConfirmationText', () => {
  it('enables the destructive action only for exactly DELETE', () => {
    assert.equal(isDeleteConfirmationText('DELETE'), true);
  });

  it('forgives accidental surrounding whitespace', () => {
    assert.equal(isDeleteConfirmationText(' DELETE '), true);
    assert.equal(isDeleteConfirmationText('\tDELETE\n'), true);
  });

  it('rejects other casings', () => {
    for (const value of ['delete', 'Delete', 'DELETe', 'dElEtE']) {
      assert.equal(isDeleteConfirmationText(value), false, value);
    }
  });

  it('rejects partial, longer and empty values', () => {
    for (const value of ['DELET', 'DELETED', 'DE LETE', '', '   ']) {
      assert.equal(isDeleteConfirmationText(value), false, JSON.stringify(value));
    }
  });
});
