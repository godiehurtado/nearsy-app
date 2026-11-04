/**
 * Android 2.0.9 Contacts: what may be claimed, and what happens when a reply is
 * late, lost or for another account. Behavior tests against a fake Identity that
 * applies the real rules (epoch, version, conflict, fence).
 * Run: node --experimental-strip-types --test packages/shared/src/__tests__/android209ContactsReliability.test.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import settingsEn from '../i18n/resources/settings.ts';
import {
  DISABLE_CONTACTS_SYNC,
  ENABLE_CONTACTS_SYNC,
  REFRESH_VERIFIED_ACTOR_KEYS,
  REMOVE_CONTACT_SOURCE,
  SYNC_CONTACT_HASHES,
  type ContactIdentifierInput,
} from '../contactsHmac/contactsHmacContract.ts';
import {
  ContactsHmacError,
  contactsHmacErrorToI18nKey,
  identifiersFingerprint,
  isContactsOutcomeUncertain,
  mapContactsCallableError,
  snapshotVersionForUpload,
  type ContactsErrorI18nKey,
} from '../contactsHmac/contactsHmacCore.ts';
import {
  contactsStateStorageKey,
  loadContactsLocalState,
  persistContactsLocalState,
} from '../contactsHmac/contactsSource.ts';
import {
  contactsCanRetry,
  contactsOperationInFlight,
  contactsStatusCopyKey,
  contactsToggleValue,
  mergeUserDocIntoState,
} from '../contactsHmac/contactsSyncStatus.ts';
import { createContactsSyncSession } from '../contactsHmac/contactsSyncSession.ts';
import {
  applyLateIdentityResult,
  runDisable,
  runEnableThenSync,
  runResyncGrantedBook,
  type ContactsBookPort,
  type ContactsLocalState,
  type ContactsPermissionStatus,
} from '../contactsHmac/contactsSyncFlow.ts';

import { FakeIdentity, identityRejects } from './helpers/contactsIdentityFake.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOOK_A: ContactIdentifierInput[] = [{ kind: 'email', value: 'ada@b.co' }];
const BOOK_B: ContactIdentifierInput[] = [
  { kind: 'email', value: 'ada@b.co' },
  { kind: 'phone', value: '+14155550100' },
];

function delay(ms = 0): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 300; i += 1) {
    if (check()) return;
    await delay(2);
  }
  assert.fail(`timed out waiting for: ${label}`);
}

const reason = identityRejects;

function networkDown(): Error {
  return Object.assign(new Error('network error'), { code: 'functions/unavailable' });
}

function memoryStore(initial: Record<string, string> = {}) {
  const mem = new Map(Object.entries(initial));
  return {
    mem,
    async getItem(key: string) {
      return mem.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      mem.set(key, value);
    },
    async removeItem(key: string) {
      mem.delete(key);
    },
  };
}

function fakeBook(input?: {
  permission?: ContactsPermissionStatus;
  requested?: ContactsPermissionStatus;
  book?: ContactIdentifierInput[];
}) {
  const book = {
    permission: input?.permission ?? 'granted',
    requested: input?.requested ?? input?.permission ?? 'granted',
    identifiers: input?.book ?? BOOK_A,
    requests: 0,
    reads: 0,
    port(): ContactsBookPort {
      return {
        getPermission: async () => book.permission,
        requestPermission: async () => {
          book.requests += 1;
          book.permission = book.requested;
          return book.requested;
        },
        readRecords: async () => {
          book.reads += 1;
          return book.identifiers;
        },
      };
    },
  };
  return book;
}

function harness(opts?: {
  uid?: string | null;
  book?: ReturnType<typeof fakeBook>;
  store?: ReturnType<typeof memoryStore>;
  timeoutMs?: number;
  scheduleReevaluate?: () => void;
}) {
  const env = {
    uid: (opts?.uid === undefined ? 'uid-a' : opts.uid) as string | null,
    identity: new FakeIdentity(),
    book: opts?.book ?? fakeBook(),
    store: opts?.store ?? memoryStore(),
    reevaluations: 0,
  };
  let nextSource = 0;
  const raw = createContactsSyncSession({
    currentUid: () => env.uid,
    store: env.store,
    randomBytes: () => {
      nextSource += 1;
      return new Uint8Array(16).fill(nextSource);
    },
    region: 'us-central1',
    callIdentity: (name, data) => {
      env.identity.uid = env.uid ?? '';
      return env.identity.call(name, data);
    },
    createBook: () => env.book.port(),
    ensureAppCheck: async () => {},
    scheduleReevaluate:
      opts?.scheduleReevaluate ??
      (() => {
        env.reevaluations += 1;
      }),
    timeoutMs: opts?.timeoutMs ?? 40,
  });
  /** What More does on mount: reads the account. */
  const readAccount = async () => {
    if (env.uid && !raw.getStatus().stateConfirmed) {
      await raw.bindUserDoc(env.uid, env.identity.userDoc());
    }
  };
  const session = {
    ...raw,
    enableThenSync: async () => {
      await readAccount();
      return raw.enableThenSync();
    },
    retry: async () => {
      await readAccount();
      return raw.retry();
    },
    disable: async () => {
      await readAccount();
      return raw.disable();
    },
  };
  return { env, session, raw };
}

type Env = ReturnType<typeof harness>['env'];

/** Identity already wrote; the reply is still in the air. Applies to one call. */
function replyHeldAfterCommit(env: Env, target: string) {
  const held = { fail: () => {}, reply: () => {} };
  env.identity.intercept = (name, data) => {
    if (name !== target) return undefined;
    env.identity.intercept = null;
    const value = env.identity.commit(name, data);
    return new Promise((resolve, reject) => {
      held.fail = () => reject(networkDown());
      held.reply = () => resolve(value);
    });
  };
  return held;
}

/** The request has not reached Identity yet. Applies to one call. */
function requestHeldInTransit(env: Env, target: string) {
  const held = { land: (): 'landed' | 'rejected' => 'rejected' };
  env.identity.intercept = (name, data) => {
    if (name !== target) return undefined;
    env.identity.intercept = null;
    return new Promise((resolve, reject) => {
      held.land = () => {
        try {
          resolve(env.identity.commit(name, data));
          return 'landed';
        } catch (err) {
          reject(err);
          return 'rejected';
        }
      };
    });
  };
  return held;
}

/** Same account, new session: what a sign-out or an app restart leaves behind. */
function newSessionSameAccount(
  env: Env,
  session: Pick<ReturnType<typeof harness>['raw'], 'handleAuthChanged'>,
): void {
  const uid = env.uid;
  env.uid = null;
  session.handleAuthChanged(null);
  env.uid = uid;
  session.handleAuthChanged(uid);
}

function savedState(
  store: ReturnType<typeof memoryStore>,
  uid = 'uid-a',
): ContactsLocalState {
  return JSON.parse(store.mem.get(contactsStateStorageKey(uid)) ?? 'null');
}

