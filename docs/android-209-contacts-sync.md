# Android 2.0.9 Contacts sync: guarantees and limits

Scope: PR #117, Android client only. No device QA and no traffic to production
Identity back this document: behavior is proven against a fake Identity that applies
the rules of `src/modules/contactsHmac/service.ts` in `nearsy-identity-functions`, at
#27 (HEAD `477240b2f432f7828532b47310b253becf3287de`, merge
`295e0f44fc34bf4a1f17afa2d5ece987203665d1`).

**This client requires #27 deployed first.** A server without it rejects `contactsEpoch`
on enable as `contacts-identifier-invalid`, so no one could turn Contacts on. Its dev
deployment is in progress and production is not authorized, so this build must not ship
before that order is met.

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
- Mismatch on a sync: read once. Off stops, and on uploads once at the live epoch.
- Remove sends `knownSnapshotVersion`, the highest sent for this source and epoch, uncertain
  uploads included. `superseded` is not a withdrawal: the version is raised, and remove is sent
  once more, because that denial is still the current intent. If still superseded, it stays
  pending and is not shown as removed.

## More before the first read

Until `bindUserDoc` applies a read, the state is unknown: the section says it is checking, the
toggle and retry are locked, and enable sends nothing (`not_ready`). The rest of More is usable.
Reads repeat on remount or a language change. The automatic resend of an unconfirmed upload runs
at most once per session.

## Turning off

- It goes ahead of any running operation. The intent is recorded first, consent is cleared and
  pending uploads are dropped, before anything is sent.
- Each operation holds a token that a disable invalidates. The cancelled flow stops at its next
  step, so it cannot prompt, read the book or upload.
- A reply to a cancelled flow may only raise the epoch, and can owe a reevaluate. It is never "on".
- A refused or unanswered disable stays pending and is retried by the user, since it set no barrier.
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
| disable → newer enable | Refused: the enable repeats the disable first, moving the epoch | Stays on |
| remove → newer sync | Kept: `superseded` | Version raised, not shown as removed |

**Known limit:** a stale local intent that reads a fresh epoch looks valid to the server. Cancelling
those is this client's job, which is what the disable token does.

## Integration requirement with #115

#115 is not integrated here, and this branch does not yet have the disclosure. The final
integration must keep this order, with no prompt and no book read before consent:

**disclosure → acceptance → OS permission → enable/sync**

- #115 moves the OS permission before enable, while this branch has enable first. Its
  changes to `contactsSyncFlow.ts`, `MoreScreen.tsx` and the copy will conflict and must
  be merged by hand.
- Consent stays set only by the user's action. The retry row and reconciliation must not
  bypass the disclosure: reconciliation already never prompts, and the retry may prompt
  only for a user who has accepted.
- Denied or dismissed permission at that point must not enable. The removal path for a
  denial after enable stays for permission revoked later.

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
