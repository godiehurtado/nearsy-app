# iOS encounter-notify / Contacts (Functions #40 + Identity #23)

Read-only contract sources:

- Functions PR #40 HEAD `60d33bab35743b39d221ec92d550129b623173f5`
- Identity PR #23 close HEAD `cf6e6d9862d0005e00ae84d4dbdca6791d242fa8`

Not deployed. This client PR does not merge, bump, build, submit, or make productive Identity/Functions calls.

## Implemented

- Push: keep `kind=contact_nearby` + `actorUid` navigation. Optional `data.motive` (`interest` | `contact` | `both`). Prefer `motive` over legacy `fromContacts`. One banner; no second local notification.
- Prefs: `notifyNearbyInterests` missing → true. `contactsSyncEnabled` missing → false (Identity-owned). Mute `notifyNearbyContacts` without deleting hashes.
- Alerts: seen on **row open**, not tab enter. Persist `users/{viewer}/alertSeen/{peerUid}` `{ seenAt, appearanceKey }`. Badge = unseen appearanceKey mismatch. Old servers without `appearanceKey` do not invent a leave.
- `discoverNearby` additive `complete` / `truncated` / `appearanceKey`. Truncated/error/partial is not a leave.
- `reevaluateProximityNotices` (caller uid only, Auth + App Check) after first Expo token, interests/mode, notify toggle, block/unblock, and after Identity `syncCommitted && reevaluateRequired`. Pending mark is durable and isolated by Auth uid; cleared only after a successful invoke for that uid. An Identity `idempotent` (`reevaluateRequired: false`) does not clear a prior pending mark.
- Identity callables only: `enableContactsSync`, `disableContactsSync`, `removeContactSource`, `syncContactHashes`, `refreshVerifiedActorKeys`. Field is `contactsEpoch`. Same `snapshotVersion` + same normalized identifier set → `result: "idempotent"` (success, do not bump version). OS Contacts denied → `removeContactSource`, never upload empty. Empty granted book is a valid snapshot. Granted and limited OS access both sync the readable set; denied withdraws the source.
- Stable `sourceId` per install. After `removeContactSource`, keep the local monotonic `snapshotVersion` (Identity returns the withdrawn version / fence `removedSnapshotVersion`) and clear fingerprint only so the next sync after re-consent is strictly greater. Do not restart at 1 and do not mint a new `sourceId` on every sync to dodge fences. Never persist the raw address book for retries.
- Native: `expo-contacts` `~15.0.11`, Expo plugin, and `NSContactsUsageDescription` purpose string are in `apps/nearsy-ios` for the next build.

`ContactsWireResult` (Identity `service.ts`, no markdown ellipsis):

```
result
contactsSyncEnabled
contactsEpoch
notifyNearbyContactsEffective
sourceId?
snapshotVersion?
identifierCount?
keyCount?
syncCommitted
reevaluateRequired
```

## Identity close (cf6e6d9) — already implemented server-side

Do not reopen these as open client dependencies:

1. **Phone / claim reconcile** — `reconcileContactsActorKeysOnUserWrite` and claim write/delete rebuild keys without waiting for the client.
2. **Auth email sweep** — `sweepVerifiedActorKeys` every 15 minutes catches emailVerified drift and orphan uids.
3. **Auth delete cleanup** — `cleanupContactsHmacOnAuthUserDeleted` deletes sources, fences, keys, and rate docs.
4. **Source-withdrawal fencing** — `removeContactSource` writes `contactSourceFences/{sourceId}` `{ epoch, removedSnapshotVersion }`; sync with `snapshotVersion <= removedSnapshotVersion` → `contacts-source-removed`.
5. **Epoch and snapshot conflicts** — `contacts-epoch-mismatch`, `contacts-snapshot-stale`, `contacts-snapshot-conflict` as in the contract.

Client still may call `refreshVerifiedActorKeys` after OTP check for immediate key sync; Identity documents it as optional, not the sole invalidation path.
