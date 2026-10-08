# ADR 0001 — Explicit Facebook and Google account linking (ENH-AUTH-LINK-01, Android 2.0.8)

- **Status:** Accepted
- **Scope:** Nearsy Android (`develop-android`). iOS is not affected.
- **Relates to:** ENH-AUTH-FB-01 (Facebook Login, Android 2.0.7), TS-007 (Google Sign-In)

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

QA on nearsy-dev also showed that signing in **directly** with Google on an
account created with email/password or Facebook keeps the same UID and
profile, but Firebase may drop the previous provider (`password` or
`facebook.com`) without any warning. Nearsy does not unlink providers; this is
Firebase's own behavior when a Google sign-in matches an existing email.
Nearsy must not rely on that replacement.

## Decision

Allow **one** controlled exception: an explicit, authenticated action that
links Google or Facebook to the **currently signed-in** Nearsy user from
More → Sign-in methods.

1. **Explicit:** the person opens Sign-in methods and confirms "Connect
   Google" or "Connect Facebook". Linking never happens during Welcome, Login,
   sign-up or any automatic flow.
2. **Possession of both sessions:** the person is already signed in to Nearsy
   (Firebase `currentUser`) and completes a fresh interactive provider login
   (the previous native provider session is dropped first, so the token is
   new).
3. **Same UID:** the UID is captured before the provider login, checked again
   right before linking, and the UID after `linkWithCredential` must be
   identical. Any mismatch aborts.
4. **No merge:** no UIDs are merged, no other user is deleted and no data is
   moved. `credential-already-in-use` / `email-already-in-use` are reported
   and stop.
5. **No email heuristic:** linking never depends on matching emails and never
   calls `fetchSignInMethodsForEmail`. A provider may be linked even when it
   returns no email, because the person proved possession of both sessions.
6. **No pending credential:** provider tokens live only in memory for the
   duration of the call; they are never stored, logged or reused.
7. **No unlink in 2.0.8:** providers cannot be disconnected from the app.
8. **One attempt at a time:** Sign-in methods holds a single lock across
   providers, so Google and Facebook cannot be linked concurrently.

Login (only Login, only Google) shows a preventive warning before Google
sign-in, pointing existing users to sign in with their current method and
connect Google from Sign-in methods. It looks nothing up, reveals nothing
about existing accounts and keeps the existing sign-in flow when the person
continues.

## Boundaries

- Linking code lives in dedicated modules:
  `authentication/accountLinking/accountLinkingCore.ts` (provider-agnostic
  use case and screen lock), `authentication/facebook/facebookAccountLinking.ts`
  and `authentication/google/googleAccountLinking.ts` (provider bindings),
  `services/firebaseAccountLink.android.ts` (the only `linkWithCredential`
  call) and `services/facebookAccountLinking.android.ts` /
  `services/googleAccountLinking.android.ts` (facades). The Welcome / Login
  modules keep the ENH-AUTH-FB-01 guards and keep using sign-in.
- The linking use cases have no sign-in capability: they can never call
  `signInWithCredential`.
- No Graph API, no Firestore / Storage writes, no Firebase / Meta / Google
  configuration changes and no Delete Account changes.
- Sign-in methods only shows methods backed by evidence: Firebase
  `providerData` (`password`, `google.com`, `facebook.com`) and, for LinkedIn,
  the server-derived UID shape (`li_` + SHA-256, enforced by the identity
  Functions, which also use the prefix to recognize LinkedIn accounts). No
  method is inferred from email. Phone is not a sign-in method.

## Consequences

- Welcome / Login keep reporting `account-exists-with-different-credential`
  without revealing the existing provider; the copy now points to Sign-in
  methods.
- `requires-recent-login` asks the person to log out, sign back in with their
  current method and retry, because the only password re-entry UI lives in
  Delete Account and must not change.
- Accounts that link a provider gain another sign-in method; existing Delete
  Account reauthentication rules apply unchanged.