describe('syncCommitted is the only proof of a synced snapshot', () => {
  it('confirms and acks on a synced result', async () => {
    const { env, session } = harness();
    const op = await session.enableThenSync();
    assert.equal(op.status, 'ok');
    const status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.snapshot, 'synced');
    assert.equal(status.consent, true);
    assert.equal(status.osPermission, 'granted');
    assert.equal(contactsStatusCopyKey(status), 'status.synced');
    assert.equal(contactsCanRetry(status), false);
    await until(() => savedState(env.store)?.lastAckedVersion === 1, 'ack saved');
  });

  it('does not ack or claim synced when syncCommitted is false', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name, data) => {
      if (name !== SYNC_CONTACT_HASHES) return undefined;
      const committed = env.identity.commit(name, data) as Record<string, unknown>;
      return { ...committed, syncCommitted: false };
    };
    await session.enableThenSync();
    const status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.snapshot, 'pending');
    assert.equal(contactsStatusCopyKey(status), 'status.enabledPendingSync');
    assert.equal(contactsCanRetry(status), true);
    const saved = savedState(env.store);
    assert.equal(saved.lastAckedVersion, null);
    assert.equal(saved.lastAckedFingerprint, null);
    assert.equal(saved.pendingUpload?.version, 1);
  });

  it('does not ack a committed reply that is not a sync result', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name, data) =>
      name === SYNC_CONTACT_HASHES
        ? {
            ...(env.identity.commit(name, data) as Record<string, unknown>),
            result: 'removed',
          }
        : undefined;
    await session.enableThenSync();
    assert.equal(session.getStatus().snapshot, 'pending');
    assert.equal(savedState(env.store).lastAckedVersion, null);
  });

  it('does not ack a reply for another version', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name, data) =>
      name === SYNC_CONTACT_HASHES
        ? {
            ...(env.identity.commit(name, data) as Record<string, unknown>),
            snapshotVersion: data.snapshotVersion + 7,
          }
        : undefined;
    await session.enableThenSync();
    assert.equal(session.getStatus().snapshot, 'pending');
  });

  it('a reevaluate failure does not invalidate a confirmed sync', async () => {
    const { env, session } = harness({
      scheduleReevaluate: () => {
        throw new Error('reevaluate boom');
      },
    });
    const op = await session.enableThenSync();
    assert.equal(op.status, 'ok');
    assert.equal(session.getStatus().snapshot, 'synced');
    await until(() => savedState(env.store)?.reevaluateOwed === true, 'owed saved');
    assert.equal(savedState(env.store).lastAckedVersion, 1);
  });
});

describe('Enable confirmed, then a later stage fails', () => {
  it('keeps enabled and the confirmed epoch when sync fails, offering a retry', async () => {
    const { env, session } = harness();
    env.identity.epoch = 5;
    env.identity.intercept = (name) => {
      if (name === SYNC_CONTACT_HASHES) throw reason('contacts-rate-limited');
      return undefined;
    };
    const op = await session.enableThenSync();
    assert.equal(op.status, 'failed');
    const status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.snapshot, 'pending');
    assert.equal(contactsToggleValue(status), true);
    assert.equal(contactsStatusCopyKey(status), 'status.enabledRateLimited');
    assert.equal(contactsCanRetry(status), true);
    await until(() => savedState(env.store)?.contactsEpoch === 5, 'epoch saved');
    assert.equal(env.reevaluations, 1, 'enable asked for reevaluate');
    assert.equal(status.notifyEffective, true);
  });

  it('a retry after that failure completes the sync', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name) => {
      if (name === SYNC_CONTACT_HASHES) throw reason('contacts-rate-limited');
      return undefined;
    };
    await session.enableThenSync();
    env.identity.intercept = null;
    const op = await session.retry();
    assert.equal(op.status, 'ok');
    assert.equal(session.getStatus().snapshot, 'synced');
  });

  it('keeps enabled when remove fails after a denied permission', async () => {
    const book = fakeBook({ permission: 'undetermined', requested: 'denied' });
    const { env, session } = harness({ book });
    env.identity.intercept = (name) => {
      if (name === REMOVE_CONTACT_SOURCE) throw reason('contacts-hmac-unavailable');
      return undefined;
    };
    const op = await session.enableThenSync();
    assert.equal(op.status, 'failed');
    const status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.snapshot, 'pending');
    assert.equal(status.osPermission, 'denied');
    assert.equal(contactsStatusCopyKey(status), 'status.enabledPermissionDenied');
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), 0);
  });

  it('keeps enabled and a retryable state when remove times out', async () => {
    const book = fakeBook({ permission: 'undetermined', requested: 'denied' });
    const { env, session } = harness({ book, timeoutMs: 15 });
    const held = replyHeldAfterCommit(env, REMOVE_CONTACT_SOURCE);
    const op = await session.enableThenSync();
    assert.equal(op.status, 'uncertain');
    assert.equal(session.getStatus().enablement, 'enabled');
    assert.equal(savedState(env.store).uncertainOp, 'remove');
    held.fail();
    await until(() => !session.getStatus().awaitingLateResult, 'request settled');
    book.requested = 'granted';
    const retried = await session.retry();
    assert.equal(retried.status, 'ok');
    assert.equal(session.getStatus().snapshot, 'synced');
  });

  it('never synced in the snapshot sense when the book read fails', async () => {
    const book = fakeBook();
    book.port = () => ({
      getPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      readRecords: async () => {
        throw new Error('read failed');
      },
    });
    const { env, session } = harness({ book });
    const op = await session.enableThenSync();
    assert.equal(op.status, 'failed');
    assert.equal(session.getStatus().enablement, 'enabled');
    assert.equal(session.getStatus().snapshot, 'pending');
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), 0);
  });

  it('epoch from enable wins over any older local value', async () => {
    const book = fakeBook();
    const stale: ContactsLocalState = {
      sourceId: 'sourceId1',
      contactsEpoch: 2,
      lastAckedVersion: 3,
      lastAckedFingerprint: identifiersFingerprint(BOOK_A),
      lastAckedEpoch: 2,
      removedSnapshotFloor: null,
    };
    const identity = new FakeIdentity();
    identity.epoch = 9;
    const outcome = await runEnableThenSync({
      functions: { region: 'r', call: (n, d) => identity.call(n, d) },
      book: book.port(),
      state: stale,
    });
    assert.equal(identity.last(SYNC_CONTACT_HASHES).contactsEpoch, 9);
    assert.equal(outcome.state.contactsEpoch, 9);
    assert.equal(outcome.state.lastAckedEpoch, 9);
    assert.equal(identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 4);
  });
});

