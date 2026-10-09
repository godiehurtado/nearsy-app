# ADR 0002 — Delete Account through the `deleteMyAccount` callable (Android 2.0.8)

- **Status:** Accepted
- **Scope:** Nearsy Android (`develop-android`). iOS and Functions are not affected.
- **Relates to:** BUG-DEL-01 (backend `deleteMyAccount`), ADR 0001 (account linking)

## Context

Android deleted accounts from the client: `user.delete()` first, then
`contactHashes`, Storage `users/{uid}` and `users/{uid}`. Once the Auth user
was gone, Security Rules rejected the data deletes (`request.auth` was
empty), leaving orphaned data, and Discovery, proximity and matching data
were never touched.

The backend callable `deleteMyAccount` (us-central1) deletes every owner
datum first and the Auth user last. It requires App Check and an `auth_time`
no older than five minutes (`RECENT_LOGIN_REQUIRED`), accepts only an empty
payload and is idempotent (`ALREADY_DELETED`).

## Decision

1. `deleteMyAccount({})` is the only deletion path. The client never calls
   `user.delete()` and never deletes Firestore or Storage data for the account.
2. The person reauthenticates right before the call with one of the methods
   actually linked to the account, never inferred from email:
   - `password` in `providerData` → password + `reauthenticateWithCredential`;
   - `google.com` → fresh Google ID token (explicit picker) + `reauthenticateWithCredential`;
   - `facebook.com` → fresh Facebook token + `reauthenticateWithCredential`.
   Methods are listed in that order and the person picks one; a method is
   only offered when its provider is configured in the build.
3. LinkedIn accounts (`li_` UID) sign in with a Firebase custom token. There
   is no LinkedIn `AuthCredential` compatible with
   `reauthenticateWithCredential`, and a fresh LinkedIn OAuth flow inside
   Delete Account is not acceptable: choosing another LinkedIn account could
   make the identity Functions create a different user before the client
   notices, and reading the token `uid` on the device is not a cryptographic
   validation. Delete Account therefore never starts LinkedIn OAuth, never
   obtains a custom token and never calls `signInWithCustomToken`.
   - **LinkedIn is the only detectable method:** the screen calls
     `deleteMyAccount({})` with the current session (recent-session policy).
     The backend remains the authority on `auth_time <= 300 s`. If it answers
     `RECENT_LOGIN_REQUIRED`, the screen shows: "For security, sign out, sign
     back in with LinkedIn, and request account deletion within the next 5
     minutes." It does not sign out, delete anything or keep the loading state.
   - **LinkedIn plus password, Google or Facebook:** only those methods are
     offered for reauthentication; LinkedIn is never an inline reauth button.
4. The UID captured before the attempt must be unchanged before the call;
   otherwise the attempt aborts.
5. Only an explicit `{ ok: true, status }` response counts as success. Then
   the contractual logout runs (publication gate, background location, in-flight
   publications, Facebook and Google native sessions, Firebase `signOut`), the
   per-account local caches are cleared and the app returns to Login.
6. Any failure leaves the session, local state and data untouched. Errors are
   mapped from `details.reason` to EN/ES copy; server messages are never
   shown. One attempt runs at a time and the person can always retry.

## Consequences

- ADR 0001's note that Delete Account reauthentication "applies unchanged"
  is superseded: password, Google and Facebook can confirm the deletion.
- A LinkedIn-only person whose session is older than five minutes must sign
  out and back in before deleting; this is the accepted cost of never running
  LinkedIn OAuth inside Delete Account.
- Guard tests fail if the Delete Account files reference custom-token sign-in,
  the LinkedIn login adapter, the LinkedIn OAuth start/callback or user
  creation.
- A network failure after the call is ambiguous; the app never claims success
  and a retry is safe because the backend is idempotent.
- Code: `accountDeletion/deleteAccountCore.ts` (pure use case),
  `accountDeletion/deleteAccount.android.ts` (adapters),
  `screens/DeleteAccountScreen.tsx`.
