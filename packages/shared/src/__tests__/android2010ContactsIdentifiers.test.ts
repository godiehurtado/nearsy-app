/**
 * Contacts identifiers against Identity's syncContactHashes validator
 * (nearsy-identity-functions normalize.ts, libphonenumber-js 1.13.11 max).
 * Synthetic data only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parsePhoneNumberWithError } from 'libphonenumber-js/max';

import {
  assertWireIdentifiers,
  buildSyncRequest,
  collectContactIdentifiers,
  ContactsHmacError,
} from '../contactsHmac/contactsHmacCore.ts';
import {
  isWireValidIdentifier,
  normalizeContactEmail,
  normalizeContactPhone,
  reliableRegionFromVerifiedPhone,
} from '../contactsHmac/contactsIdentifierNormalize.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** Identity's deployed phone rule, transcribed, to compare what the client sends. */
function identityAcceptsPhone(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('+') || trimmed.length > 28 || /[A-Za-z]/.test(trimmed)) return false;
  try {
    const parsed = parsePhoneNumberWithError(trimmed, { extract: false });
    return parsed.isPossible() && parsed.isValid() && parsed.format('E.164').length <= 20;
  } catch {
    return false;
  }
}

const SOURCE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('the cause: shapes the old client sent and Identity rejects', () => {
  // Old client rule: "+" then 8 to 15 digits, no libphonenumber.
  const oldClient = (raw: string) => /^\+[1-9]\d{7,14}$/.test(raw.trim());
  const rejectedByIdentity = [
    '+15550100000', // area code 555
    '+5730012345', // Colombian mobile too short
    '+4479111234567', // UK mobile too long
    '+12345678',
    '+5215512345678', // old Mexican mobile prefix, common in address books
  ];

  it('each one passed the old filter and fails Identity, which rejects the whole snapshot', () => {
    for (const raw of rejectedByIdentity) {
      assert.equal(oldClient(raw), true);
      assert.equal(identityAcceptsPhone(raw), false);
    }
  });

  it('the client now leaves them out', () => {
    for (const raw of rejectedByIdentity) {
      assert.equal(normalizeContactPhone(raw).ok, false);
    }
  });
});

describe('phones', () => {
  it('international numbers, formatted or not, become E.164 Identity accepts', () => {
    for (const [raw, e164] of [
      ['+57 300 123 4567', '+573001234567'],
      ['+573001234567', '+573001234567'],
      ['+1 (202) 555-0143', '+12025550143'],
      ['+44 7911 123456', '+447911123456'],
      ['+34 612-345-678', '+34612345678'],
    ] as const) {
      const phone = normalizeContactPhone(raw);
      assert.deepEqual(phone, { ok: true, value: e164 }, raw);
      assert.ok(identityAcceptsPhone(phone.ok ? phone.value : ''), raw);
    }
  });

  it('national numbers need a reliable region; none means left out', () => {
    assert.deepEqual(normalizeContactPhone('300 123 4567'), { ok: false, reason: 'no_region' });
    assert.deepEqual(normalizeContactPhone('300 123 4567', null), {
      ok: false,
      reason: 'no_region',
    });
    assert.deepEqual(normalizeContactPhone('300 123 4567', 'CO'), {
      ok: true,
      value: '+573001234567',
    });
    assert.deepEqual(normalizeContactPhone('(202) 555-0143', 'US'), {
      ok: true,
      value: '+12025550143',
    });
    // A Colombian national number read with another region is not invented as valid.
    assert.equal(normalizeContactPhone('300 123 4567', 'ES').ok, false);
    // A region that is not a country code is not a region.
    assert.equal(normalizeContactPhone('300 123 4567', 'es-CO').ok, false);
  });

  it('extensions and dial pauses are left out', () => {
    for (const raw of [
      '+57 300 123 4567 ext 2',
      '+57 300 123 4567 x2',
      '+573001234567,123',
      '+573001234567;2',
      '+573001234567#9',
    ]) {
      assert.deepEqual(normalizeContactPhone(raw), { ok: false, reason: 'extension' }, raw);
    }
  });

  it('short codes and service numbers are left out', () => {
    for (const raw of ['*611', '#123#', '911', '+57 123', '611']) {
      assert.equal(normalizeContactPhone(raw, 'CO').ok, false, raw);
    }
  });

  it('every phone the client keeps is accepted by Identity', () => {
    const samples = [
      '+57 300 123 4567', '300 123 4567', '+1 202 555 0143', '+15550100000',
      '+5215512345678', '*611', '+44 7911 123456', '0057 300 123 4567',
    ];
    for (const raw of samples) {
      for (const region of [null, 'CO', 'US']) {
        const phone = normalizeContactPhone(raw, region);
        if (phone.ok) assert.ok(identityAcceptsPhone(phone.value), `${raw} ${region}`);
      }
    }
  });
});

