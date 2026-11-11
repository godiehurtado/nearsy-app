/**
 * Identity `identifierCap` (additive v1 on enable, refresh and sync replies):
 * effective limit = min(announced, 5000), 500 when absent or invalid. Over it
 * nothing is sent and the previous snapshot stays. Synthetic data only.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// es.ts uses extensionless relative imports, which only Metro resolves.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const {
  assertWireIdentifiers,
  collectContactIdentifiers,
  ContactsFlowStateError,
  effectiveIdentifierCap,
  parseContactsWireResult,
} = await import('../contactsHmac/contactsHmacCore.ts');
const { runEnableThenSync, runSyncRetry, identifierCapForState } = await import(
  '../contactsHmac/contactsSyncFlow.ts'
);
const { contactsCopyParams, contactsSnapshotFromState, contactsStatusCopyKey } = await import(
  '../contactsHmac/contactsSyncStatus.ts'
);
const { loadContactsLocalState, persistContactsLocalState, contactsStateStorageKey } =
  await import('../contactsHmac/contactsSource.ts');
const { FakeIdentity } = await import('./helpers/contactsIdentityFake.ts');
const { default: settingsEn } = await import('../i18n/resources/settings.ts');
const { es } = await import('../i18n/locales/es.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const SOURCE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const emails = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ kind: 'email' as const, value: `p${i + offset}@example.com` }));
const records = (n: number) => emails(n).map((row) => ({ emails: [{ email: row.value }] }));

function fresh() {
  return {
    sourceId: SOURCE_ID,
    contactsEpoch: 0,
    lastAckedVersion: null,
    lastAckedFingerprint: null,
    lastAckedEpoch: null,
    removedSnapshotFloor: null,
    userConsent: true,
  } as never;
}

/** A book that applies the limit it is given, like the Android one. */
function bookOf(rows: Array<{ emails: Array<{ email: string }> }>, seen: number[] = []) {
  return {
    getPermission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    readRecords: async (options?: { identifierCap?: number }) => {
      seen.push(options?.identifierCap ?? -1);
      const collected = collectContactIdentifiers(rows, { identifierCap: options?.identifierCap });
      if (!collected.ok && collected.reason === 'contacts-identifier-cap') return { capExceeded: true as const };
      if (!collected.ok) throw new Error(collected.reason);
      return collected.identifiers;
    },
  };
}

function setup(announcedCap: unknown, serverCap: number) {
  const identity = new FakeIdentity();
  identity.announcedCap = announcedCap;
  identity.serverCap = serverCap;
  const functions = { region: 'r', call: (n: string, d?: unknown) => identity.call(n, d) };
  return { identity, functions };
}

const wire = (extra: Record<string, unknown>) => ({
  result: 'refreshed',
  contactsSyncEnabled: true,
  contactsEpoch: 1,
  notifyNearbyContactsEffective: true,
  syncCommitted: true,
  reevaluateRequired: false,
  ...extra,
});

describe('identifierCap in Identity replies', () => {
  it('keeps only a safe integer >= 1; anything else is ignored, never a failed reply', () => {
    assert.equal(parseContactsWireResult(wire({ identifierCap: 5000 })).identifierCap, 5000);
    assert.equal(parseContactsWireResult(wire({ identifierCap: 1 })).identifierCap, 1);
    for (const bad of [0, -1, 1.5, '5000', null, true, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60, {}]) {
      const parsed = parseContactsWireResult(wire({ identifierCap: bad }));
      assert.equal('identifierCap' in parsed, false);
    }
    assert.equal('identifierCap' in parseContactsWireResult(wire({})), false);
  });

  it('effective limit: min(announced, 5000); 500 when absent or invalid', () => {
    assert.equal(effectiveIdentifierCap(undefined), 500);
    assert.equal(effectiveIdentifierCap(null), 500);
    assert.equal(effectiveIdentifierCap(0), 500);
    assert.equal(effectiveIdentifierCap(2.5), 500);
    assert.equal(effectiveIdentifierCap(1200), 1200);
    assert.equal(effectiveIdentifierCap(5000), 5000);
    assert.equal(effectiveIdentifierCap(8000), 5000);
  });
});

