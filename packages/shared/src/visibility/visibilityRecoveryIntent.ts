/**
 * Reinstall / existing-account Visibility recovery intent (BUG-DISC-01).
 * Preserves "was ON before permission reconciliation" without a new backend field.
 */

export const VISIBILITY_RECOVERY_INTENT_KEY =
  'NEARSY_VISIBILITY_RECOVERY_INTENT' as const;

export type VisibilityRecoveryIntentRecord = {
  uid: string;
  /** Profile originally had visibility=true for this installation/login recovery. */
  restoreVisibility: true;
};

export type VisibilityRecoveryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function parseVisibilityRecoveryIntent(
  raw: string | null | undefined,
): VisibilityRecoveryIntentRecord | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VisibilityRecoveryIntentRecord>;
    if (
      typeof parsed?.uid === 'string' &&
      parsed.uid.trim().length > 0 &&
      parsed.restoreVisibility === true
    ) {
      return { uid: parsed.uid.trim(), restoreVisibility: true };
    }
  } catch {
    return null;
  }
  return null;
}

export function serializeVisibilityRecoveryIntent(
  intent: VisibilityRecoveryIntentRecord,
): string {
  return JSON.stringify({
    uid: intent.uid,
    restoreVisibility: true,
  });
}

export async function readVisibilityRecoveryIntent(
  storage: VisibilityRecoveryStorage,
): Promise<VisibilityRecoveryIntentRecord | null> {
  const raw = await storage.getItem(VISIBILITY_RECOVERY_INTENT_KEY);
  return parseVisibilityRecoveryIntent(raw);
}

export async function writeVisibilityRecoveryIntent(
  storage: VisibilityRecoveryStorage,
  uid: string,
): Promise<void> {
  const trimmed = uid.trim();
  if (!trimmed) return;
  await storage.setItem(
    VISIBILITY_RECOVERY_INTENT_KEY,
    serializeVisibilityRecoveryIntent({
      uid: trimmed,
      restoreVisibility: true,
    }),
  );
}

export async function clearVisibilityRecoveryIntent(
  storage: VisibilityRecoveryStorage,
): Promise<void> {
  await storage.removeItem(VISIBILITY_RECOVERY_INTENT_KEY);
}

export async function clearVisibilityRecoveryIntentIfUid(
  storage: VisibilityRecoveryStorage,
  uid: string,
): Promise<void> {
  const intent = await readVisibilityRecoveryIntent(storage);
  if (intent && intent.uid === uid.trim()) {
    await clearVisibilityRecoveryIntent(storage);
  }
}

/**
 * Pure decision for permission reconciliation + recovery (BUG-DISC-01).
 */
export type VisibilityRecoveryDecision =
  | { action: 'noop'; effectiveVisibility: boolean }
  | {
      action: 'preserve-intent-then-deactivate';
      /** Call writeVisibilityRecoveryIntent before deactivate. */
      preserveIntent: true;
    }
  | {
      action: 'activate-from-intent';
      /** Permission granted and recovery intent matches uid; remote is false. */
    }
  | {
      /** Intent preserved; still waiting for FG permission (no deactivate). */
      action: 'await-permission';
    }
  | {
      action: 'clear-intent';
      reason: 'already-active' | 'explicit-off' | 'uid-mismatch';
    };

export function decideVisibilityRecoveryAction(input: {
  uid: string;
  remoteVisibility: boolean;
  foregroundGranted: boolean;
  recoveryIntent: VisibilityRecoveryIntentRecord | null;
}): VisibilityRecoveryDecision {
  const uid = input.uid.trim();
  const intentMatches =
    !!input.recoveryIntent &&
    input.recoveryIntent.restoreVisibility === true &&
    input.recoveryIntent.uid === uid;

  if (input.remoteVisibility && input.foregroundGranted) {
    if (intentMatches) {
      return { action: 'clear-intent', reason: 'already-active' };
    }
    return { action: 'noop', effectiveVisibility: true };
  }

  if (input.remoteVisibility && !input.foregroundGranted) {
    return { action: 'preserve-intent-then-deactivate', preserveIntent: true };
  }

  // remote OFF
  if (intentMatches && input.foregroundGranted) {
    return { action: 'activate-from-intent' };
  }

  if (intentMatches && !input.foregroundGranted) {
    return { action: 'await-permission' };
  }

  if (input.recoveryIntent && input.recoveryIntent.uid !== uid) {
    return { action: 'clear-intent', reason: 'uid-mismatch' };
  }

  return { action: 'noop', effectiveVisibility: false };
}
