# Android 2.0.9 Contacts sync: guarantees and limits

Scope: PR #117, Android client only. No device QA and no traffic to production
Identity back this document: behavior is proven against a fake Identity that applies
the rules of `src/modules/contactsHmac/service.ts` in `nearsy-identity-functions`, at
#27 (HEAD `477240b2f432f7828532b47310b253becf3287de`, merge
`295e0f44fc34bf4a1f17afa2d5ece987203665d1`).

**This client requires #27 deployed first.** A server without it rejects `contactsEpoch`
on enable as `contacts-identifier-invalid`, so no one could turn Contacts on. Identity reports
it deployed on `nearsy-dev`, with its positive tests still running. Production is pending, so
this build must not ship before that order is met.

## What each state means

| Fact | Source of truth |
|---|---|
| OS permission | `getPermissionsAsync`, read without prompting |
| Consent | The user's own action on this device; never inferred from the server |
| Enable confirmed | An Identity reply, or `users/{uid}` |
| Snapshot synced | `syncCommitted` with result `synced` or `idempotent`, for the source and version sent |

A timeout, a transport failure, `INTERNAL`/`UNKNOWN` without `details.reason`, or an
unreadable reply means the result is **unknown**. The cause of a bare `INTERNAL` is not
assumed: Identity before #25 answers Auth lookup failures this way. The state stays
pending and retryable, and is never shown as denied permission, synced or enabled.

While an outcome is unknown the toggle shows the last state Identity confirmed, and the
description says the result is unknown. Tapping asks for the operation again.

## Rate limit

With #27, the 2 s interval is per scope and enable does not delay the first sync, so no fixed
wait is needed. `contacts-rate-limited` is an explicit result: what was confirmed stays
confirmed, nothing is marked synced and no ack is written. A manual retry sends only the sync
when enable is already confirmed, with the same version for the same snapshot. There is no
automatic retry and no timer. The contract provides no retry-after value, so none is read.

## Epoch and enable

- Enable always sends `contactsEpoch`. It is never assumed: the epoch counts as confirmed only
  from an Identity success. A read of `users/{uid}` raises it but does not confirm it.
- Without a confirmed epoch, one `refreshVerifiedActorKeys` reads it first. That call has effects
  and spends rate budget, so there is no polling: it runs once per user action. If it does not
  answer, nothing is sent and the result stays pending.
- The stored epoch is per UID and never goes down. An epoch change voids the snapshot confirmation.
- Mismatch or `contacts-epoch-required` on enable: read once. On means no enable is needed. Off
  stops there, because turning on takes a new action.
- Mismatch on a sync: read once. Off stops. On uploads once at the live epoch, only if the user's
  intent, local consent and the OS permission are all still in force. A disable or an account change
  has already stopped that flow by then.
- Remove sends `knownSnapshotVersion`, the highest sent for this source and epoch, uncertain
  uploads included. `superseded` is not a withdrawal: the version is raised, and remove is sent
  once more, because that denial is still the current intent. If still superseded, it stays
  pending and is not shown as removed.

## More before the first read

Until `bindUserDoc` applies a read, the state is unknown: the section says it is checking, the
toggle and retry are locked, and enable sends nothing (`not_ready`). The rest of More is usable.
Reads repeat on remount or a language change. The automatic resend of an unconfirmed upload runs
at most once per session.

If that read fails, or does not answer within the callable timeout, the section shows a recoverable
error with a retry that only reads. It sends no enable or sync, asks for no permission, does not
poll, and does not trigger the automatic resend. Everything else stays locked, including turning
off, until the state is confirmed.

## Turning off

- It goes ahead of any running operation. The intent is recorded first, consent is cleared and
  pending uploads are dropped, before anything is sent.
- Each operation holds a token that a disable invalidates. The cancelled flow stops at its next
  step, so it cannot prompt, read the book or upload.
- A reply to a cancelled flow may only raise the epoch, and can owe a reevaluate. It is never "on".
- A refused or unanswered disable stays pending and is retried by the user, since it set no barrier.
- That pending disable is saved per UID before sending, and survives a restart. Until it is resolved
  enable and sync send nothing, and it is not shown as done.
- A read that shows off at a later epoch completes it. Off at the same epoch completes it only if
  Identity never confirmed this on; otherwise it may be a cached read.
- **On at a later epoch may be a new activation from another device,** so a mismatch reads and stops
  there, and the disable goes out at that epoch only on an explicit retry. Contract §14.4 would
  send it automatically; this client deliberately does not.
- Turning on again takes a new action, with the epoch from the disable or from a read.

## Overlapping operations

**Protecting the UI and storage is not the same as stopping a write.** A timeout or an
ignored callback cancels nothing: the request may still reach Identity. The two layers
are separate.

**Client state.** Within a session a request counts as live until it actually settles.
No timer releases it, so no later operation can overlap it. If it never settles, the
section stays pending until the next session (sign-out or restart). Replies addressed to
an earlier session are dropped. As a second layer, replies are ordered by epoch, which
only grows and only disable grows: a reply cannot undo a newer state.

**Server effects.** With #27 installed clients are not protected, but this client is:

| Older request lands after | Result on Identity | Client |
|---|---|---|
| sync → newer disable | Refused: epoch moved | Stays off |
| sync → newer sync | Refused as stale if lower; idempotent if identical | Same version only for the same content |
| enable → newer disable | Refused: it names the old epoch | Stays off |
| disable → newer enable | Refused: enable waits for the pending disable to resolve, which moves the epoch | Stays on |
| remove → newer sync | Kept: `superseded` | Version raised, not shown as removed |

**Known limit:** a stale local intent that reads a fresh epoch looks valid to the server. Cancelling
those is this client's job, which is what the disable token does.

## Order with the disclosure

#115 and #117 are integrated here. On every path that turns Contacts on or reads the book:

**disclosure → explicit acceptance → OS permission → enable/sync**

- **Cancel on the disclosure** asks for no permission, calls no Identity and reads no book.
- **OS permission comes before the first call to Identity,** including the read of the epoch.
- **Denied or dismissed while off:** nothing reaches Identity, and it stays off. There is no source to
  withdraw. If Identity already confirmed this on, a denial still withdraws the source.
- **Only the screen can state the acceptance.** `enableThenSyncContacts` without it returns
  `needs_disclosure` and does nothing. So does a retry that would read the book when this device
  has no consent yet, for example an account turned on from another install.
- **Reconciliation** never prompts and reads the book only with consent on this device and the
  permission already granted.

## Disable behind the live epoch: deliberate decision

Contract §14.4 says that when a disable gets `contacts-epoch-mismatch` and a refresh reads on, the
client should send disable again with the new epoch. **This client deliberately does not.** On at a
later epoch may be a new activation from another device, and an older request must not switch it off
by itself. It reads, adopts the epoch, keeps the disable pending and shows that the state changed;
the disable goes out only on an explicit retry. A refresh that reads off completes it.

Consequence: a real intent to turn off can stay pending until the user retries, and that retry does
turn off the other device's activation. Identity should know about this departure from the contract.

## Release order

The adaptation to Identity #27 needs that server deployed before this client is distributed. A server
without it rejects `contactsEpoch` on enable, so nobody could turn Contacts on.

## Why phone verification and source storage changed

- `PhoneVerificationScreen.android.tsx`: the session now owns Contacts state, so the
  post-OTP refresh no longer loads and passes it. It is still fire-and-forget inside the
  same `try/catch`, runs after verification and takes no arguments. OTP send, verify,
  resend and navigation are untouched, and `refreshVerifiedActorKeys` still sends `{}`.
  If a Contacts operation is running, the refresh is skipped; enable and sync also refresh
  keys, and the contract does not make this call the only invalidation path.
- `contactsSource.ts`: the old device-wide `sourceId` has an unknown owner, so it could
  credit one account's source to whichever signed in first. It is now per UID. State saved
  under a UID proves which source it used, which keeps its versions and fences. Nothing
  here reads or writes phone data or OTP state.

A source written by an earlier build whose local state was never saved stays orphaned on
the server and counts toward the caps. Removing it needs Identity.

## Known failures that are not regressions

The full `packages/shared` suite has the same 26 failures with and without the Contacts
work. Measured on clean copies of the commits, with dependencies from the lockfile:

| Commit | Tests | Pass | Fail |
|---|---|---|---|
| `adbfe9c` (before Contacts) | 1614 | 1588 | 26 |
| `c780bbe` | 1673 | 1647 | 26 |

```text
CompleteProfileScreen LOC reduced materially from monolith
app.json versionName 2.0.9 documents remote versionCode 40
authenticated + absent profile → OnboardingBirthDate
dirty mode switch confirms before callable; Continue Editing skips backend
does not replace MainTabs or write profileSetupCompleted on Own Profile save
packages/shared/src/__tests__/crjProfileDetails.test.ts
packages/shared/src/authentication/social/__tests__/appleProviderAdapter.test.ts
packages/shared/src/authentication/social/__tests__/appleSignInUi.test.ts
packages/shared/src/authentication/social/__tests__/authenticateWithApple.test.ts
packages/shared/src/authentication/social/__tests__/authenticateWithGoogle.test.ts
packages/shared/src/authentication/social/__tests__/crjNamePrefillApply.test.ts
packages/shared/src/authentication/social/__tests__/firebaseSocialAdapter.test.ts
packages/shared/src/authentication/social/__tests__/profilePrefill.test.ts
packages/shared/src/authentication/social/__tests__/socialFoundation.test.ts
packages/shared/src/profileContext/__tests__/profileContext.test.ts
packages/shared/src/visibility/__tests__/activeProfileModeSync.test.ts
packages/shared/src/visibility/__tests__/discoveryCompatibility.test.ts
packages/shared/src/visibility/__tests__/discoveryStabilization.test.ts
packages/shared/src/visibility/__tests__/mvpFreePresentation.test.ts
packages/shared/src/visibility/__tests__/profileExploration.test.ts
packages/shared/src/visibility/__tests__/visibilityCallableHttp.test.ts
packages/shared/src/visibility/__tests__/visibilityCallables.test.ts
packages/shared/src/visibility/__tests__/visibilityDraftNearby.test.ts
packages/shared/src/visibility/__tests__/visibilityFoundation.test.ts
packages/shared/src/visibility/__tests__/visibilityHomeUi.test.ts
packages/shared/src/visibility/__tests__/visibilityMvp.test.ts
```

Compare a new run against this list by name, not only by count.

The iOS typecheck is out of scope for this Android branch and is not run here.