describe('the book against the limit', () => {
  it('counts unique normalized identifiers; duplicates never push a book over', () => {
    const rows = records(5000);
    rows.push({ emails: [{ email: 'P0@Example.com' }] }); // same as p0 once normalized
    const ok = collectContactIdentifiers(rows, { identifierCap: 5000 });
    assert.equal(ok.ok, true);
    assert.equal(ok.ok && ok.identifiers.length, 5000);
    assert.equal(ok.stats.duplicates, 1);
    const over = collectContactIdentifiers(records(5001), { identifierCap: 5000 });
    assert.equal(over.ok, false);
    assert.equal(!over.ok && over.reason, 'contacts-identifier-cap');
  });

  it('without a limit the old 500 applies', () => {
    const over = collectContactIdentifiers(records(501));
    assert.equal(!over.ok && over.reason, 'contacts-identifier-cap');
  });

  it('the wire never carries duplicates or more than the client maximum', () => {
    assert.equal(assertWireIdentifiers(emails(5000)).length, 5000);
    assert.throws(() => assertWireIdentifiers([...emails(2), emails(1)[0]]), /invalid/);
    assert.throws(() => assertWireIdentifiers(emails(5001)), /contacts-identifier-cap/);
  });
});

describe('sync with the announced limit', () => {
  it('Identity announces 5000: 1200 identifiers go in one request, whole', async () => {
    const { identity, functions } = setup(5000, 5000);
    const seen: number[] = [];
    const out = await runEnableThenSync({ functions, book: bookOf(records(1200), seen), state: fresh() });
    assert.deepEqual(seen, [5000]);
    assert.equal(identity.count('syncContactHashes'), 1);
    assert.equal(identity.last('syncContactHashes').identifiers.length, 1200);
    assert.equal(out.state.identifierCap, 5000);
    assert.equal(contactsSnapshotFromState(out.state), 'synced');
  });

  it('an announcement above 5000 is clamped: 5001 identifiers send nothing', async () => {
    const { identity, functions } = setup(8000, 8000);
    const seen: number[] = [];
    await assert.rejects(
      runEnableThenSync({ functions, book: bookOf(records(5001), seen), state: fresh() }),
      (err: unknown) => err instanceof Error && (err as { reason?: string }).reason === 'contacts-identifier-cap',
    );
    assert.deepEqual(seen, [5000]);
    assert.equal(identity.count('syncContactHashes'), 0);
  });

  it('older server (no field): 500; a larger book sends nothing and the previous sync stays', async () => {
    const { identity, functions } = setup(undefined, 500);
    const first = await runEnableThenSync({ functions, book: bookOf(records(10)), state: fresh() });
    assert.equal(first.state.identifierCap, null);
    const acked = first.state.lastAckedVersion;
    const seen: number[] = [];
    await assert.rejects(
      runSyncRetry({ functions, book: bookOf(records(600), seen), state: first.state }),
      (err: unknown) =>
        err instanceof ContactsFlowStateError &&
        err.reason === 'contacts-identifier-cap' &&
        err.state.lastAckedVersion === acked &&
        err.state.lastAckedFingerprint === first.state.lastAckedFingerprint,
    );
    assert.deepEqual(seen, [500]);
    assert.equal(identity.count('syncContactHashes'), 1);
  });

  it('a server that stops announcing falls back to 500 on its next reply', async () => {
    const { identity, functions } = setup(5000, 5000);
    const first = await runEnableThenSync({ functions, book: bookOf(records(20)), state: fresh() });
    assert.equal(identifierCapForState(first.state), 5000);
    identity.announcedCap = undefined;
    const second = await runSyncRetry({ functions, book: bookOf(records(21)), state: first.state });
    assert.equal(second.state.identifierCap, null);
    assert.equal(identifierCapForState(second.state), 500);
  });

  it('the union limit is Identity’s: refused, not shown as synced, previous ack kept', async () => {
    const { identity, functions } = setup(5000, 5000);
    const first = await runEnableThenSync({ functions, book: bookOf(records(10)), state: fresh() });
    // Another live source of the same account already holds 4995 others.
    (identity as unknown as { sourceKeys: Map<string, Set<string>> }).sourceKeys.set(
      'other-source-0001',
      new Set(emails(4995, 100000).map((row) => `email:${row.value}`)),
    );
    let failure: InstanceType<typeof ContactsFlowStateError> | null = null;
    try {
      await runSyncRetry({ functions, book: bookOf(records(10).concat(records(30).slice(10))), state: first.state });
    } catch (err) {
      failure = err as InstanceType<typeof ContactsFlowStateError>;
    }
    assert.equal(failure?.reason, 'contacts-union-cap');
    assert.equal(failure?.state.lastAckedVersion, first.state.lastAckedVersion);
    const status = {
      stateConfirmed: true,
      readFailed: false,
      disableInFlight: false,
      osPermission: 'granted',
      consent: true,
      enablement: 'enabled',
      snapshot: contactsSnapshotFromState(failure!.state),
      operation: null,
      stage: null,
      awaitingLateResult: false,
      errorKey: 'unionCap',
      notifyEffective: true,
      resultSeq: 1,
      uid: 'u',
      identifierLimit: identifierCapForState(failure!.state),
    } as const;
    assert.equal(contactsStatusCopyKey(status as never), 'errors.unionCap');
    assert.deepEqual(contactsCopyParams(status as never), { max: 5000 });
  });

  it('the limit survives a restart; a stored invalid value falls back to 500', async () => {
    const kv = new Map<string, string>();
    const store = {
      getItem: async (k: string) => kv.get(k) ?? null,
      setItem: async (k: string, v: string) => void kv.set(k, v),
      removeItem: async (k: string) => void kv.delete(k),
    };
    await persistContactsLocalState(store as never, 'u', { ...(fresh() as object), identifierCap: 5000 } as never);
    assert.equal((await loadContactsLocalState(store as never, 'u', SOURCE_ID)).identifierCap, 5000);
    const raw = JSON.parse(kv.get(contactsStateStorageKey('u'))!);
    kv.set(contactsStateStorageKey('u'), JSON.stringify({ ...raw, identifierCap: 'lots' }));
    const reloaded = await loadContactsLocalState(store as never, 'u', SOURCE_ID);
    assert.equal(identifierCapForState(reloaded), 500);
  });
});

