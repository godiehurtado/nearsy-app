import assert from 'node:assert/strict';
import { describe, it } from 'node:test';



import {
  isYoutubeActionLocked,
  isYoutubeChannelPickLocked,
  youtubeConnectedForMode,
} from '../youtubeModePresentation';
import type { YoutubeOwnershipVerified } from '../wireTypes';



const BASE: YoutubeOwnershipVerified = {
  result: 'verified',
  platform: 'youtube',
  mode: 'personal',
  channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx',
  canonicalUrl: 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx',
  customUrlCache: null,
  verifiedAt: '2026-10-16T00:00:00.000Z',
};



describe('youtube mode presentation', () => {
  it('connected when verified.mode matches editor mode', () => {
    assert.equal(youtubeConnectedForMode(BASE, 'personal'), true);
    assert.equal(youtubeConnectedForMode(BASE, 'professional'), false);



    const professional = { ...BASE, mode: 'professional' as const };
    assert.equal(youtubeConnectedForMode(professional, 'professional'), true);
    assert.equal(youtubeConnectedForMode(professional, 'personal'), false);
  });



  it('locks connect/disconnect while busy but allows channel pick in selecting', () => {
    assert.equal(isYoutubeActionLocked('idle'), false);
    assert.equal(isYoutubeActionLocked('selecting'), false);
    assert.equal(isYoutubeActionLocked('connecting'), true);
    assert.equal(isYoutubeChannelPickLocked('selecting'), false);
    assert.equal(isYoutubeChannelPickLocked('connecting'), true);
  });
});

