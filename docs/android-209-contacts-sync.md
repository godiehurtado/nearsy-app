# Android 2.0.9 Contacts sync: guarantees and limits

Scope: PR #117, Android client only. No device QA and no traffic to production
Identity back this document: behavior is proven against a fake Identity that applies
the rules of `src/modules/contactsHmac/service.ts` in `nearsy-identity-functions`.

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

## Pending server dependency: rate limit

Identity rejects writes closer than 2 s apart (`contacts-rate-limited`), and enable and
sync both count. Enable followed by sync can therefore be rejected when the permission
is already granted. Identity is reproducing this as a separate defect.

The client does not work around it with a fixed wait:

- `contacts-rate-limited` is an explicit result. Enable and its epoch stay confirmed,
  nothing is marked synced, and no ack is written.
- A manual retry sends only the sync, with the same version for the same snapshot. It
  does not repeat enable, because that would be one more write inside the limit.
- There is no automatic retry and no timer.
- The contract does not provide a retry-after value (checked on `main` in the contract
  document, `errors.ts`, `callableErrors.ts` and `service.ts`), so none is read.

**Until the server is fixed**, a first enable with the permission already granted is
likely to end in "On, waiting to sync" and need one manual retry.

## Overlapping operations

**Protecting the UI and storage is not the same as stopping a write.** A timeout or an
ignored callback cancels nothing: the request may still reach Identity. The two layers
are separate.

**Client state.** Within a session a request counts as live until it actually settles.
No timer releases it, so no later operation can overlap it. If it never settles, the
section stays pending until the next session (sign-out or restart). Replies addressed to
an earlier session are dropped. As a second layer, replies are ordered by epoch, which
only grows and only disable grows: a reply cannot undo a newer state.

**Server effects.** What the contract can and cannot resolve:

| Older request lands after | Result on Identity | Client |
|---|---|---|
| sync → newer disable | Refused: epoch moved, sync cannot re-enable | Stays off |
| sync → newer sync | Refused as stale if lower; idempotent if identical | Same version only for the same content |
| disable → newer enable | Would switch it off, since enable keeps the epoch | **Fenced:** with a disable unresolved, enable first repeats it, moving the epoch past the old request |
| remove → newer sync | **Not resolvable:** remove carries no version, so it can delete the newer source | Shown as synced until the next upload is refused or the source is re-sent |
| enable → newer disable | **Not resolvable:** enable carries no epoch, so it can re-enable | Off until the next read of `users/{uid}`, then "On, waiting to sync", without consent or a book read |

The two unresolvable rows need a server change (an epoch on enable, a version on
remove). Within one session they cannot happen; they need a restart or sign-out while the
older request is still in transit.

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
