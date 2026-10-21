import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isTiktokActionLocked,
  tiktokConnectedForMode,
  tiktokModeConnectionView,
} from '../tiktokModePresentation';
import type { TiktokOwnershipVerified } from '../wireTypes';

const verified: TiktokOwnershipVerified = {
  result: 'verified',
  platform: 'tiktok',
  mode: 'personal',
  openId: 'oid_1',
  canonicalUrl: 'https://www.tiktok.com/@nearsy',
  usernameCache: 'nearsy',
  verifiedAt: '2026-10-19T00:00:00.000Z',
};

describe('tiktok mode presentation', () => {
  it('connected when verified.mode matches editor mode', () => {
    assert.equal(tiktokConnectedForMode(verified, 'personal'), true);
    assert.equal(tiktokConnectedForMode(verified, 'professional'), false);
    assert.deepEqual(tiktokModeConnectionView(verified, 'personal'), {
      connected: true,
      openId: 'oid_1',
      canonicalUrl: 'https://www.tiktok.com/@nearsy',
      usernameCache: 'nearsy',
    });
  });

  it('locks connect/disconnect while busy', () => {
    assert.equal(isTiktokActionLocked('idle'), false);
    assert.equal(isTiktokActionLocked('connecting'), true);
    assert.equal(isTiktokActionLocked('disconnecting'), true);
    assert.equal(isTiktokActionLocked('loading'), true);
  });
});
