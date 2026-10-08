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
   - `facebook.com` → fresh Facebook token + `reauthenticateWithCredential`;
   - `li_` UID (LinkedIn custom-token accounts) → a fresh LinkedIn flow.
   Methods are listed in that order and the person picks one; a method is
   only offered when its provider is configured in the build.
3. LinkedIn has no reauthenticate API. The fresh custom token is decoded
   locally and its `uid` claim must equal the signed-in UID before
   `signInWithCustomToken` runs, so a different LinkedIn account can never
   replace the session; the UID is checked again after sign-in. If the token
   cannot be verified, or LinkedIn is disabled in the build, the screen tells
   the person to sign out, sign back in with LinkedIn and delete within five
   minutes; that path calls the backend without client reauthentication and
   the backend still enforces `auth_time`.
4. The UID captured before reauthentication must be unchanged before the
   call; otherwise the attempt aborts.
5. Only an explicit `{ ok: true, status }` response counts as success. Then
   the contractual logout runs (publication gate, background location, in-flight
   publications, Facebook and Google native sessions, Firebase `signOut`), the
   per-account local caches are cleared and the app returns to Login.
6. Any failure leaves the session, local state and data untouched. Errors are
   mapped from `details.reason` to EN/ES copy; server messages are never
   shown. One attempt runs at a time and the person can always retry.

## Consequences

- ADR 0001's note that Delete Account reauthentication "applies unchanged"
  is superseded: every linked method can now confirm the deletion.
- A network failure after the call is ambiguous; the app never claims success
  and a retry is safe because the backend is idempotent.
- Code: `accountDeletion/deleteAccountCore.ts` (pure use case),
  `accountDeletion/deleteAccount.android.ts` (adapters),
  `screens/DeleteAccountScreen.tsx`.
