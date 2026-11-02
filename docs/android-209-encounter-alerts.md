# Android encounter-notify / Alerts / Contacts (Functions #40 + Identity #23)

Read-only contract sources, not deployed:

- Functions PR #40 HEAD `60d33bab35743b39d221ec92d550129b623173f5` (`feat/209-encounter-notify`)
- Identity PR #23 HEAD `7ebba05632fa17fc23dd79b4d281610080a55983` (`feature/209-contacts-hmac`)

This client PR does not modify Functions, Identity, FCM credentials, iOS, or merge.

Previous Functions consume stamp `2426d624` used a truncated Contacts table (`…`) and predated Identity reconciliation. Current Functions docs copy Identity’s names and fields. There is no `expectedEpoch`, `enableContactSync`, or `deleteContactSource`.

## Implemented

- Push: keep `kind=contact_nearby` + `actorUid` navigation. Optional `motive` (`interest` | `contact` | `both`) and legacy `fromContacts`. One notification; no second enqueue.
- Prefs: `notifyNearbyInterests` missing → true. `contactsSyncEnabled` missing → false. `notifyNearbyContacts` true only after sync is on, unless explicitly false. Muting contact notices does not wipe hashes.
- Alerts: seen on **row open**, not tab enter. Consume `discoverNearby.results[].appearanceKey`. Do not rebuild presence or concatenate `peerUid:seq`. Write `users/{viewer}/alertSeen/{peerUid}` `{ seenAt, appearanceKey }`. Live `alertSeen` listener is shared across the viewer’s devices. UID change unsubscribes and clears state. Old servers without `appearanceKey` still mark seen by `seenAt` and do not invent a leave.
- `discoverNearby` additive `complete` / `truncated` / `appearanceKey`. Truncated/error/partial is not a leave.
- `reevaluateProximityNotices` (caller uid only, Auth + App Check) after first push token, interests/mode, notify toggles, contacts enable/sync/disable/remove/refresh, and block. Trailing 10s debounce matches the Functions lease. Session bind cancels the previous uid; a burst keeps the last trailing call.

### Identity Contacts (Android)

Callables, Auth + App Check, `us-central1`, codebase `nearsy-identity`:

| Name | Request | Success fields |
|---|---|---|
| `enableContactsSync` | `{}` | `result`, `contactsSyncEnabled`, `contactsEpoch`, `notifyNearbyContactsEffective`, `keyCount`, `syncCommitted`, `reevaluateRequired` |
| `syncContactHashes` | `{ sourceId, snapshotVersion, contactsEpoch, identifiers: [{ kind, value }] }` | those fields plus `sourceId`, `snapshotVersion`, `identifierCount` |
| `disableContactsSync` | `{ contactsEpoch }` | `result: "disabled"`, new `contactsEpoch`, `syncCommitted`, `reevaluateRequired` |
| `removeContactSource` | `{ sourceId, contactsEpoch }` | `result: "removed" \| "absent"`, `sourceId`, `syncCommitted`, `reevaluateRequired` |
| `refreshVerifiedActorKeys` | `{}` | `result: "refreshed"`, `keyCount`, `contactsSyncEnabled`, `contactsEpoch`, `syncCommitted`, `reevaluateRequired` |

Banned request fields: `hashes`, `hash`, `name`, `names`, `photo`, `photos`, `note`, `notes`, `displayName`. Identifiers only. Empty granted book is allowed. OS permission denied → `removeContactSource`, never an empty upload. Same `snapshotVersion` + same normalized set → Identity `idempotent`, `reevaluateRequired: false`. Cap 500 is a hard reject (no silent truncate). After `syncCommitted && reevaluateRequired`, the client schedules Functions `reevaluateProximityNotices`. A failed reevaluate does not retry the Identity body.

`sourceId` is stable per app install (`[A-Za-z0-9_-]{8,128}`), not an advertising id.

## Identity dependencies still open

Identity still needs to close:

1. **Actor-key validity** — no TTL/unverify rotation is specified. Facebook/LinkedIn emails stay fail-closed until Auth `emailVerified` or OTP phone. The client calls `refreshVerifiedActorKeys` after OTP success and on enable/sync. It does not invent expiry.
2. **Source-removal fencing** — Identity’s live set uses `source.epoch >= users.contactsEpoch` for caps; Functions consume uses equality only. The client never restores local snapshots after disable (`lastAckedVersion` cleared; epoch taken from the disable response). Epoch mismatch retries once against the live user-doc epoch.

If those rules change in the final Identity contract, adapt the client; do not invent a second wire.

## Physical QA

Not executed. Functions #40 and Identity #23 are still in review. No productive Identity/Functions calls were made from this work.