describe('Timeout means unknown', () => {
  it('uncertain enable stays pending, not reverted, and a late result settles it', async () => {
    const { env, session } = harness({ timeoutMs: 15 });
    let finish: (v: unknown) => void = () => {};
    env.identity.intercept = (name, data) => {
      if (name !== ENABLE_CONTACTS_SYNC) return undefined;
      const value = env.identity.commit(name, data);
      return new Promise((done) => {
        finish = () => done(value);
      });
    };
    const op = await session.enableThenSync();
    assert.equal(op.status, 'uncertain');
    let status = session.getStatus();
    assert.equal(status.enablement, 'enable_uncertain');
    assert.equal(status.awaitingLateResult, true);
    assert.equal(contactsToggleValue(status), false, 'not drawn as enabled');
    assert.equal(contactsCanRetry(status), false);
    assert.equal(contactsStatusCopyKey(status), 'status.awaitingResult');

    finish(undefined);
    await until(() => !session.getStatus().awaitingLateResult, 'late enable');
    status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.snapshot, 'pending', 'no sync is claimed');
    assert.equal(env.book.requests, 0, 'a late result never prompts');
    assert.equal(env.reevaluations, 1, 'first enable asked for reevaluate');
  });

  it('uncertain disable stays pending and a retry after it landed reads as done', async () => {
    const { env, session } = harness({ timeoutMs: 15 });
    await session.enableThenSync();
    env.reevaluations = 0;
    const held = replyHeldAfterCommit(env, DISABLE_CONTACTS_SYNC);
    const op = await session.disable();
    assert.equal(op.status, 'uncertain');
    let status = session.getStatus();
    assert.equal(status.enablement, 'disable_uncertain');
    assert.equal(contactsToggleValue(status), true, 'not drawn as off');
    held.fail();
    await until(() => !session.getStatus().awaitingLateResult, 'request settled');
    status = session.getStatus();
    assert.equal(contactsStatusCopyKey(status), 'status.disableUncertain');
    assert.equal(contactsCanRetry(status), true);

    const retried = await session.retry();
    assert.equal(retried.status, 'ok');
    status = session.getStatus();
    assert.equal(status.enablement, 'off');
    assert.equal(status.consent, false);
    assert.equal(env.identity.enabled, false);
    assert.equal(env.identity.epoch, 1, 'the retry did not disable a second time');
    await until(() => savedState(env.store)?.contactsEpoch === 1, 'epoch saved');
    assert.equal(env.reevaluations, 1, 'owed from the lost reply');
  });

  it('transport failure is uncertain immediately, without waiting for a timeout', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name) => {
      if (name === ENABLE_CONTACTS_SYNC) throw networkDown();
      return undefined;
    };
    const op = await session.enableThenSync();
    assert.equal(op.status, 'uncertain');
    assert.equal(session.getStatus().enablement, 'enable_uncertain');
    assert.equal(session.getStatus().awaitingLateResult, false);
    assert.equal(contactsCanRetry(session.getStatus()), true);
  });

  it('a late refusal clears the uncertainty and shows the real reason', async () => {
    const { env, session } = harness({ timeoutMs: 15 });
    let refuse: () => void = () => {};
    env.identity.intercept = (name) =>
      name === ENABLE_CONTACTS_SYNC
        ? new Promise((_, reject) => {
            refuse = () => reject(reason('contacts-auth-lookup-failed'));
          })
        : undefined;
    await session.enableThenSync();
    refuse();
    await until(() => !session.getStatus().awaitingLateResult, 'late refusal');
    const status = session.getStatus();
    assert.equal(status.enablement, 'off');
    assert.equal(status.errorKey, 'authLookup');
    assert.equal(contactsStatusCopyKey(status), 'errors.authLookup');
  });

  it('a late sync result acks the version that was sent', async () => {
    const { env, session } = harness({ timeoutMs: 15 });
    let finish: () => void = () => {};
    env.identity.intercept = (name, data) => {
      if (name !== SYNC_CONTACT_HASHES) return undefined;
      const value = env.identity.commit(name, data);
      return new Promise((done) => {
        finish = () => done(value);
      });
    };
    const op = await session.enableThenSync();
    assert.equal(op.status, 'uncertain');
    assert.equal(session.getStatus().snapshot, 'uncertain');
    assert.equal(session.getStatus().enablement, 'enabled');
    finish();
    await until(() => session.getStatus().snapshot === 'synced', 'late ack');
    await until(() => savedState(env.store)?.lastAckedVersion === 1, 'ack saved');
  });

  it('time passing unlocks nothing and declares nothing', async () => {
    const { env, session } = harness({ timeoutMs: 5 });
    env.identity.intercept = (name) =>
      name === ENABLE_CONTACTS_SYNC ? new Promise(() => {}) : undefined;
    await session.enableThenSync();
    await delay(60);
    const status = session.getStatus();
    assert.equal(status.awaitingLateResult, true);
    assert.equal(status.enablement, 'enable_uncertain');
    assert.equal(contactsOperationInFlight(status), true);
    assert.equal(contactsCanRetry(status), false);
    assert.equal((await session.enableThenSync()).status, 'in_flight');
    assert.equal(env.identity.count(ENABLE_CONTACTS_SYNC), 1);
    assert.equal(savedState(env.store).uncertainOp, 'enable');
  });
});

describe('Single flight', () => {
  it('a second tap while the first runs sends nothing', async () => {
    const { env, session } = harness();
    let release: () => void = () => {};
    env.identity.intercept = (name, data) => {
      if (name !== ENABLE_CONTACTS_SYNC) return undefined;
      const value = env.identity.commit(name, data);
      return new Promise((done) => {
        release = () => done(value);
      });
    };
    const first = session.enableThenSync();
    const second = await session.enableThenSync();
    assert.equal(second.status, 'in_flight');
    await until(() => env.identity.count(ENABLE_CONTACTS_SYNC) === 1, 'sent');
    release();
    assert.equal((await first).status, 'ok');
    assert.equal(env.identity.count(ENABLE_CONTACTS_SYNC), 1);
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), 1);
  });

  it('after a timeout, no retry overlaps the original until it settles', async () => {
    const { env, session } = harness({ timeoutMs: 10 });
    let release: () => void = () => {};
    env.identity.intercept = (name, data) => {
      if (name !== SYNC_CONTACT_HASHES) return undefined;
      const value = env.identity.commit(name, data);
      return new Promise((done) => {
        release = () => done(value);
      });
    };
    await session.enableThenSync();
    assert.equal((await session.retry()).status, 'in_flight');
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), 1);
    release();
    await until(() => !session.getStatus().awaitingLateResult, 'settled');
    assert.equal(session.getStatus().snapshot, 'synced');
  });

});

