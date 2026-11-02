# iOS encounter-notify / Contacts (Functions #40 + Identity #23)

Read-only contract sources:

- Functions PR #40 HEAD `60d33bab35743b39d221ec92d550129b623173f5`
- Identity PR #23 HEAD `7ebba05632fa17fc23dd79b4d281610080a55983`

Not deployed. This client PR does not merge, bump, build, submit, or make productive Identity/Functions calls.

## Implemented

- Push: keep `kind=contact_nearby` + `actorUid` navigation. Optional `data.motive` (`interest` | `contact` | `both`). Prefer `motive` over legacy `fromContacts`. One banner; no second local notification.
- Prefs: `notifyNearbyInterests` missing → true. `contactsSyncEnabled` missing → false (Identity-owned). Mute `notifyNearbyContacts` without deleting hashes.
- Alerts: seen on **row open**, not tab enter. Persist `users/{viewer}/alertSeen/{peerUid}` `{ seenAt, appearanceKey }`. Badge = unseen appearanceKey mismatch. Old servers without `appearanceKey` do not invent a leave.
- `discoverNearby` additive `complete` / `truncated` / `appearanceKey`. Truncated/error/partial is not a leave.
- `reevaluateProximityNotices` (caller uid only, Auth + App Check) after first Expo token, interests/mode, notify toggle, block/unblock, and after Identity `syncCommitted && reevaluateRequired`.
- Identity callables only: `enableContactsSync`, `disableContactsSync`, `removeContactSource`, `syncContactHashes`, `refreshVerifiedActorKeys`. Field is `contactsEpoch`. Same `snapshotVersion` + same normalized identifier set → `result: "idempotent"` (success, do not bump version). OS Contacts denied → `removeContactSource`, never upload empty. Empty granted book is a valid snapshot.

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

## Identity dependencies still open

1. **Verified actor key validity** — `verifiedActorKeys` stay after disable and have no TTL. Identity counts Auth `emailVerified` and OTP claim + `users.phoneVerified`. If email un-verifies or a phone claim is released, stale keys remain until the client calls `refreshVerifiedActorKeys`. This client refreshes after OTP check, enable, and sync. Identity still needs to fence stale keys without waiting for that client call.
2. **Source-withdrawal fencing** — OS deny maps to `removeContactSource`; disable increments `contactsEpoch` and deletes sources. A leftover source whose `epoch` is below `users.contactsEpoch` is ignored for consume. Identity still needs to close races between in-flight `syncContactHashes` and `removeContactSource` / disable of the same `sourceId`, and whether a withdrawn source can be resurrected by a stale snapshot. Client adaptation: after remove/disable, drop local `snapshotVersion` / fingerprint and do not retry the withdrawn Identity body.

If Identity’s final contract changes those two points, adapt this client to the new fields — do not invent replacements.
