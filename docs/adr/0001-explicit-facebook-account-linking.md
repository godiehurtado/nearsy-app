# ADR 0001 — Explicit Facebook account linking (ENH-AUTH-LINK-01, Android 2.0.8)

- **Status:** Accepted
- **Scope:** Nearsy Android (`develop-android`). iOS is not affected.
- **Relates to:** ENH-AUTH-FB-01 (Facebook Login, Android 2.0.7)

## Context

ENH-AUTH-FB-01 introduced Facebook Login on Welcome / Login with a strict
"no account linking" policy, enforced in code and tests:

- `authentication/facebook/facebookAuthCore.ts` and
  `services/firebaseFacebookAuth.android.ts` never call `linkWithCredential`.
- `auth/account-exists-with-different-credential` surfaces as an error; no
  pending credential is kept and nothing continues after another login.
- Guard tests (`androidFacebookAuth.test.ts`, `facebookAuth.test.ts`,
  `facebookSignInFlow.test.ts`) fail if linking APIs or
  `fetchSignInMethodsForEmail` appear in the sign-in surface.

People who already have a Nearsy account (email/password, Google or LinkedIn)
and try Facebook Login with the same email hit
`account-exists-with-different-credential` and have no way to add Facebook.

## Decision

Allow **one** controlled exception: an explicit, authenticated action that
links Facebook to the **currently signed-in** Nearsy user from
More → Sign-in methods.

1. **Explicit:** the person opens Sign-in methods and confirms "Connect
   Facebook". Linking never happens during Welcome, Login, sign-up or any
   automatic flow.
2. **Possession of both sessions:** the person is already signed in to Nearsy
   (Firebase `currentUser`) and completes a fresh interactive Facebook login
   (the native session is dropped first, so the access token is new).
3. **Same UID:** the UID is captured before Facebook login, checked again
   right before linking, and the UID after `linkWithCredential` must be
   identical. Any mismatch aborts.
4. **No merge:** no UIDs are merged, no other user is deleted and no data is
   moved. `credential-already-in-use` (Facebook belongs to another Nearsy
   account) is reported and stops.
5. **No email heuristic:** linking never depends on matching emails and never
   calls `fetchSignInMethodsForEmail`. Facebook may be linked even when it
   returns no email, because the person proved possession of both sessions.
6. **No pending credential:** the Facebook access token lives only in memory
   for the duration of the call; it is never stored, logged or reused.
7. **No unlink in 2.0.8:** providers cannot be disconnected from the app.

## Boundaries

- Linking code lives in dedicated modules:
  `authentication/facebook/facebookAccountLinking.ts` (pure use case),
  `services/firebaseFacebookLink.android.ts` (RNFirebase adapter) and
  `services/facebookAccountLinking.android.ts` (facade). The Welcome / Login
  modules keep the ENH-AUTH-FB-01 guards unchanged.
- The linking use case has no sign-in capability: it can never call
  `signInWithCredential`.
- No Graph API, no Firestore writes, no Firebase / Meta configuration changes
  and no Delete Account changes.
- Sign-in methods only shows methods backed by evidence: Firebase
  `providerData` (`password`, `google.com`, `facebook.com`) and, for LinkedIn,
  the server-derived UID shape (`li_` + SHA-256, enforced by the identity
  Functions). No method is inferred from email.

## Consequences

- Welcome / Login keep reporting `account-exists-with-different-credential`
  without revealing the existing provider; the copy now points to Sign-in
  methods.
- `requires-recent-login` asks the person to log out, sign back in with their
  current method and retry, because the only password re-entry UI lives in
  Delete Account and must not change.
- Accounts that link Facebook gain a second sign-in method; existing Delete
  Account reauthentication rules apply unchanged.
