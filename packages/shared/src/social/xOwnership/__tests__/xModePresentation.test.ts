import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isXActionLocked,
  xConnectedForMode,
  xModeConnectionView,
} from '../xModePresentation';
import type { XOwnershipVerified } from '../wireTypes';

const verified: XOwnershipVerified = {
  result: 'verified',
  platform: 'x',
  mode: 'personal',
  userId: '2244994945',
  canonicalUrl: 'https://x.com/nearsy',
  usernameCache: 'nearsy',
  verifiedAt: '2026-10-23T02:00:00.000Z',
};

describe('x mode presentation', () => {
  it('connected when verified.mode matches editor mode', () => {
    assert.equal(xConnectedForMode(verified, 'personal'), true);
    assert.equal(xConnectedForMode(verified, 'professional'), false);
    assert.deepEqual(xModeConnectionView(verified, 'personal'), {
      connected: true,
      userId: '2244994945',
      canonicalUrl: 'https://x.com/nearsy',
      usernameCache: 'nearsy',
    });
  });

  it('locks connect/disconnect while busy', () => {
    assert.equal(isXActionLocked('idle'), false);
    assert.equal(isXActionLocked('connecting'), true);
    assert.equal(isXActionLocked('disconnecting'), true);
    assert.equal(isXActionLocked('loading'), true);
  });
});