describe('agreed behaviours stay', () => {
  it('a book read in full with no identifiers sends identifiers: []', async () => {
    const { identity, functions } = setup(5000, 5000);
    await runEnableThenSync({ functions, book: bookOf([]), state: fresh() });
    assert.deepEqual(identity.last('syncContactHashes').identifiers, []);
  });

  it('all identifiers invalid, or a failed read, sends nothing', async () => {
    for (const readRecords of [
      async () => {
        throw new Error('contacts-identifier-invalid');
      },
      async () => {
        throw new Error('read failed');
      },
    ]) {
      const { identity, functions } = setup(5000, 5000);
      await assert.rejects(
        runEnableThenSync({ functions, book: { ...bookOf([]), readRecords }, state: fresh() }),
      );
      assert.equal(identity.count('syncContactHashes'), 0);
    }
  });

  it('"synced" needs syncCommitted=true; consent and enablement alone are not', async () => {
    const { identity, functions } = setup(5000, 5000);
    identity.intercept = (name, data) =>
      name === 'syncContactHashes'
        ? { ...(identity.commit(name, data) as object), syncCommitted: false }
        : undefined;
    const out = await runEnableThenSync({ functions, book: bookOf(records(3)), state: fresh() });
    assert.equal(out.state.enablementConfirmed, true);
    assert.notEqual(contactsSnapshotFromState(out.state), 'synced');
  });

  it('a cap error is shown in place of an older "synced"', () => {
    const base = {
      uid: 'u',
      stateConfirmed: true,
      readFailed: false,
      disableInFlight: false,
      osPermission: 'granted',
      consent: true,
      enablement: 'enabled',
      snapshot: 'synced',
      operation: null,
      stage: null,
      awaitingLateResult: false,
      notifyEffective: true,
      resultSeq: 1,
    } as const;
    assert.equal(contactsStatusCopyKey({ ...base, errorKey: null } as never), 'status.synced');
    for (const key of ['identifierCap', 'unionCap', 'identifierInvalid'] as const) {
      assert.equal(contactsStatusCopyKey({ ...base, errorKey: key } as never), `errors.${key}`);
    }
  });
});

describe('copy (EN/ES)', () => {
  const enErrors = settingsEn.contactsSync.errors as Record<string, string>;
  const esSync = (es as { settings: { contactsSync: Record<string, any> } }).settings.contactsSync;

  it('limit messages name the limit and never ask to delete contacts', () => {
    for (const text of [enErrors.identifierCap, enErrors.unionCap, esSync.errors.identifierCap, esSync.errors.unionCap]) {
      assert.match(text, /\{\{max\}\}/);
      assert.doesNotMatch(text, /\b500\b|delete|remove|borra|elimina|quita/i);
    }
  });

  it('every Contacts alert, status and button exists in both languages', () => {
    const keys = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    assert.deepEqual(keys(esSync).sort(), keys(settingsEn.contactsSync as never).sort());
    for (const key of keys(esSync)) {
      const value = key.split('.').reduce((o: any, k) => o[k], esSync);
      assert.ok(typeof value === 'string' && value.trim().length > 0, key);
    }
  });

  it('More passes the limit to the section copy and to the alert', () => {
    const more = src('screens/MoreScreen.tsx');
    assert.ok(more.includes('contactsCopyParams(contactsStatus)'));
    assert.ok(more.includes('contactsCopyParams(getContactsSyncStatus())'));
  });
});