describe('Rate limit is an explicit result', () => {
  const GAP_MS = 60;

  it('enable then sync sends both immediately and keeps what enable confirmed', async () => {
    const { env, session } = harness();
    env.identity.epoch = 4;
    env.identity.intercept = (name) => {
      if (name === SYNC_CONTACT_HASHES) throw reason('contacts-rate-limited');
      return undefined;
    };
    const op = await session.enableThenSync();
    assert.equal(op.status, 'failed');
    assert.equal(
      (op as { error: ContactsHmacError }).error.reason,
      'contacts-rate-limited',
    );
    const status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.snapshot, 'pending');
    assert.equal(status.consent, true);
    assert.equal(status.errorKey, 'rateLimited');
    assert.equal(contactsStatusCopyKey(status), 'status.enabledRateLimited');
    assert.equal(contactsCanRetry(status), true);
    await until(() => savedState(env.store)?.contactsEpoch === 4, 'epoch saved');
    assert.equal(savedState(env.store).lastAckedVersion, null);
  });

  it('never retries by itself', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name) => {
      if (name === SYNC_CONTACT_HASHES) throw reason('contacts-rate-limited');
      return undefined;
    };
    await session.enableThenSync();
    const calls = env.identity.calls.length;
    await delay(GAP_MS * 2);
    assert.equal(env.identity.calls.length, calls);
    assert.equal(session.getStatus().snapshot, 'pending');
  });

  it('a manual retry sends only the sync, reuses the version and completes', async () => {
    const { env, session } = harness();
    let limited = 2;
    env.identity.intercept = (name) => {
      if (name === SYNC_CONTACT_HASHES && limited > 0) {
        limited -= 1;
        throw reason('contacts-rate-limited');
      }
      return undefined;
    };
    await session.enableThenSync();
    await until(() => savedState(env.store)?.pendingUpload != null, 'intent saved');
    const version = savedState(env.store).pendingUpload?.version;
    // Tapping too soon is harmless: same answer, same version, nothing lost.
    assert.equal((await session.retry()).status, 'failed');
    assert.equal(session.getStatus().enablement, 'enabled');
    assert.equal((await session.retry()).status, 'ok');
    assert.equal(session.getStatus().snapshot, 'synced');
    assert.equal(env.identity.count(ENABLE_CONTACTS_SYNC), 1, 'enable not repeated');
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, version);
  });

  it('a refused retry leaves an earlier unknown upload unknown', async () => {
    const { env, session } = harness({ timeoutMs: 10 });
    const held = replyHeldAfterCommit(env, SYNC_CONTACT_HASHES);
    await session.enableThenSync();
    held.fail();
    await until(() => contactsCanRetry(session.getStatus()), 'retryable');
    env.identity.intercept = (name) => {
      if (name === SYNC_CONTACT_HASHES) throw reason('contacts-rate-limited');
      return undefined;
    };
    assert.equal((await session.retry()).status, 'failed');
    assert.equal(session.getStatus().snapshot, 'uncertain');
  });

  it('a refused disable stays a pending disable: it set no barrier, and it is retried', async () => {
    const { env, session } = harness();
    await session.enableThenSync();
    env.identity.intercept = (name) => {
      if (name === DISABLE_CONTACTS_SYNC) throw reason('contacts-hmac-unavailable');
      return undefined;
    };
    assert.equal((await session.disable()).status, 'failed');
    const status = session.getStatus();
    assert.equal(status.enablement, 'disable_uncertain');
    assert.equal(status.consent, false);
    assert.equal(contactsCanRetry(status), true);
    env.identity.intercept = null;
    assert.equal((await session.retry()).status, 'ok');
    assert.equal(session.getStatus().enablement, 'off');
    assert.equal(env.identity.enabled, false);
  });

  it('a disable behind the live epoch adopts it and stops there', async () => {
    const identity = new FakeIdentity();
    identity.enabled = true;
    identity.epoch = 7;
    await assert.rejects(
      runDisable({
        functions: { region: 'r', call: (n, d) => identity.call(n, d) },
        state: {
          sourceId: 'sourceId1',
          contactsEpoch: 2,
          lastAckedVersion: null,
          lastAckedFingerprint: null,
          removedSnapshotFloor: null,
        },
      }),
      (err: any) => {
        assert.equal(err.reason, 'contacts-epoch-mismatch');
        assert.equal(err.state.contactsEpoch, 7);
        assert.equal(err.state.uncertainOp, 'disable');
        return true;
      },
    );
    assert.equal(identity.count(DISABLE_CONTACTS_SYNC), 1, 'not sent again by itself');
    assert.equal(identity.enabled, true);
  });

  it('does not depend on a wait hint the contract does not provide', () => {
    for (const file of ['contactsSyncFlow.ts', 'contactsSyncSession.ts', 'contactsHmacCore.ts']) {
      const source = readFileSync(join(SRC, 'contactsHmac', file), 'utf8');
      assert.doesNotMatch(source, /retry.?after/i, file);
    }
  });
});

describe('Idempotent retries', () => {
  it('same snapshot reuses the version and is idempotent on Identity', async () => {
    const { env, session } = harness({ timeoutMs: 10 });
    const held = replyHeldAfterCommit(env, SYNC_CONTACT_HASHES);
    await session.enableThenSync();
    held.fail();
    await until(() => contactsCanRetry(session.getStatus()), 'retryable');
    env.reevaluations = 0;
    const op = await session.retry();
    assert.equal(op.status, 'ok');
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 1);
    assert.equal(session.getStatus().snapshot, 'synced');
    assert.equal(
      env.reevaluations,
      1,
      'still owed although the idempotent reply does not ask for it',
    );
  });

  it('changed content after an unknown result uses a higher version', async () => {
    const book = fakeBook();
    const { env, session } = harness({ book, timeoutMs: 10 });
    const held = replyHeldAfterCommit(env, SYNC_CONTACT_HASHES);
    await session.enableThenSync();
    held.fail();
    await until(() => contactsCanRetry(session.getStatus()), 'retryable');
    book.identifiers = BOOK_B;
    const op = await session.retry();
    assert.equal(op.status, 'ok', 'no snapshot conflict');
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 2);
    assert.equal(env.identity.sources.size, 1);
  });

  it('after a conflict the next upload goes above the taken version', async () => {
    const { env, session } = harness();
    await session.enableThenSync();
    const sourceId = savedState(env.store).sourceId;
    env.identity.sources.set(sourceId, { version: 2, fingerprint: 'fp1:other' });
    env.book.identifiers = BOOK_B;
    const first = await session.retry();
    assert.equal(first.status, 'failed');
    assert.equal((first as { error: ContactsHmacError }).error.reason, 'contacts-snapshot-conflict');
    assert.equal(session.getStatus().snapshot, 'pending');
    assert.equal((await session.retry()).status, 'ok');
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 3);
  });

  it('never persists the address book', async () => {
    const book = fakeBook({ book: BOOK_B });
    const { env, session } = harness({ book, timeoutMs: 10 });
    env.identity.intercept = (name, data) => {
      if (name !== SYNC_CONTACT_HASHES) return undefined;
      env.identity.commit(name, data);
      return new Promise(() => {});
    };
    await session.enableThenSync();
    await until(() => savedState(env.store)?.uncertainOp === 'sync', 'intent');
    const everything = JSON.stringify([...env.store.mem.entries()]);
    assert.doesNotMatch(everything, /ada@b\.co|\+14155550100/);
  });

  it('version helper keeps every invariant', () => {
    const fp = 'fp1:a';
    const other = 'fp1:b';
    const base = {
      lastAckedVersion: null,
      lastAckedFingerprint: null,
      nextFingerprint: fp,
    };
    assert.equal(snapshotVersionForUpload(base), 1);
    assert.equal(
      snapshotVersionForUpload({
        ...base,
        pendingUpload: { version: 4, fingerprint: fp },
        highestAttemptedVersion: 4,
      }),
      4,
    );
    assert.equal(
      snapshotVersionForUpload({
        ...base,
        pendingUpload: { version: 4, fingerprint: other },
        highestAttemptedVersion: 4,
      }),
      5,
    );
    // Back to an older book: its acked version is below what may be stored.
    assert.equal(
      snapshotVersionForUpload({
        lastAckedVersion: 2,
        lastAckedFingerprint: fp,
        nextFingerprint: fp,
        highestAttemptedVersion: 3,
      }),
      4,
    );
    // A fence always wins over a pending version.
    assert.equal(
      snapshotVersionForUpload({
        ...base,
        pendingUpload: { version: 4, fingerprint: fp },
        removedSnapshotFloor: 4,
      }),
      5,
    );
  });
});