describe('emails', () => {
  it('same rule as Identity', () => {
    assert.equal(normalizeContactEmail(' Ana@Example.COM '), 'ana@example.com');
    for (const raw of ['ana@localhost', 'ana..b@example.com', 'ana@', '@example.com', 'a b@x.co', '']) {
      assert.equal(normalizeContactEmail(raw), null, raw);
    }
    assert.equal(normalizeContactEmail(`${'a'.repeat(250)}@x.co`), null);
  });
});

describe('collecting a book', () => {
  it('an invalid identifier does not take the valid ones of the same contact', () => {
    const result = collectContactIdentifiers(
      [
        {
          emails: [{ email: 'ana@localhost' }, { email: 'Ana@Example.com' }],
          phoneNumbers: [
            { number: '+15550100000' },
            { number: '+57 300 123 4567' },
            { number: '300 123 4567 ext 9' },
          ],
        },
      ],
      { reliableRegion: 'CO' },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.identifiers, [
      { kind: 'email', value: 'ana@example.com' },
      { kind: 'phone', value: '+573001234567' },
    ]);
    assert.deepEqual(result.stats, {
      emailsSeen: 2,
      emailsKept: 1,
      emailsInvalid: 1,
      phonesSeen: 3,
      phonesKept: 1,
      phonesNoRegion: 0,
      phonesExtension: 1,
      phonesInvalid: 1,
      duplicates: 0,
    });
  });

  it('duplicates are removed after normalization', () => {
    const result = collectContactIdentifiers(
      [
        { phoneNumbers: [{ number: '+57 300 123 4567' }, { number: '300-123-4567' }] },
        { phoneNumbers: [{ number: '+573001234567' }], emails: [{ email: 'ANA@example.com' }] },
        { emails: [{ email: 'ana@example.com ' }] },
      ],
      { reliableRegion: 'CO' },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.identifiers, [
      { kind: 'phone', value: '+573001234567' },
      { kind: 'email', value: 'ana@example.com' },
    ]);
    assert.equal(result.stats.duplicates, 3);
  });

  it('a book with no phones or emails is a real empty book', () => {
    const result = collectContactIdentifiers([{}, { emails: [], phoneNumbers: [{ number: ' ' }] }]);
    assert.deepEqual(result.ok && result.identifiers, []);
  });

  it('identifiers that all fail are a failure, not an empty book', () => {
    const result = collectContactIdentifiers([
      { phoneNumbers: [{ number: '300 123 4567' }], emails: [{ email: 'x@localhost' }] },
    ]);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'contacts-identifier-invalid');
    assert.equal(result.stats.phonesNoRegion, 1);
  });

  it('the cap still applies after normalization', () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ emails: [{ email: `u${i}@ex.co` }] }));
    const result = collectContactIdentifiers(many);
    assert.equal(!result.ok && result.reason, 'contacts-identifier-cap');
  });

  it('stats never carry a value', () => {
    const result = collectContactIdentifiers([
      { phoneNumbers: [{ number: '+57 300 123 4567' }], emails: [{ email: 'ana@example.com' }] },
    ]);
    const text = JSON.stringify(result.stats);
    assert.doesNotMatch(text, /300|ana|example|\+57/);
  });
});

