# Android encounter-notify / Alerts / Contacts (Functions #40 + Identity #23)

Read-only contract sources, not deployed:

- Functions PR #40 HEAD `60d33bab35743b39d221ec92d550129b623173f5` (`feat/209-encounter-notify`)
- Identity PR #23 HEAD `cf6e6d9862d0005e00ae84d4dbdca6791d242fa8` (`feature/209-contacts-hmac`)

This client PR does not modify Functions, Identity, FCM credentials, iOS, or merge.

## Contract notes (do not confuse layers)

- **Identity fencing** (`contactSourceFences/{sourceId}`): after `removeContactSource`, a later sync with `snapshotVersion <= removedSnapshotVersion` is `contacts-source-removed`. Recreate that `sourceId` with a **greater** version. Disable deletes all fences and bumps `contactsEpoch`.
- **Functions consume** (`60d33bab` `contactsConsume.ts`): a source participates only when `source.epoch === contactsEpoch` (exact equality). Older and future epochs are skipped. This is **not** Identity’s fence table.
- Actor-key mint/withdraw is server-side in Identity (OTP/Auth writes + 15‑minute sweep). The client may still call `refreshVerifiedActorKeys` after OTP for immediacy; it is not the sole invalidation path.

## Implemented

- Push: keep `kind=contact_nearby` + `actorUid` navigation. Optional `motive` (`interest` | `contact` | `both`) and legacy `fromContacts`.
- Prefs: `notifyNearbyInterests` missing → true. `contactsSyncEnabled` missing → false. Muting `notifyNearbyContacts` does not wipe hashes.
- Alerts: seen on row open. Consume server `appearanceKey` only. Live `alertSeen` listener shared across devices. UID change unsubscribes and clears state.
- `reevaluateProximityNotices`: Auth + App Check, caller uid, trailing 10s debounce. Durable pending flag is **per UID**; retries Functions only (never the already-confirmed book). Account change cancels in-memory work for the previous session.

### Identity Contacts (Android)

Callables: `enableContactsSync`, `syncContactHashes`, `disableContactsSync`, `removeContactSource`, `refreshVerifiedActorKeys`.

- Request field: `contactsEpoch` (never `expectedEpoch`).
- Monotonic `snapshotVersion` per `sourceId`; after remove, local `removedSnapshotFloor` prevents restarting at 1 against an Identity fence. Disable clears the floor with the new epoch.
- Caps are hard rejects (500 identifiers / snapshot, 8 sources, 500 unique union). UI surfaces distinct errors; no silent truncate and no success toast.
- Local ack stores only opaque `fp1:` digests — never raw phones/emails. No identifier logs.
- Native: `expo-contacts` + `READ_CONTACTS` for the next candidate. `WRITE_CONTACTS` remains blocked.

## Physical QA

Not executed. Functions #40 and Identity #23 are still in review. No productive Identity/Functions calls were made from this work.