describe('Reconciliation', () => {
  function uncertainSyncState(sourceId: string): ContactsLocalState {
    return {
      sourceId,
      contactsEpoch: 3,
      lastAckedVersion: null,
      lastAckedFingerprint: null,
      removedSnapshotFloor: null,
      pendingUpload: { version: 2, fingerprint: identifiersFingerprint(BOOK_A), epoch: 3 },
      highestAttemptedVersion: 2,
      uncertainOp: 'sync',
      reevaluateOwed: true,
      enablementConfirmed: true,
      userConsent: true,
    };
  }

  for (const permission of ['undetermined', 'denied'] as const) {
    it(`with permission ${permission} it deletes nothing, claims nothing and prompts nobody`, async () => {
      const identity = new FakeIdentity();
      const book = fakeBook({ permission });
      const state = uncertainSyncState('sourceId1');
      const outcome = await runResyncGrantedBook({
        functions: { region: 'r', call: (n, d) => identity.call(n, d) },
        book: book.port(),
        state,
      });
      assert.equal(identity.calls.length, 0);
      assert.equal(book.requests, 0);
      assert.equal(book.reads, 0);
      assert.equal(outcome.result, null);
      assert.deepEqual(outcome.state, state);
    });
  }

  it('re-opening the screen re-sends an unconfirmed upload with the same version', async () => {
    const store = memoryStore();
    const { env, session } = harness({ store });
    await store.setItem(
      'nearsy.contacts.sourceId.v2:uid-a',
      'sourceId1',
    );
    await persistContactsLocalState(store, 'uid-a', uncertainSyncState('sourceId1'));
    env.identity.enabled = true;
    env.identity.epoch = 3;
    env.identity.sources.set('sourceId1', {
      version: 2,
      fingerprint: identifiersFingerprint(BOOK_A),
    });
    await session.bindUserDoc('uid-a', { contactsSyncEnabled: true, contactsEpoch: 3 });
    await until(() => session.getStatus().snapshot === 'synced', 'reconciled');
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 2);
    assert.equal(env.book.requests, 0);
    assert.equal(env.reevaluations, 1, 'owed survived the restart');
  });

  it('does not touch the book for an account without local consent', async () => {
    const store = memoryStore();
    const { env, session } = harness({ store });
    await store.setItem('nearsy.contacts.sourceId.v2:uid-a', 'sourceId1');
    await persistContactsLocalState(store, 'uid-a', {
      ...uncertainSyncState('sourceId1'),
      userConsent: false,
    });
    await session.bindUserDoc('uid-a', { contactsSyncEnabled: true, contactsEpoch: 3 });
    await delay(10);
    assert.equal(env.book.reads, 0);
    assert.equal(env.identity.calls.length, 0);
    assert.equal(session.getStatus().consent, false);
  });

  it('never marks consent from the server alone', async () => {
    const { session } = harness();
    await session.bindUserDoc('uid-a', { contactsSyncEnabled: true, contactsEpoch: 0 });
    const status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.consent, false);
    assert.equal(status.snapshot, 'pending');
  });

  it('user doc settles uncertain enable and disable', () => {
    const base = uncertainSyncState('sourceId1');
    const enabling: ContactsLocalState = {
      ...base,
      uncertainOp: 'enable',
      enablementConfirmed: false,
    };
    const confirmed = mergeUserDocIntoState(enabling, {
      contactsSyncEnabled: true,
      contactsEpoch: 3,
    });
    assert.equal(confirmed.uncertainOp, null);
    assert.equal(confirmed.enablementConfirmed, true);
    // Not on the server yet: unknown, not "failed".
    assert.equal(
      mergeUserDocIntoState(enabling, { contactsSyncEnabled: false, contactsEpoch: 3 })
        .uncertainOp,
      'enable',
    );
    const disabling: ContactsLocalState = { ...base, uncertainOp: 'disable' };
    const off = mergeUserDocIntoState(disabling, {
      contactsSyncEnabled: false,
      contactsEpoch: 4,
    });
    assert.equal(off.uncertainOp, null);
    assert.equal(off.enablementConfirmed, false);
    assert.equal(
      mergeUserDocIntoState(disabling, { contactsSyncEnabled: true, contactsEpoch: 3 })
        .uncertainOp,
      'disable',
    );
  });

  it('a stale cached doc cannot lower the epoch or undo a confirmation', () => {
    const state = { ...uncertainSyncState('sourceId1'), uncertainOp: null };
    assert.equal(
      mergeUserDocIntoState(state, { contactsSyncEnabled: false, contactsEpoch: 1 }),
      state,
    );
    const sameEpoch = mergeUserDocIntoState(state, {
      contactsSyncEnabled: false,
      contactsEpoch: 3,
    });
    assert.equal(sameEpoch.enablementConfirmed, true);
  });

  it('a newer epoch voids the old ack but keeps the version floor', () => {
    const state: ContactsLocalState = {
      ...uncertainSyncState('sourceId1'),
      uncertainOp: null,
      pendingUpload: null,
      lastAckedVersion: 6,
      lastAckedFingerprint: 'fp1:a',
      lastAckedEpoch: 3,
    };
    const next = mergeUserDocIntoState(state, {
      contactsSyncEnabled: true,
      contactsEpoch: 8,
    });
    assert.equal(next.lastAckedVersion, null);
    assert.equal(next.contactsEpoch, 8);
    assert.equal(next.highestAttemptedVersion, 6);
  });
});

describe('An unreadable reply is unknown, not a refusal', () => {
  it('keeps enable pending and retryable', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name) =>
      name === ENABLE_CONTACTS_SYNC ? { result: 'enabled' } : undefined;
    assert.equal((await session.enableThenSync()).status, 'uncertain');
    assert.equal(session.getStatus().enablement, 'enable_uncertain');
    assert.equal(contactsCanRetry(session.getStatus()), true);
  });

  it('never shows server text to the user', () => {
    const more = readFileSync(join(SRC, 'screens/MoreScreen.tsx'), 'utf8');
    const start = more.indexOf('const alertContactsFailure');
    const handler = more.slice(start, more.indexOf('const handleToggleContactsSync', start));
    assert.ok(start > 0);
    assert.doesNotMatch(handler, /\.message/);
    assert.match(handler, /settings\.contactsSync\.errors\./);
  });
});

