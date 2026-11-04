/**
 * Identity's Contacts write rules for one account, at #27 (contract v1 §5, §9, §14):
 * epoch on enable, disable as a barrier, known version on remove. No secrets or
 * transport. Stands in for the backend in tests; never talks to anything.
 */
import {
  DISABLE_CONTACTS_SYNC,
  ENABLE_CONTACTS_SYNC,
  REFRESH_VERIFIED_ACTOR_KEYS,
  REMOVE_CONTACT_SOURCE,
  SYNC_CONTACT_HASHES,
} from '../../contactsHmac/contactsHmacContract.ts';
import { identifiersFingerprint } from '../../contactsHmac/contactsHmacCore.ts';

export function identityRejects(value: string): Error {
  return Object.assign(new Error(`rejected (${value})`), {
    code: 'functions/failed-precondition',
    details: { reason: value },
  });
}

export class FakeIdentity {
  enabled = false;
  epoch = 0;
  sources = new Map<string, { version: number; fingerprint: string }>();
  fences = new Map<string, number>();
  calls: Array<{ uid: string; name: string; data: any }> = [];
  /** Rule applied to the next calls: return a promise to hold, throw to fail. */
  intercept: ((name: string, data: any) => unknown) | null = null;
  uid = 'uid-a';

  wire(extra: Record<string, unknown>) {
    return {
      contactsSyncEnabled: this.enabled,
      contactsEpoch: this.epoch,
      notifyNearbyContactsEffective: this.enabled,
      syncCommitted: true,
      reevaluateRequired: false,
      ...extra,
    };
  }

  private requireLiveEpoch(sent: unknown) {
    if (sent !== this.epoch) throw identityRejects('contacts-epoch-mismatch');
  }

  /** Commits now; what happens to the reply is up to the caller. */
  commit(name: string, data: any): unknown {
    switch (name) {
      case ENABLE_CONTACTS_SYNC: {
        if (data?.contactsEpoch !== undefined) {
          this.requireLiveEpoch(data.contactsEpoch);
        } else if (this.epoch > 0) {
          throw identityRejects('contacts-epoch-required');
        }
        const first = !this.enabled;
        if (first) {
          this.enabled = true;
          this.sources.clear();
          this.fences.clear();
        }
        return this.wire({ result: 'enabled', reevaluateRequired: first });
      }
      case SYNC_CONTACT_HASHES: {
        if (!this.enabled) throw identityRejects('contacts-not-enabled');
        this.requireLiveEpoch(data.contactsEpoch);
        const fence = this.fences.get(data.sourceId);
        if (fence != null && data.snapshotVersion <= fence) {
          throw identityRejects('contacts-source-removed');
        }
        const fingerprint = identifiersFingerprint(data.identifiers);
        const existing = this.sources.get(data.sourceId);
        if (existing && data.snapshotVersion < existing.version) {
          throw identityRejects('contacts-snapshot-stale');
        }
        if (existing && data.snapshotVersion === existing.version) {
          if (existing.fingerprint !== fingerprint) {
            throw identityRejects('contacts-snapshot-conflict');
          }
          return this.wire({
            result: 'idempotent',
            sourceId: data.sourceId,
            snapshotVersion: data.snapshotVersion,
          });
        }
        this.fences.delete(data.sourceId);
        this.sources.set(data.sourceId, {
          version: data.snapshotVersion,
          fingerprint,
        });
        return this.wire({
          result: 'synced',
          sourceId: data.sourceId,
          snapshotVersion: data.snapshotVersion,
          reevaluateRequired: true,
        });
      }
      case REMOVE_CONTACT_SOURCE: {
        if (!this.enabled) throw identityRejects('contacts-not-enabled');
        this.requireLiveEpoch(data.contactsEpoch);
        const existing = this.sources.get(data.sourceId);
        const known = data.knownSnapshotVersion;
        if (existing && known !== undefined && existing.version > known) {
          return this.wire({
            result: 'superseded',
            sourceId: data.sourceId,
            snapshotVersion: existing.version,
          });
        }
        const fenced = this.fences.get(data.sourceId) ?? 0;
        this.fences.set(
          data.sourceId,
          Math.max(existing?.version ?? 0, fenced, known ?? 0),
        );
        this.sources.delete(data.sourceId);
        return this.wire({
          result: existing ? 'removed' : 'absent',
          sourceId: data.sourceId,
          ...(existing ? { snapshotVersion: existing.version } : {}),
          reevaluateRequired: !!existing,
        });
      }
      case DISABLE_CONTACTS_SYNC: {
        this.requireLiveEpoch(data.contactsEpoch);
        const hadEffect =
          this.enabled || this.sources.size > 0 || this.fences.size > 0;
        this.enabled = false;
        this.epoch += 1;
        this.sources.clear();
        this.fences.clear();
        return this.wire({ result: 'disabled', reevaluateRequired: hadEffect });
      }
      case REFRESH_VERIFIED_ACTOR_KEYS:
        return this.wire({ result: 'refreshed' });
      default:
        throw new Error(`unexpected ${name}`);
    }
  }

  async call(name: string, data: any): Promise<unknown> {
    this.calls.push({ uid: this.uid, name, data });
    if (this.intercept) {
      const held = this.intercept(name, data);
      if (held !== undefined) return held;
    }
    return this.commit(name, data);
  }

  count(name: string): number {
    return this.calls.filter((c) => c.name === name).length;
  }

  last(name: string): any {
    return [...this.calls].reverse().find((c) => c.name === name)?.data;
  }

  /** What a read of users/{uid} shows; the field is absent until the first write. */
  userDoc() {
    return { contactsSyncEnabled: this.enabled, contactsEpoch: this.epoch };
  }
}
