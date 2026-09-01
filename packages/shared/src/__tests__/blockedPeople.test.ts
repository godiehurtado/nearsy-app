import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import settingsEn from '../i18n/resources/settings';
import discoveryEn from '../i18n/resources/discoveryProfile';
import es from '../i18n/locales/es';
import {
  buildGetBlockedPeopleRequest,
  parseGetBlockedPeopleResponse,
  VISIBILITY_CALLABLE_NAMES,
} from '../visibility/callables';
import { MAX_BLOCKED_PEOPLE_LIMIT } from '../visibility/constants';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('Blocked People navigation', () => {
  it('exposes More row and BlockedPeople route', () => {
    const more = readShared('screens/MoreScreen.tsx');
    const stack = readShared('navigation/MoreStack.tsx');
    assert.match(more, /settings\.blockedPeople\.title/);
    assert.match(more, /navigate\('BlockedPeople'\)/);
    assert.doesNotMatch(more, /blockedContacts/);
    assert.doesNotMatch(more, /Blocked contacts/);
    assert.match(stack, /BlockedPeople/);
    assert.match(stack, /BlockedPeopleScreen/);
    assert.match(stack, /DeleteAccount/);
  });
});

describe('BlockedPeopleScreen contracts', () => {
  it('loads via getBlockedPeople and unblocks via owner delete only', () => {
    const screen = readShared('screens/BlockedPeopleScreen.tsx');
    assert.match(screen, /getBlockedPeople/);
    assert.match(screen, /buildGetBlockedPeopleRequest/);
    assert.match(screen, /unblockCandidateUser/);
    assert.match(screen, /settings\.blockedPeople\.loading/);
    assert.match(screen, /settings\.blockedPeople\.empty/);
    assert.match(screen, /settings\.blockedPeople\.unavailable/);
    assert.match(screen, /unblockConfirmTitle/);
    assert.match(screen, /Alert\.alert/);
    assert.match(screen, /setPeople\(\(prev\) => prev\.filter/);
    assert.match(screen, /settings\.blockedPeople\.unblockError/);
    assert.match(screen, /useAppTheme/);

    assert.doesNotMatch(screen, /blockedContacts/);
    assert.doesNotMatch(screen, /client\.getDiscoveryProfile/);
    assert.doesNotMatch(screen, /buildGetDiscoveryProfileRequest/);
    assert.doesNotMatch(screen, /collection\(['"]discoveryProfiles['"]/);
    assert.doesNotMatch(screen, /doc\(firestoreDb,\s*'users'/);
  });

  it('unbind helper deletes only owner blockedUsers path', () => {
    const helper = readShared('visibility/unblockCandidate.ts');
    assert.match(
      helper,
      /doc\(firestoreDb,\s*'users',\s*myUid,\s*'blockedUsers',\s*candidateUid\)/,
    );
    assert.match(helper, /deleteDoc/);
    assert.doesNotMatch(helper, /blockedContacts/);
    assert.doesNotMatch(helper, /httpsCallable/);
  });
});

describe('getBlockedPeople client wire', () => {
  it('builds request without target UIDs and parses minimal DTO', () => {
    assert.equal(VISIBILITY_CALLABLE_NAMES.getBlockedPeople, 'getBlockedPeople');
    const request = buildGetBlockedPeopleRequest();
    assert.deepEqual(request, { contractVersion: 1 });
    assert.equal(Object.keys(request).length, 1);

    const available = parseGetBlockedPeopleResponse({
      contractVersion: 1,
      people: [
        {
          uid: 'a',
          available: true,
          displayName: 'Ada',
          profileImage: null,
          mode: 'personal',
        },
        { uid: 'b', available: false },
      ],
      serverTime: 100,
    });
    assert.equal(available.people.length, 2);
    assert.equal(available.people[0].available, true);
    assert.equal(available.people[1].available, false);

    assert.throws(() =>
      parseGetBlockedPeopleResponse({
        contractVersion: 1,
        people: Array.from({ length: MAX_BLOCKED_PEOPLE_LIMIT + 1 }, (_, i) => ({
          uid: `u${i}`,
          available: false,
        })),
        serverTime: 1,
      }),
    );

    assert.throws(() =>
      parseGetBlockedPeopleResponse({
        contractVersion: 1,
        people: [{ uid: 'x', available: false, email: 'a@b.c' }],
        serverTime: 1,
      }),
    );
  });
});

describe('Blocked People i18n EN/ES', () => {
  it('keeps Settings Blocked People copy complete', () => {
    assert.equal(settingsEn.blockedPeople.title, 'Blocked People');
    assert.equal(settingsEn.blockedPeople.empty, "You haven't blocked anyone.");
    assert.equal(settingsEn.blockedPeople.unavailable, 'Unavailable user');
    assert.ok(settingsEn.blockedPeople.unblockConfirmBody.includes('may appear'));
    assert.equal(es.settings.blockedPeople.title, 'Personas bloqueadas');
    assert.equal(es.settings.blockedPeople.empty, 'No has bloqueado a nadie.');
    assert.equal(es.settings.blockedPeople.unavailable, 'Usuario no disponible');
    assert.match(
      discoveryEn.blockConfirmBody,
      /manage blocked people in Settings/,
    );
    assert.match(
      es.discoveryProfile.blockConfirmBody,
      /personas bloqueadas en Ajustes/,
    );
  });
});

describe('Unit 2A Settings preservation with Blocked People', () => {
  it('keeps Unit 2A Settings behaviors and still hides contacts', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(more, /buildBirthDatePersistencePatch/);
    assert.match(more, /buildPhoneSavePatch/);
    assert.match(more, /validateVisibilityAgeRange/);
    assert.match(more, /changeAppLanguage/);
    assert.match(more, /settings\.logout\.title/);
    assert.match(more, /navigate\('DeleteAccount'\)/);
    assert.match(more, /navigate\('BlockedPeople'\)/);
    assert.doesNotMatch(more, /contactsSync/);
    assert.doesNotMatch(more, /blockedContacts/);
  });
});