describe('Older operation, newer operation', () => {
  it('retry right after a restart acts on the saved state, not on a blank one', async () => {
    const { env, session, raw } = harness({ timeoutMs: 5 });
    await session.enableThenSync();
    const held = replyHeldAfterCommit(env, DISABLE_CONTACTS_SYNC);
    await session.disable();
    newSessionSameAccount(env, session);
    assert.equal((await raw.retry()).status, 'not_ready', 'nothing before the read');
    await raw.bindUserDoc('uid-a', { contactsSyncEnabled: true, contactsEpoch: 0 });
    assert.equal(session.getStatus().enablement, 'disable_uncertain');
    assert.equal((await raw.retry()).status, 'ok');
    assert.equal(session.getStatus().enablement, 'off', 'it stays a disable');
    assert.equal(env.identity.enabled, false);
    held.fail();
  });

  it('within a session, a sync cannot overlap a retry, but a disable goes ahead of it', async () => {
    const { env, session } = harness({ timeoutMs: 5 });
    const held = requestHeldInTransit(env, SYNC_CONTACT_HASHES);
    await session.enableThenSync();
    assert.equal((await session.retry()).status, 'in_flight');
    assert.equal((await session.disable()).status, 'ok');
    assert.equal(held.land(), 'rejected');
    await delay(5);
    assert.equal(session.getStatus().enablement, 'off');
    assert.equal(session.getStatus().snapshot, 'none');
  });

  it('a second disable while one is unanswered sends nothing', async () => {
    const { env, session } = harness({ timeoutMs: 5 });
    await session.enableThenSync();
    const held = requestHeldInTransit(env, DISABLE_CONTACTS_SYNC);
    assert.equal((await session.disable()).status, 'uncertain');
    assert.equal(session.getStatus().disableInFlight, true);
    assert.equal((await session.disable()).status, 'in_flight');
    assert.equal(env.identity.count(DISABLE_CONTACTS_SYNC), 1);
    held.land();
    await until(() => session.getStatus().enablement === 'off', 'late disable');
  });

  it('old sync landing after a new disable: the epoch refuses it on the server', async () => {
    const { env, session } = harness({ timeoutMs: 5 });
    const held = requestHeldInTransit(env, SYNC_CONTACT_HASHES);
    await session.enableThenSync();
    newSessionSameAccount(env, session);
    assert.equal((await session.disable()).status, 'ok');
    assert.equal(env.identity.epoch, 1);

    assert.equal(held.land(), 'rejected', 'cannot write or re-enable');
    assert.equal(env.identity.enabled, false);
    assert.equal(env.identity.sources.size, 0);
    await delay(5);
    assert.equal(session.getStatus().enablement, 'off');
    assert.equal(session.getStatus().snapshot, 'none');
    assert.equal(savedState(env.store).contactsEpoch, 1);
  });

  it('old sync that did land, with its reply after a new disable: the reply changes nothing', async () => {
    const { env, session } = harness({ timeoutMs: 5 });
    const held = replyHeldAfterCommit(env, SYNC_CONTACT_HASHES);
    await session.enableThenSync();
    newSessionSameAccount(env, session);
    assert.equal((await session.disable()).status, 'ok');
    assert.equal(env.identity.sources.size, 0, 'the disable purged what it wrote');
    held.reply();
    await delay(5);
    assert.equal(session.getStatus().enablement, 'off');
    assert.equal(savedState(env.store).lastAckedVersion, null);
  });

  it('an unresolved disable comes first: enable sends nothing until it settles', async () => {
    const { env, session } = harness({ timeoutMs: 5 });
    await session.enableThenSync();
    const held = requestHeldInTransit(env, DISABLE_CONTACTS_SYNC);
    assert.equal((await session.disable()).status, 'uncertain');
    newSessionSameAccount(env, session);
    env.identity.calls.length = 0;
    assert.equal((await session.enableThenSync()).status, 'not_ready');
    assert.equal(env.identity.calls.length, 0);
    assert.equal((await session.retry()).status, 'ok');
    assert.equal(env.identity.epoch, 1);
    assert.equal((await session.enableThenSync()).status, 'ok');
    assert.equal(env.identity.last(ENABLE_CONTACTS_SYNC).contactsEpoch, 1);
    assert.equal(held.land(), 'rejected', 'the old one cannot switch it off');
    assert.equal(env.identity.enabled, true);
    await delay(5);
    assert.equal(session.getStatus().snapshot, 'synced');
  });

  it('old disable that already landed: enable does not bump the epoch again', async () => {
    const { env, session } = harness({ timeoutMs: 5 });
    await session.enableThenSync();
    const held = replyHeldAfterCommit(env, DISABLE_CONTACTS_SYNC);
    await session.disable();
    newSessionSameAccount(env, session);
    assert.equal((await session.enableThenSync()).status, 'ok');
    assert.equal(env.identity.epoch, 1);
    assert.equal(env.identity.enabled, true);
    held.reply();
    await delay(5);
    assert.equal(session.getStatus().enablement, 'enabled');
    assert.equal(session.getStatus().snapshot, 'synced');
  });

  it('old sync landing after a newer version: the version refuses it', async () => {
    const book = fakeBook();
    const { env, session } = harness({ book, timeoutMs: 5 });
    const held = requestHeldInTransit(env, SYNC_CONTACT_HASHES);
    await session.enableThenSync();
    newSessionSameAccount(env, session);
    // Same version would be a conflict if the old one had landed: goes higher.
    book.identifiers = BOOK_B;
    await session.retry();
    await until(() => session.getStatus().snapshot === 'synced', 'new upload');
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 2);
    assert.equal(held.land(), 'rejected');
    const stored = [...env.identity.sources.values()][0];
    assert.equal(stored.fingerprint, identifiersFingerprint(BOOK_B));
  });

  it('old enable landing after a new disable: the epoch it carries refuses it', async () => {
    const { env, session } = harness({ timeoutMs: 5 });
    const held = requestHeldInTransit(env, ENABLE_CONTACTS_SYNC);
    assert.equal((await session.enableThenSync()).status, 'uncertain');
    newSessionSameAccount(env, session);
    assert.equal((await session.disable()).status, 'ok');
    assert.equal(session.getStatus().enablement, 'off');

    assert.equal(held.land(), 'rejected', 'cannot switch it back on');
    assert.equal(env.identity.enabled, false);
    assert.equal(session.getStatus().enablement, 'off');
    assert.equal(env.book.reads, 0, 'the book was never read');
  });

  describe('a reply can never undo a newer state', () => {
    const base: ContactsLocalState = {
      sourceId: 'sourceId1',
      contactsEpoch: 3,
      lastAckedVersion: null,
      lastAckedFingerprint: null,
      removedSnapshotFloor: null,
      enablementConfirmed: true,
    };
    const wire = (extra: Record<string, unknown>) => ({
      result: 'synced',
      contactsSyncEnabled: true,
      contactsEpoch: 3,
      notifyNearbyContactsEffective: true,
      syncCommitted: true,
      reevaluateRequired: false,
      ...extra,
    });

    it('sync of an older epoch after disable', () => {
      const off: ContactsLocalState = {
        ...base,
        contactsEpoch: 4,
        enablementConfirmed: false,
        pendingUpload: { version: 2, fingerprint: 'fp1:a', epoch: 3 },
      };
      assert.equal(
        applyLateIdentityResult(off, 'sync', wire({ snapshotVersion: 2, sourceId: 'sourceId1' }), 2),
        off,
      );
    });

    it('sync while a disable is unresolved', () => {
      const disabling: ContactsLocalState = {
        ...base,
        uncertainOp: 'disable',
        pendingUpload: { version: 2, fingerprint: 'fp1:a', epoch: 3 },
      };
      assert.equal(
        applyLateIdentityResult(disabling, 'sync', wire({ snapshotVersion: 2 }), 2),
        disabling,
      );
    });

    it('disable at the epoch a newer enable already returned', () => {
      assert.equal(
        applyLateIdentityResult(
          base,
          'disable',
          wire({ result: 'disabled', contactsSyncEnabled: false, contactsEpoch: 3 }),
        ),
        base,
      );
    });

    it('disable at a higher epoch is news: Identity is past what we hold', () => {
      const next = applyLateIdentityResult(
        base,
        'disable',
        wire({ result: 'disabled', contactsSyncEnabled: false, contactsEpoch: 4 }),
      );
      assert.equal(next.enablementConfirmed, false);
      assert.equal(next.contactsEpoch, 4);
    });

    it('enable of an older epoch', () => {
      const off = { ...base, contactsEpoch: 4, enablementConfirmed: false };
      assert.equal(
        applyLateIdentityResult(off, 'enable', wire({ result: 'enabled', contactsEpoch: 3 })),
        off,
      );
    });
  });
});

describe('Phone verification keeps its contract', () => {
  it('refresh after OTP cannot fail or block anything', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name) => {
      if (name === REFRESH_VERIFIED_ACTOR_KEYS) throw reason('contacts-rate-limited');
      return undefined;
    };
    const op = await session.refreshKeys();
    assert.equal(op.status, 'failed');
    assert.equal(session.getStatus().errorKey, null, 'nothing shown in Contacts');
    assert.equal(env.book.reads + env.book.requests, 0);
  });

  it('it stays fire-and-forget, sends no OTP data and is the only other caller', () => {
    const otp = readFileSync(join(SRC, 'screens/PhoneVerificationScreen.android.tsx'), 'utf8').replace(/\r\n/g, '\n');
    const start = otp.indexOf('void (async () => {');
    const block = otp.slice(start, otp.indexOf("navigation.replace('ProfileCompletion'", start));
    assert.ok(start > 0);
    // Exact call: no arguments, so nothing from the OTP flow can reach it.
    assert.match(block, /await refreshContactsActorKeys\(\);/);
    assert.match(block, /catch \{/);

    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== '__tests__' && name !== 'contactsHmac') walk(full);
        } else if (/\.tsx?$/.test(name) && /contactsHmac\/contactsHmac'/.test(readFileSync(full, 'utf8'))) {
          importers.push(name);
        }
      }
    };
    walk(SRC);
    assert.deepEqual(importers.sort(), ['MoreScreen.tsx', 'PhoneVerificationScreen.android.tsx']);
  });
});

