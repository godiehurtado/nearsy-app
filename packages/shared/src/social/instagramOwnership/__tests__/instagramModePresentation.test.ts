import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  instagramConnectedForMode,
  instagramModeConnectionView,
  isInstagramActionLocked,
} from '../instagramModePresentation';
import type { InstagramOwnershipVerified } from '../wireTypes';

const verified: InstagramOwnershipVerified = {
  result: 'verified',
  platform: 'instagram',
  mode: 'personal',
  igsid: '17841400000000001',
  canonicalUrl: 'https://www.instagram.com/nearsy',
  usernameCache: 'nearsy',
  verifiedAt: '2026-10-21T00:00:00.000Z',
};

describe('instagram mode presentation', () => {
  it('connected when verified.mode matches editor mode', () => {
    assert.equal(instagramConnectedForMode(verified, 'personal'), true);
    assert.equal(instagramConnectedForMode(verified, 'professional'), false);
    assert.deepEqual(instagramModeConnectionView(verified, 'personal'), {
      connected: true,
      igsid: '17841400000000001',
      canonicalUrl: 'https://www.instagram.com/nearsy',
      usernameCache: 'nearsy',
    });
  });

  it('locks connect/disconnect while busy but not while pending', () => {
    assert.equal(isInstagramActionLocked('idle'), false);
    assert.equal(isInstagramActionLocked('pending'), false);
    assert.equal(isInstagramActionLocked('connecting'), true);
    assert.equal(isInstagramActionLocked('disconnecting'), true);
    assert.equal(isInstagramActionLocked('loading'), true);
  });
});
