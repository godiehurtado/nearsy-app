# ADR — Explicit Facebook account linking (iOS 2.0.8)

- Status: Accepted
- Scope: `packages/shared` (iOS). Android, Cloud Functions, Firebase and Meta configuration are unchanged.
- Related: ENH-AUTH-LINK-01.

## Context

Nearsy runs Firebase Authentication with "one account per email address". When a person whose Nearsy account was created with email/password, Google or Apple tries **Login with Facebook**, Firebase rejects the sign-in with `auth/account-exists-with-different-credential`.

Since 2.0.7, the sign-in flow shows a neutral "account already exists" alert. That alert intentionally does not reveal the existing provider, does not keep the pending Facebook credential and never links automatically. The person, however, had no way to add Facebook to their account.

## Decision

1. **Linking is explicit and lives only in Settings.** More → *Sign-in methods* → *Connect Facebook*. Login and Welcome never link. Their static tests still forbid `linkWithCredential`, `fetchSignInMethodsForEmail` and any persistence in the sign-in flow.
2. **Proof of possession of both sessions.** The person must already be signed in to the Nearsy account (the current Firebase user), confirm the action explicitly, and then complete a fresh Facebook Limited Login. The Facebook OIDC token is bound to a newly generated nonce that is never reused. Firebase verifies the token and the raw nonce on `linkWithCredential(currentUser, credential)`.
3. **Three separate steps.**
   - Obtaining the Facebook credential reuses the existing provider adapter (Limited Login, nonce, nonce verification, native session cleanup).
   - Signing in (`signInWithCredential`) stays in the existing sign-in adapter.
   - Linking (`linkWithCredential`) lives in a dedicated adapter that never signs in.
4. **OIDC only for linking.** Linking requires the OIDC token + raw nonce pair. A classic AccessToken is not accepted as a linking credential. There are no Graph API calls, no App Tracking Transparency prompt and no tracking.
5. **The identity never changes.** The UID is captured before the Facebook sheet opens. The adapter refuses to link if the current UID changed. After linking, the orchestrator verifies the UID again, then reloads the user. Any mismatch fails closed.
6. **No automatic merge, no email heuristics.**
   - No `fetchSignInMethodsForEmail`.
   - No linking because emails match.
   - No merging of two UIDs, moving of data or deleting of users.
   - `auth/credential-already-in-use` and `auth/email-already-in-use` are reported with one neutral message: the Facebook account is associated with another Nearsy account.
7. **`auth/provider-already-linked`** counts as success only when the reloaded current user really has `facebook.com` in `providerData`.
8. **`auth/requires-recent-login`** shows guidance: sign out, sign back in, try again. The Delete Account reauthentication is not reused, because its contract and copy are specific to deletion and must not change.
9. **No unlink in 2.0.8.** No provider can be disconnected from the app.
10. **Credentials stay in memory.** Tokens and nonces exist only during the attempt. They are never stored (AsyncStorage, SecureStore, Firestore or disk) or logged. Development logs contain only stable error codes. The native Facebook session is cleared after every attempt.

## Sign-in methods shown

The list comes only from Firebase `providerData`: Email and password (`password`), Google (`google.com`), Apple (`apple.com`) and Facebook (`facebook.com`).

LinkedIn signs in through the A3 custom-token flow and does not appear in `providerData`. The client has no safe, verifiable source for a LinkedIn link state, so the screen does not show one. A neutral note says some methods, such as LinkedIn, may not appear in the list. Phone OTP is a verification step, not a sign-in method, and is not listed either.

## Consequences

- People with an existing account can add Facebook without support intervention and without any account takeover vector based on email.
- A Facebook identity already attached to another Nearsy account cannot be moved from the app. That requires a support process outside 2.0.8.
- Unlinking providers remains out of scope.
