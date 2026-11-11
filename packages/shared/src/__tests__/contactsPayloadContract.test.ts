/**
 * iOS Contacts payload against Identity's contract (nearsy-identity-functions
 * origin/main a193ff7, src/modules/contactsHmac/normalize.ts and parse.ts).
 * Identity rejects a whole syncContactHashes call when any single identifier
 * is invalid, so every identifier the client keeps must pass Identity's rules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parsePhoneNumberWithError } from 'libphonenumber-js/max';

import { BANNED_CONTACTS_WIRE_FIELDS, CONTACT_PHONE_MAX_CHARS } from '../contacts/domain';
import {
  selectUploadableIdentifiers,
  tryNormalizeEmail,
  tryNormalizePhone,
} from '../contacts/identifiers';
import {
  buildEnableContactsSyncRequest,
  buildRefreshVerifiedActorKeysRequest,
  buildRemoveContactSourceRequest,
  buildSyncContactHashesRequest,
} from '../contacts/parse';

/** Identity's normalizeContactPhone, reproduced: returns null where it throws. */
function identityAcceptsPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('+') || trimmed.length > CONTACT_PHONE_MAX_CHARS + 8) return null;
  if (/[A-Za-z]/.test(trimmed)) return null;
  try {
    const parsed = parsePhoneNumberWithError(trimmed, { extract: false });
    if (!parsed.isPossible() || !parsed.isValid()) return null;
    const e164 = parsed.format('E.164');
    return e164.length > CONTACT_PHONE_MAX_CHARS ? null : e164;
  } catch {
    return null;
  }
}

const VALID_FORMS: Array<[string, string]> = [
  ['+57 300 123 4567', '+573001234567'],
  ['+57 (300) 123-4567', '+573001234567'],
  ['+57.300.123.4567', '+573001234567'],
  ['+57 300 123 4567', '+573001234567'],
  ['‪+57 300 123 4567‬', '+573001234567'],
  ['‎+1 (415) 555-2671', '+14155552671'],
  ['  +34 612 34 56 78  ', '+34612345678'],
  ['+44 20 7946 0018', '+442079460018'],
];

const REFUSED = [
  '+1 555 555 0100', // E.164 shape, not a valid number
  '+57 300 123', // too short
  '300 123 4567', // national form: Identity requires +
  '+57 300 ABC 4567',
  '+1 (415) 555-2671 ext. 12',
  '+999 123 456 789',
  '',
  '+',
];

describe('phones follow Identity exactly', () => {
  it('keeps valid numbers in every iOS format and sends E.164', () => {
    for (const [raw, e164] of VALID_FORMS) {
      assert.equal(tryNormalizePhone(raw), e164, JSON.stringify(raw));
    }
  });

  it('every phone kept is accepted by Identity as sent, unchanged', () => {
    for (const [raw] of VALID_FORMS) {
      const sent = tryNormalizePhone(raw)!;
      assert.equal(identityAcceptsPhone(sent), sent, raw);
    }
  });

  it('skips what Identity would refuse instead of failing the whole sync', () => {
    for (const raw of REFUSED) {
      assert.equal(tryNormalizePhone(raw), null, JSON.stringify(raw));
    }
  });

  it('non-string values are skipped, never thrown', () => {
    assert.equal(tryNormalizePhone(undefined as unknown as string), null);
    assert.equal(tryNormalizeEmail(null as unknown as string), null);
  });
});

describe('one invalid identifier never costs the others', () => {
  it('a contact keeps its valid phones and emails next to an invalid one', () => {
    const result = selectUploadableIdentifiers([
      {
        phoneNumbers: [
          { number: '+1 555 555 0100' },
          { number: '+57 300 123 4567' },
          { number: null },
          null,
        ],
        emails: [{ email: 'not-an-email' }, { email: ' Ana@Example.COM ' }, { email: 'a..b@x.co' }],
      },
      { phoneNumbers: [{ number: '‪+1 415 555 2671‬' }] },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.identifiers, [
      { kind: 'email', value: 'ana@example.com' },
      { kind: 'phone', value: '+14155552671' },
      { kind: 'phone', value: '+573001234567' },
    ]);
  });

  it('the same number written two ways is sent once', () => {
    const result = selectUploadableIdentifiers([
      { phoneNumbers: [{ number: '+57 300 123 4567' }] },
      { phoneNumbers: [{ number: '+573001234567' }] },
    ]);
    assert.deepEqual(result.ok && result.identifiers, [{ kind: 'phone', value: '+573001234567' }]);
  });

  it('a granted book with nothing valid is a real empty book', () => {
    const result = selectUploadableIdentifiers([{ phoneNumbers: [{ number: '300 123 4567' }] }]);
    assert.deepEqual(result, { ok: true, identifiers: [] });
  });
});

describe('request shapes match Identity parsers', () => {
  it('syncContactHashes carries exactly the four control and data fields', () => {
    const request = buildSyncContactHashesRequest({
      sourceId: 'ios_abcdef0123456789',
      snapshotVersion: 3,
      contactsEpoch: 2,
      identifiers: [{ kind: 'phone', value: '+573001234567' }],
    });
    assert.deepEqual(Object.keys(request).sort(), [
      'contactsEpoch',
      'identifiers',
      'snapshotVersion',
      'sourceId',
    ]);
    for (const row of request.identifiers) {
      assert.deepEqual(Object.keys(row).sort(), ['kind', 'value']);
    }
    for (const banned of BANNED_CONTACTS_WIRE_FIELDS) {
      assert.equal(banned in request, false, banned);
    }
  });

  it('enable, remove and refresh send only the fields Identity accepts', () => {
    assert.deepEqual(buildEnableContactsSyncRequest(0), { contactsEpoch: 0 });
    assert.deepEqual(buildRefreshVerifiedActorKeysRequest(), {});
    assert.deepEqual(
      Object.keys(
        buildRemoveContactSourceRequest({
          sourceId: 'ios_abcdef0123456789',
          contactsEpoch: 1,
          knownSnapshotVersion: 0,
        }),
      ).sort(),
      ['contactsEpoch', 'knownSnapshotVersion', 'sourceId'],
    );
  });
});

describe('reading the iOS book', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, '../contacts/iosAddressBook.ios.ts'), 'utf8');

  it('an unavailable module or an incomplete read fails, never returns an empty or partial book', () => {
    assert.match(source, /if \(!Contacts\) throw new Error\('contacts-read-unavailable'\)/);
    assert.match(source, /throw new Error\('contacts-read-incomplete'\)/);
    assert.equal(/readRows\(\)[\s\S]*?return \[\];/.test(source), false);
    assert.equal(/rows\.length > \d/.test(source), false, 'no silent truncation');
  });
});
