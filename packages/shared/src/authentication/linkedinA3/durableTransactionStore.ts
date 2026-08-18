/**
 * Durable LinkedIn A3 transaction register (kill/relaunch recovery).
 * Stores only possession-proof material for one active transaction.
 * Never persists tokens, authorization URLs, or personal data.
 */

import {
  assertClientProofVerifierShape,
} from './clientProof';

export const LINKEDIN_A3_DURABLE_STORE_KEY =
  'nearsy.linkedinA3.activeTransaction.v1';

export type LinkedInA3DurableRecord = {
  transactionId: string;
  clientProofVerifier: string;
  expiresAt: number;
  startedAt: number;
};

export type LinkedInA3DurableStore = {
  save(record: LinkedInA3DurableRecord): Promise<void>;
  load(): Promise<LinkedInA3DurableRecord | null>;
  clear(): Promise<void>;
};

const ALLOWED_KEYS = new Set([
  'transactionId',
  'clientProofVerifier',
  'expiresAt',
  'startedAt',
]);

const FORBIDDEN_KEYS = new Set([
  'customToken',
  'idToken',
  'accessToken',
  'access_token',
  'authorizationUrl',
  'authorizationURL',
  'email',
  'displayName',
  'givenName',
  'familyName',
  'photoUrl',
  'photoURL',
  'uid',
  'name',
  'realName',
]);

const TX_RE = /^[A-Za-z0-9_-]+$/;

export function durableRecordHasForbiddenFields(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return Object.keys(raw as Record<string, unknown>).some((key) =>
    FORBIDDEN_KEYS.has(key),
  );
}

export function serializeLinkedInA3DurableRecord(
  record: LinkedInA3DurableRecord,
): string {
  return JSON.stringify({
    transactionId: record.transactionId,
    clientProofVerifier: record.clientProofVerifier,
    expiresAt: record.expiresAt,
    startedAt: record.startedAt,
  });
}

export function parseLinkedInA3DurableRecord(
  raw: unknown,
): LinkedInA3DurableRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  if (durableRecordHasForbiddenFields(raw)) return null;
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== ALLOWED_KEYS.size) return null;
  for (const key of keys) {
    if (!ALLOWED_KEYS.has(key)) return null;
  }

  const transactionId = record.transactionId;
  const clientProofVerifier = record.clientProofVerifier;
  const expiresAt = record.expiresAt;
  const startedAt = record.startedAt;

  if (
    typeof transactionId !== 'string' ||
    transactionId.length < 8 ||
    transactionId.length > 128 ||
    !TX_RE.test(transactionId)
  ) {
    return null;
  }
  if (typeof clientProofVerifier !== 'string') return null;
  try {
    assertClientProofVerifierShape(clientProofVerifier);
  } catch {
    return null;
  }
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt <= 0) {
    return null;
  }

  return { transactionId, clientProofVerifier, expiresAt, startedAt };
}

export function parseLinkedInA3DurableRecordJson(
  json: string | null | undefined,
): LinkedInA3DurableRecord | null {
  if (typeof json !== 'string' || json.length === 0) return null;
  try {
    return parseLinkedInA3DurableRecord(JSON.parse(json));
  } catch {
    return null;
  }
}

export function createInMemoryLinkedInA3DurableStore(): LinkedInA3DurableStore {
  let current: LinkedInA3DurableRecord | null = null;
  return {
    async save(record) {
      const parsed = parseLinkedInA3DurableRecord(record);
      if (!parsed) {
        current = null;
        return;
      }
      current = parsed;
    },
    async load() {
      return current;
    },
    async clear() {
      current = null;
    },
  };
}

async function persistSafely(
  store: LinkedInA3DurableStore | undefined,
  record: LinkedInA3DurableRecord,
): Promise<void> {
  if (!store) return;
  try {
    await store.save(record);
  } catch {
    // Fail-soft: in-memory orchestrator state still covers the live session.
  }
}

async function clearSafely(
  store: LinkedInA3DurableStore | undefined,
): Promise<void> {
  if (!store) return;
  try {
    await store.clear();
  } catch {
    // Fail-soft.
  }
}

export const linkedInA3DurablePersistence = {
  persistSafely,
  clearSafely,
};