describe('The first read never leaves it checking forever', () => {
  it('a read that never answers ends in a recoverable error, without polling', async () => {
    const { env, raw } = harness({ timeoutMs: 10 });
    raw.expectUserDocRead('uid-a');
    assert.equal(raw.getStatus().stateConfirmed, false);
    assert.equal(raw.getStatus().readFailed, false);
    await until(() => raw.getStatus().readFailed, 'deadline');
    assert.equal(contactsStatusCopyKey(raw.getStatus()), 'status.readFailed');
    assert.equal(env.identity.calls.length, 0);
    assert.equal(env.book.requests + env.book.reads, 0);
  });

  it('a read in time cancels the deadline', async () => {
    const { env, raw } = harness({ timeoutMs: 10 });
    raw.expectUserDocRead('uid-a');
    await raw.bindUserDoc('uid-a', env.identity.userDoc());
    await delay(25);
    assert.equal(raw.getStatus().readFailed, false);
    assert.equal(raw.getStatus().stateConfirmed, true);
  });
});

describe('Account changes', () => {
  it('a result from the previous account changes neither the new status nor its storage', async () => {
    const { env, session } = harness();
    let release: (v?: unknown) => void = () => {};
    env.identity.intercept = (name, data) => {
      if (name !== ENABLE_CONTACTS_SYNC) return undefined;
      const value = env.identity.commit(name, data);
      return new Promise((done) => {
        release = () => done(value);
      });
    };
    const first = session.enableThenSync();
    await until(() => env.identity.count(ENABLE_CONTACTS_SYNC) === 1, 'sent');
    env.uid = 'uid-b';
    session.handleAuthChanged('uid-b');
    release();
    assert.equal((await first).status, 'stale');
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), 0, 'A book never goes out as B');
    assert.equal(env.book.requests, 0, 'no prompt for the new account');
    assert.equal(env.store.mem.has(contactsStateStorageKey('uid-b')), false);
    assert.equal(session.getStatus().uid, null);
  });

  it('a book read before the change is not uploaded after it', async () => {
    const book = fakeBook();
    const env = { uid: 'uid-a' as string | null };
    const identity = new FakeIdentity();
    const session = createContactsSyncSession({
      currentUid: () => env.uid,
      store: memoryStore(),
      randomBytes: () => new Uint8Array(16).fill(1),
      region: 'r',
      callIdentity: (n, d) => identity.call(n, d),
      createBook: () => ({
        ...book.port(),
        readRecords: async () => {
          env.uid = 'uid-b';
          return BOOK_A;
        },
      }),
      ensureAppCheck: async () => {},
      scheduleReevaluate: () => {},
      timeoutMs: 100,
    });
    await session.bindUserDoc('uid-a', identity.userDoc());
    assert.equal((await session.enableThenSync()).status, 'stale');
    assert.equal(identity.count(SYNC_CONTACT_HASHES), 0);
  });

  it('a late reply for the previous session is ignored after returning to the same uid', async () => {
    const { env, session } = harness({ timeoutMs: 10 });
    let release: () => void = () => {};
    env.identity.intercept = (name, data) => {
      if (name !== SYNC_CONTACT_HASHES) return undefined;
      const value = env.identity.commit(name, data);
      return new Promise((done) => {
        release = () => done(value);
      });
    };
    await session.enableThenSync();
    env.uid = null;
    session.handleAuthChanged(null);
    env.uid = 'uid-a';
    session.handleAuthChanged('uid-a');
    await session.bindUserDoc('uid-a', { contactsSyncEnabled: true, contactsEpoch: 0 });
    env.identity.intercept = null;
    await until(() => session.getStatus().snapshot === 'synced', 'own reconcile');
    const calls = env.identity.count(SYNC_CONTACT_HASHES);
    release();
    await delay(5);
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), calls);
    assert.equal(session.getStatus().snapshot, 'synced');
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 1);
  });

  it('an owed reevaluate stays with its account, not with the next one', async () => {
    const { env, session } = harness({ timeoutMs: 10 });
    env.identity.intercept = (name) =>
      name === SYNC_CONTACT_HASHES ? new Promise(() => {}) : undefined;
    await session.enableThenSync();
    await until(() => savedState(env.store)?.uncertainOp === 'sync', 'intent saved');
    env.reevaluations = 0;
    env.uid = 'uid-b';
    session.handleAuthChanged('uid-b');
    await session.bindUserDoc('uid-b', { contactsSyncEnabled: false, contactsEpoch: 0 });
    assert.equal(env.reevaluations, 0);
    assert.equal(savedState(env.store, 'uid-a').reevaluateOwed, true);
  });

  it('refresh keeps state confirmed by Identity and does not create consent', async () => {
    const { env, session } = harness();
    env.identity.enabled = true;
    env.identity.epoch = 2;
    const op = await session.refreshKeys();
    assert.equal(op.status, 'ok');
    const status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.consent, false);
    await until(() => savedState(env.store)?.contactsEpoch === 2, 'epoch saved');
    assert.equal(env.book.requests, 0);
  });

  it('refresh waits its turn behind a running operation', async () => {
    const { env, session } = harness({ timeoutMs: 10 });
    env.identity.intercept = (name) =>
      name === SYNC_CONTACT_HASHES ? new Promise(() => {}) : undefined;
    await session.enableThenSync();
    const before = env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS);
    assert.equal((await session.refreshKeys()).status, 'in_flight');
    assert.equal(env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS), before);
  });
});

describe('Permission states', () => {
  it('a dismissed prompt withdraws nothing and stays pending', async () => {
    const book = fakeBook({ permission: 'undetermined', requested: 'undetermined' });
    const { env, session } = harness({ book });
    const op = await session.enableThenSync();
    assert.equal(op.status, 'ok');
    assert.equal(env.identity.count(REMOVE_CONTACT_SOURCE), 0);
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), 0);
    const status = session.getStatus();
    assert.equal(status.enablement, 'enabled');
    assert.equal(status.snapshot, 'pending');
    assert.equal(contactsStatusCopyKey(status), 'status.enabledPermissionNeeded');
  });

  it('a denial withdraws the source and never reports synced', async () => {
    const book = fakeBook({ permission: 'undetermined', requested: 'denied' });
    const { env, session } = harness({ book });
    assert.equal((await session.enableThenSync()).status, 'ok');
    assert.equal(env.identity.count(REMOVE_CONTACT_SOURCE), 1);
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), 0);
    assert.equal(session.getStatus().snapshot, 'pending');
    assert.equal(session.getStatus().osPermission, 'denied');
  });

  it('after a withdrawal, a new grant syncs above the fence', async () => {
    const book = fakeBook();
    const { env, session } = harness({ book });
    await session.enableThenSync();
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 1);
    book.permission = 'denied';
    book.requested = 'denied';
    await session.retry();
    assert.equal(env.identity.fences.get(savedState(env.store).sourceId), 1);
    book.requested = 'granted';
    assert.equal((await session.retry()).status, 'ok');
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).snapshotVersion, 2);
    assert.equal(session.getStatus().snapshot, 'synced');
  });
});

