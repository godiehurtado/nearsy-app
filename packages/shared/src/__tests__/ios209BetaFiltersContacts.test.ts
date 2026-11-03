import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isContactsCapExceeded,
  isContactsSyncRetryable,
} from '../contacts/contactsErrorPresentation';
import { createContactsSessionStore } from '../contacts/iosContactsSession';
import { prepareSearchPreferencesForPersist } from '../visibility/preferences';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('Home filters persist (beta)', () => {
  it('writes nested active-mode fields and epoch-guards rollback', () => {
    const store = readShared('visibility/searchPreferencesStore.ts');
    assert.match(store, /persistSearchPreferencesForMode/);
    assert.match(store, /searchPreferences\.\$\{mode\}/);
    assert.match(store, /updateDoc/);
    assert.doesNotMatch(store, /visibility:/);

    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /localEpochRef/);
    assert.match(home, /epoch === localEpochRef\.current/);
    assert.match(home, /home\.preferences\.errors\.title/);
    assert.doesNotMatch(home, /home\.errors\.title/);
  });

  it('coerces ages to ints before Firestore rules validation', () => {
    const prepared = prepareSearchPreferencesForPersist(
      {
        ageMin: 25.2,
        ageMax: 40.8,
        maxDistanceMeters: 30,
        interestIds: ['interest_tech'],
        updatedAt: 1,
      },
      new Set(['interest_tech']),
    );
    assert.equal(prepared.ok, true);
    if (prepared.ok) {
      assert.equal(prepared.prefs.ageMin, 25);
      assert.equal(prepared.prefs.ageMax, 41);
    }
  });
});

describe('Contacts caps and UID session (beta)', () => {
  it('does not treat caps as transient retries', () => {
    assert.equal(isContactsCapExceeded('contacts-source-cap'), true);
    assert.equal(isContactsSyncRetryable('contacts-source-cap'), false);
    assert.equal(isContactsSyncRetryable('contacts-timeout'), true);
  });

  it('isolates in-memory sessions by UID', async () => {
    const a = createContactsSessionStore('uid-a');
    const b = createContactsSessionStore('uid-b');
    await a.save({
      sourceId: 'src-a',
      contactsEpoch: 3,
      snapshotVersion: 2,
      fingerprint: 'fp-a',
    });
    await b.save({
      sourceId: 'src-b',
      contactsEpoch: 1,
      snapshotVersion: 1,
      fingerprint: 'fp-b',
    });
    const loadedA = await a.load();
    const loadedB = await b.load();
    assert.equal(loadedA?.sourceId, 'src-a');
    assert.equal(loadedB?.sourceId, 'src-b');
    await a.clearFingerprint();
    const after = await a.load();
    assert.equal(after?.snapshotVersion, 2);
    assert.equal(after?.fingerprint, null);
  });
});

describe('Alignment ring + social modal polish (beta)', () => {
  it('keeps View half-clip technique with bleed and dual labels', () => {
    const ring = readShared('components/alignment/AlignmentScoreRing.tsx');
    assert.match(ring, /HALF_CLIP_BLEED/);
    assert.match(ring, /leading hypothesis/);
    assert.equal(ring.includes("from 'react-native-svg'"), false);
    assert.equal(ring.includes('from "react-native-svg"'), false);
    const nearby = readShared('screens/NearbySearchScreen.tsx');
    assert.match(nearby, /alignmentTitleLabel/);
    const header = readShared('components/profile/DiscoveryProfileHeader.tsx');
    assert.match(header, /alignmentTitleLabel/);
  });

  it('keeps Instagram steps shared and Link saved for manual networks', () => {
    const owned = readShared(
      'components/registration/OwnedSocialConnectSection.tsx',
    );
    const editor = readShared('screens/SocialMediaScreen.tsx');
    for (const src of [owned, editor]) {
      assert.match(src, /instagram\.stepCopy/);
      assert.match(src, /instagram\.stepOpen/);
      assert.match(src, /instagram\.stepMessage/);
      assert.match(src, /instagram\.stepPaste/);
    }
    assert.match(editor, /profile\.social\.linkSaved/);
    assert.match(editor, /openInboxA11y/);
  });
});