describe('the request sent to Identity', () => {
  const valid = [
    { kind: 'phone' as const, value: '+573001234567' },
    { kind: 'email' as const, value: 'ana@example.com' },
  ];

  it('control fields and rows are checked before sending', () => {
    const body = buildSyncRequest({
      sourceId: SOURCE_ID,
      snapshotVersion: 1,
      contactsEpoch: 0,
      identifiers: valid,
    });
    assert.deepEqual(Object.keys(body).sort(), [
      'contactsEpoch',
      'identifiers',
      'snapshotVersion',
      'sourceId',
    ]);
    for (const bad of [
      { sourceId: 'device:pixel.8' },
      { snapshotVersion: 0 },
      { snapshotVersion: '1' as unknown as number },
      { snapshotVersion: 1.5 },
      { contactsEpoch: -1 },
      { contactsEpoch: undefined as unknown as number },
    ]) {
      assert.throws(
        () =>
          buildSyncRequest({
            sourceId: SOURCE_ID,
            snapshotVersion: 1,
            contactsEpoch: 0,
            identifiers: valid,
            ...bad,
          }),
        (err: unknown) =>
          err instanceof ContactsHmacError && err.reason === 'contacts-identifier-invalid',
        JSON.stringify(Object.keys(bad)),
      );
    }
  });

  it('a row Identity would reject never leaves the device', () => {
    for (const row of [
      { kind: 'PHONE', value: '+573001234567' },
      { kind: 'phone', value: '+573001234567', label: 'mobile' },
      { kind: 'phone', value: null },
      { kind: 'phone', value: '+57 300 123 4567' }, // not canonical
      { kind: 'phone', value: '+15550100000' },
      { kind: 'email', value: 'Ana@Example.com' }, // not canonical
    ]) {
      assert.equal(isWireValidIdentifier(row), false, JSON.stringify(Object.keys(row)));
      assert.throws(() => assertWireIdentifiers([...valid, row]));
    }
    assert.deepEqual(assertWireIdentifiers(valid), valid);
  });
});

describe('reliable region', () => {
  it('only from the account\'s own verified phone', () => {
    assert.equal(reliableRegionFromVerifiedPhone('+573001234567', true), 'CO');
    assert.equal(reliableRegionFromVerifiedPhone('+12025550143', true), 'US');
    assert.equal(reliableRegionFromVerifiedPhone('+573001234567', false), null);
    assert.equal(reliableRegionFromVerifiedPhone(undefined, true), null);
    assert.equal(reliableRegionFromVerifiedPhone('3001234567', true), null);
  });

  it('More passes it; the device language is not used', () => {
    const more = src('screens/MoreScreen.tsx');
    assert.ok(more.includes('contactsReliablePhoneRegion(data.phone, data.phoneVerified)'));
    const normalize = src('contactsHmac/contactsIdentifierNormalize.ts');
    assert.doesNotMatch(normalize, /getLocales|expo-localization|i18n/);
  });

  it('the book logs counts only and refuses to upload when nothing is valid', () => {
    const book = src('contactsHmac/contactsBook.android.ts');
    assert.ok(book.includes("console.info('[contacts] identifiers', JSON.stringify(collected.stats))"));
    assert.ok(book.includes("'contacts-identifier-invalid'"));
  });
});

describe('a failed normalization keeps the previous sync', () => {
  it('nothing is uploaded and the acknowledged snapshot stays', async () => {
    const { runEnableThenSync } = await import('../contactsHmac/contactsSyncFlow.ts');
    const { ContactsFlowStateError } = await import('../contactsHmac/contactsHmacCore.ts');
    const { FakeIdentity } = await import('./helpers/contactsIdentityFake.ts');
    const identity = new FakeIdentity();
    const functions = { region: 'r', call: (n: string, d?: unknown) => identity.call(n, d) };
    const goodBook = {
      getPermission: async () => 'granted' as const,
      requestPermission: async () => 'granted' as const,
      readRecords: async () => [{ kind: 'phone' as const, value: '+573001234567' }],
    };
    const first = await runEnableThenSync({
      functions,
      book: goodBook,
      state: {
        sourceId: SOURCE_ID,
        contactsEpoch: null,
        lastAckedVersion: null,
        lastAckedFingerprint: null,
        lastAckedEpoch: null,
        removedSnapshotFloor: null,
      } as never,
    });
    const syncsBefore = identity.count('syncContactHashes');
    assert.equal(syncsBefore, 1);
    const acked = first.state.lastAckedVersion;
    assert.ok(typeof acked === 'number' && acked >= 1);

    const failingBook = {
      ...goodBook,
      readRecords: async () => {
        const collected = collectContactIdentifiers([
          { phoneNumbers: [{ number: '300 123 4567' }] }, // national, no region
        ]);
        assert.equal(collected.ok, false);
        throw new ContactsHmacError('contacts-identifier-invalid', 'none valid');
      },
    };
    await assert.rejects(
      runEnableThenSync({ functions, book: failingBook, state: first.state }),
      (err: unknown) =>
        err instanceof ContactsFlowStateError &&
        err.reason === 'contacts-identifier-invalid' &&
        err.state.lastAckedVersion === acked &&
        err.state.lastAckedFingerprint === first.state.lastAckedFingerprint,
    );
    assert.equal(identity.count('syncContactHashes'), syncsBefore);
  });
});