describe('Errors do not get confused', () => {
  const map = (code: string, message = '', details?: unknown) =>
    mapContactsCallableError(
      Object.assign(new Error(message), { code, message, details }),
    ).reason;

  it('keeps each cause apart', () => {
    assert.equal(
      map('functions/failed-precondition', 'x', { reason: 'contacts-auth-lookup-failed' }),
      'contacts-auth-lookup-failed',
    );
    assert.equal(
      map('functions/failed-precondition', 'x', { reason: 'contacts-hmac-unavailable' }),
      'contacts-hmac-unavailable',
    );
    assert.equal(map('functions/deadline-exceeded'), 'contacts-transport-uncertain');
    assert.equal(map('functions/unavailable'), 'contacts-transport-uncertain');
    assert.equal(map('functions/internal', 'INTERNAL'), 'contacts-result-unknown');
    assert.equal(map('internal'), 'contacts-result-unknown');
    assert.equal(map('functions/unknown'), 'contacts-result-unknown');
    // Message text cannot turn an unknown result into a network claim.
    assert.equal(map('functions/internal', 'network timeout'), 'contacts-result-unknown');
    assert.equal(map('functions/unauthenticated', 'App Check token invalid'), 'APP_CHECK_NOT_READY');
    assert.equal(map('functions/unauthenticated', 'no user'), 'contacts-unauthenticated');
    assert.equal(map('functions/permission-denied', 'IAM denied'), 'generic');
  });

  it('old server INTERNAL on enable stays unknown and recoverable', async () => {
    const { env, session } = harness();
    await session.bindUserDoc('uid-a', { contactsSyncEnabled: false, contactsEpoch: 0 });
    env.identity.intercept = (name) => {
      if (name === ENABLE_CONTACTS_SYNC) {
        throw Object.assign(new Error('secret stack detail'), { code: 'functions/internal' });
      }
      return undefined;
    };
    const op = await session.enableThenSync();
    assert.equal(op.status, 'uncertain');
    const status = session.getStatus();
    assert.equal(status.enablement, 'enable_uncertain');
    assert.equal(status.errorKey, 'resultUnknown');
    assert.equal(contactsStatusCopyKey(status), 'errors.resultUnknown');
    assert.equal(status.snapshot, 'none');
    assert.equal(status.osPermission, 'granted', 'not reported as a denial');
    assert.equal(contactsToggleValue(status), false, 'not drawn as enabled');
    assert.equal(contactsCanRetry(status), true);
    assert.equal(env.book.requests, 0, 'never reaches the OS permission');
    env.identity.intercept = null;
    assert.equal((await session.retry()).status, 'ok');
    assert.equal(session.getStatus().snapshot, 'synced');
  });

  it('auth lookup refusal leaves it off without consent', async () => {
    const { env, session } = harness();
    env.identity.intercept = (name) => {
      if (name === ENABLE_CONTACTS_SYNC) throw reason('contacts-auth-lookup-failed');
      return undefined;
    };
    const op = await session.enableThenSync();
    assert.equal(op.status, 'failed');
    const status = session.getStatus();
    assert.equal(status.enablement, 'off');
    assert.equal(status.consent, false);
    assert.equal(status.errorKey, 'authLookup');
    assert.equal(env.book.requests, 0);
  });

  it('only uncertain reasons are uncertain', () => {
    assert.equal(isContactsOutcomeUncertain('contacts-transport-uncertain'), true);
    assert.equal(isContactsOutcomeUncertain('contacts-result-unknown'), true);
    for (const definite of [
      'contacts-hmac-unavailable',
      'contacts-auth-lookup-failed',
      'APP_CHECK_NOT_READY',
      'contacts-rate-limited',
      'generic',
    ] as const) {
      assert.equal(isContactsOutcomeUncertain(definite), false, definite);
    }
  });

  it('every error and status key exists in EN and ES', () => {
    const es = readFileSync(join(SRC, 'i18n/locales/es.ts'), 'utf8');
    const esSection = es.slice(es.indexOf('contactsSync: {'), es.indexOf('contactNotices: {'));
    const en = (settingsEn as any).contactsSync;
    const reasons = [
      'contacts-unauthenticated',
      'contacts-auth-lookup-failed',
      'contacts-not-enabled',
      'contacts-epoch-mismatch',
      'contacts-snapshot-stale',
      'contacts-source-removed',
      'contacts-snapshot-conflict',
      'contacts-source-cap',
      'contacts-identifier-cap',
      'contacts-union-cap',
      'contacts-identifier-invalid',
      'contacts-client-hash-rejected',
      'contacts-hmac-unavailable',
      'contacts-transport-uncertain',
      'contacts-result-unknown',
      'APP_CHECK_NOT_READY',
      'contacts-rate-limited',
      'generic',
    ] as const;
    const keys = reasons.map((r): ContactsErrorI18nKey => contactsHmacErrorToI18nKey(r));
    assert.equal(new Set(keys).size, keys.length, 'distinct copy per cause');
    for (const key of keys) {
      assert.equal(typeof en.errors[key], 'string', `EN ${key}`);
      assert.match(esSection, new RegExp(`\\b${key}:`), `ES ${key}`);
    }
    for (const key of Object.keys(en.status)) {
      assert.match(esSection, new RegExp(`\\b${key}:`), `ES status ${key}`);
    }
    assert.match(esSection, /retry: 'Reintentar'/);
    // Missing secret copy must not talk about timeouts.
    assert.doesNotMatch(en.errors.unavailable, /timed out|connection/i);
  });
});

describe('Local state compatibility', () => {
  it('keeps versions and fences saved by an earlier build', async () => {
    const store = memoryStore({
      [contactsStateStorageKey('uid-a')]: JSON.stringify({
        sourceId: 'sourceId1',
        contactsEpoch: 2,
        lastAckedVersion: 4,
        lastAckedFingerprint: 'fp1:abc',
        removedSnapshotFloor: 3,
      }),
    });
    const state = await loadContactsLocalState(store, 'uid-a', 'sourceId1');
    assert.equal(state.lastAckedVersion, 4);
    assert.equal(state.removedSnapshotFloor, 3);
    assert.equal(state.lastAckedEpoch, 2);
    assert.equal(state.userConsent, false);
  });

  it('does not carry acks over to a different source', async () => {
    const store = memoryStore({
      [contactsStateStorageKey('uid-a')]: JSON.stringify({
        sourceId: 'sourceIdOther',
        contactsEpoch: 2,
        lastAckedVersion: 4,
        lastAckedFingerprint: 'fp1:abc',
      }),
    });
    const state = await loadContactsLocalState(store, 'uid-a', 'sourceId1');
    assert.equal(state.lastAckedVersion, null);
  });

  it('drops anything unsafe in a saved upload intent', async () => {
    const store = memoryStore();
    await persistContactsLocalState(store, 'uid-a', {
      sourceId: 'sourceId1',
      contactsEpoch: 0,
      lastAckedVersion: null,
      lastAckedFingerprint: null,
      removedSnapshotFloor: null,
      pendingUpload: { version: 1, fingerprint: 'email:ada@b.co', epoch: 0 },
    });
    assert.equal(savedState(store).pendingUpload, null);
    assert.doesNotMatch(store.mem.get(contactsStateStorageKey('uid-a')) ?? '', /ada@b/);
  });
});
