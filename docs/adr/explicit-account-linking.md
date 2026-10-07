# ADR — Explicit account linking: Google, Apple and Facebook (iOS 2.0.8)

- Status: Accepted
- Scope: `packages/shared` (iOS). Android, Cloud Functions, Firebase and Meta configuration are unchanged.
- Related: ENH-AUTH-LINK-01.

## Context

Nearsy runs Firebase Authentication with "one account per email address". Two behaviours follow from it:

- **Facebook on an existing account.** When a person whose account was created with email/password, Google or Apple tries **Login with Facebook**, Firebase rejects the sign-in with `auth/account-exists-with-different-credential`. Since 2.0.7 the sign-in flow shows a neutral "account already exists" alert. It does not reveal the existing provider, does not keep the pending credential and never links automatically.
- **Google / Apple replacing a provider.** Google and Apple are trusted providers for their email domains. A direct Google or Apple sign-in on an account whose email matches, created with email/password or Facebook, keeps the same UID and profile, but Firebase can drop the previous, unverified provider. Nearsy does not call `unlink` anywhere. This is Firebase server behaviour and the client cannot detect it before sign-in without an email-based lookup, which is forbidden.

Product rule: to add a sign-in method, the person signs in with a current method and connects the new one explicitly from More → Sign-in methods. Accounts are never merged and providers are never linked because emails match.

## Decision

1. **Preventive warning on Login only.** Before a direct Google or Apple sign-in from the Login screen (iOS), a neutral dialog explains the rule. *Go back* cancels silently. *Continue* runs exactly the existing sign-in. The warning does not appear in Welcome, Sign-in methods, reauthentication, or for Facebook, LinkedIn and email. It does not look anything up by email, does not reveal whether an account exists and persists nothing.
2. **Linking is explicit and lives only in Settings.** More → *Sign-in methods* → *Connect Google / Apple / Facebook*. Login and Welcome never link. Their static tests still forbid `linkWithCredential`, `fetchSignInMethodsForEmail` and any persistence in the sign-in flow.
3. **Proof of possession of both identities.** The person must already be signed in (the current Firebase user), confirm the action, and complete a fresh provider authentication:
   - Google: a fresh ID token from Google Sign-In.
   - Apple: an identity token bound to a newly generated nonce. The SHA-256 hash goes to Apple and the raw nonce goes to Firebase. A nonce is never reused. Missing name or email does not block linking.
   - Facebook: Limited Login OIDC token + raw nonce. A classic AccessToken is not accepted for linking.
4. **Three separate steps.**
   - Obtaining the credential reuses the existing provider adapters.
   - Signing in (`signInWithCredential`) stays in the existing sign-in adapter.
   - Linking (`linkWithCredential(currentUser, credential)`) lives in a dedicated adapter that never signs in and never creates users.
5. **One flow at a time.** A single in-progress guard covers every provider, and every connect button is disabled while a connection runs.
6. **The identity never changes.** The UID is captured before the provider opens. The adapter refuses to link if the current UID changed. After linking, the orchestrator verifies the UID again, reloads the user, and requires the expected provider in `providerData`. Any mismatch fails closed.
7. **No automatic merge, no email heuristics.**
   - No `fetchSignInMethodsForEmail`.
   - No linking because emails match.
   - No merging of two UIDs, moving of data or deleting of users.
   - `auth/credential-already-in-use`, `auth/email-already-in-use` and `auth/account-exists-with-different-credential` share one neutral message: that provider account is associated with another Nearsy account and nothing was changed.
8. **`auth/provider-already-linked`** counts as success only when the reloaded current user, with the same UID, has the provider in `providerData`.
9. **`auth/requires-recent-login`** shows guidance: sign back in with the current method and try again. The Delete Account reauthentication is not reused.
10. **No unlink in 2.0.8.** No provider can be disconnected from the app.
11. **Credentials stay in memory.** Tokens and nonces exist only during the attempt. They are never stored (AsyncStorage, SecureStore, Firestore or disk) or logged. Development logs contain only the provider, a stable error code and a diagnostic code. Native sessions are cleaned up:
    - Facebook: cleared after every attempt.
    - Google: cleared after a cancelled or failed attempt.
    - Apple: no session to clear.

## Sign-in methods shown

The list comes only from Firebase `providerData`:

- Email and password (`password`): shown only when present. There is no "connect email" action.
- Google (`google.com`), Apple (`apple.com`), Facebook (`facebook.com`): *Connected*, or a *Connect* button.

LinkedIn signs in through the A3 custom-token flow and does not appear in `providerData`. The client has no safe, verifiable source for a LinkedIn link state, so the screen does not show one. A neutral note says some methods, such as LinkedIn, may not appear in the list. Phone OTP is a verification step, not a sign-in method, and is not listed either.

## Consequences

- People with an existing account can add Google, Apple or Facebook without support intervention and without any account takeover vector based on email.
- A direct Google / Apple sign-in can still replace an unverified provider. Nearsy can only warn before it happens. It cannot prevent it without email lookups.
- A provider identity already attached to another Nearsy account cannot be moved from the app. That requires a support process outside 2.0.8.
- Unlinking providers remains out of scope.
