/**
 * identifierCap (Identity contract v1, additive). Synthetic emails only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { enableAndSyncContacts, syncGrantedAddressBook } from '../contacts/controller';
import { createMemoryContactsSessionStore } from '../contacts/fakeClient';
import {
  CLIENT_MAX_IDENTIFIER_CAP,
  LEGACY_IDENTIFIER_CAP,
  currentIdentifierCap,
  effectiveIdentifierCap,
  parseIdentifierCap,
  resetIdentifierCapForTests,
} from '../contacts/identifierCap';
import { selectUploadableIdentifiers } from '../contacts/identifiers';
import { parseContactsWireResult } from '../contacts/parse';
import type { ContactsHmacClient } from '../contacts/port';

const here = dirname(fileURLToPath(import.meta.url));
const emails = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ emails: [{ email: `person${from + i}@example.com` }] }));

function wire(extra: Record<string, unknown> = {}) {
  return {
    result: 'enabled',
    contactsSyncEnabled: true,
    contactsEpoch: 1,
    notifyNearbyContactsEffective: true,
    syncCommitted: false,
    reevaluateRequired: false,
    ...extra,
  };
}

function server(cap: unknown) {
  const calls: Array<{ name: string; count?: number }> = [];
  const withCap = (data: Record<string, unknown>) =>
    parseContactsWireResult(cap === undefined ? data : { ...data, identifierCap: cap });
  const client: ContactsHmacClient = {
    refreshVerifiedActorKeys: async () => {
      calls.push({ name: 'refresh' });
      return withCap(wire({ result: 'refreshed' }));
    },
    enableContactsSync: async () => {
      calls.push({ name: 'enable' });
      return withCap(wire());
    },
    syncContactHashes: async (req) => {
      calls.push({ name: 'sync', count: req.identifiers.length });
      return withCap(wire({ result: 'synced', syncCommitted: true, snapshotVersion: req.snapshotVersion }));
    },
    disableContactsSync: async () => withCap(wire({ contactsSyncEnabled: false })),
    removeContactSource: async () => withCap(wire({ result: 'removed' })),
  };
  return { client, calls };
}

function ports(client: ContactsHmacClient, rows: unknown[], seed?: Record<string, unknown>) {
  return {
    client,
    session: createMemoryContactsSessionStore(seed as never),
    book: {
      getPermission: async () => 'granted' as const,
      requestPermission: async () => 'granted' as const,
      readRows: async () => rows as never,
    },
    createRandomHex: () => 'abcdef0123456789',
  };
}

beforeEach(() => resetIdentifierCapForTests());

describe('identifierCap parsing and effective limit', () => {
  it('keeps only safe integers >= 1 and never fails the response', () => {
    assert.equal(parseContactsWireResult({ ...wire(), identifierCap: 5000 }).identifierCap, 5000);
    for (const bad of [0, -1, 1.5, '5000', null, Number.NaN, 2 ** 60]) {
      const parsed = parseContactsWireResult({ ...wire(), identifierCap: bad });
      assert.equal('identifierCap' in parsed, false, String(bad));
    }
    assert.equal('identifierCap' in parseContactsWireResult(wire()), false);
    assert.equal(parseIdentifierCap(3), 3);
  });

  it('is min(server, 5000), and 500 when the server does not send it', () => {
    assert.equal(CLIENT_MAX_IDENTIFIER_CAP, 5000);
    assert.equal(LEGACY_IDENTIFIER_CAP, 500);
    assert.equal(effectiveIdentifierCap(5000), 5000);
    assert.equal(effectiveIdentifierCap(9000), 5000);
    assert.equal(effectiveIdentifierCap(1200), 1200);
    assert.equal(effectiveIdentifierCap(null), 500);
  });

  it('counts unique normalized identifiers, so duplicates never use the limit', () => {
    const rows = [...emails(600), ...emails(600)];
    rows.push({ emails: [{ email: ' PERSON1@Example.com ' }] });
    const result = selectUploadableIdentifiers(rows, { cap: 600 });
    assert.equal(result.ok && result.identifiers.length, 600);
    assert.deepEqual(selectUploadableIdentifiers(rows, { cap: 599 }), {
      ok: false,
      reason: 'contacts-identifier-cap',
    });
  });

  it('lives only in memory', () => {
    const source = readFileSync(join(here, '../contacts/identifierCap.ts'), 'utf8');
    assert.equal(/SecureStore|AsyncStorage|setItem|import /.test(source), false);
  });
});

describe('enable and sync with the server limit', () => {
  it('a server cap of 5000 lets a 1200-identifier book sync in one full snapshot', async () => {
    const { client, calls } = server(5000);
    const out = await enableAndSyncContacts(ports(client, emails(1200)));
    assert.equal(out.ok && out.bookSynced, true);
    const syncs = calls.filter((c) => c.name === 'sync');
    assert.deepEqual(syncs, [{ name: 'sync', count: 1200 }]);
    assert.equal(currentIdentifierCap().cap, 5000);
  });

  it('an older server without the field keeps 500: nothing is sent and consent stays on', async () => {
    const { client, calls } = server(undefined);
    const out = await enableAndSyncContacts(ports(client, emails(600)));
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.reason, 'contacts-identifier-cap');
    assert.equal(out.ok === false && out.identityEnabled, true);
    assert.equal(calls.some((c) => c.name === 'sync'), false);
  });

  it('a book over the effective limit sends nothing and is never truncated', async () => {
    for (const [cap, size] of [[5000, 5001], [800, 900], [9000, 5001]] as const) {
      resetIdentifierCapForTests();
      const { client, calls } = server(cap);
      const out = await enableAndSyncContacts(ports(client, emails(size)));
      assert.equal(out.ok === false && out.reason, 'contacts-identifier-cap', `${cap}/${size}`);
      assert.equal(calls.some((c) => c.name === 'sync'), false, `${cap}/${size}`);
    }
  });

  it('a sync in a new process learns the limit once before refusing', async () => {
    const { client, calls } = server(5000);
    const out = await syncGrantedAddressBook(
      ports(client, emails(1200), { sourceId: 'ios_abcdef0123456789', contactsEpoch: 1 }),
    );
    assert.equal(out.ok, true);
    assert.deepEqual(calls.map((c) => c.name), ['refresh', 'sync']);
    assert.equal(calls[1].count, 1200);
  });

  it('a book within 500 never needs the extra refresh', async () => {
    const { client, calls } = server(undefined);
    const out = await syncGrantedAddressBook(
      ports(client, emails(300), { sourceId: 'ios_abcdef0123456789', contactsEpoch: 1 }),
    );
    assert.equal(out.ok, true);
    assert.deepEqual(calls.map((c) => c.name), ['sync']);
  });
});
