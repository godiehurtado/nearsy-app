# Android encounter-notify / Alerts (Functions #40)

Read-only contract source: `godiehurtado/nearsy-functions` PR #40 HEAD `2426d624417e318ae2d939e1213cb137e7079b46` (`feat/209-encounter-notify`).
Not deployed. This client PR does not modify Functions, Identity, FCM credentials, iOS, or merge.

## Implemented

- Push: keep `kind=contact_nearby` + `actorUid` navigation. Optional `motive` (`interest` | `contact` | `both`) and legacy `fromContacts`. One notification; no second enqueue.
- Prefs: `notifyNearbyInterests` defaults **true** when absent. Contacts sync stays off until Identity consent (`contactsSyncEnabled` missing → false). No Identity enable/disable UI.
- Alerts: seen on **row open**, not tab enter. Write `users/{viewer}/alertSeen/{peerUid}` `{ seenAt, appearanceKey }`. Badge uses unseen `appearanceKey` mismatch. Old servers without `appearanceKey` still mark seen by `seenAt` and do not invent a leave.
- `discoverNearby` additive `complete` / `truncated` / `appearanceKey`. Truncated/error/partial is not a leave.
- `reevaluateProximityNotices` (caller uid only, Auth + App Check) after first push token, interests/mode, notify toggle, and block. Debounced 10s.

## Not implemented (Identity wire pending)

- `syncContactHashes`, READ_CONTACTS / WRITE_CONTACTS, epochs, snapshot versions, hashed book, or inventing callables.

## Physical QA

Not executed. Functions #40 is still in review.
