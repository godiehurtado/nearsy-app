# ADR — Delete Account through the `deleteMyAccount` callable (iOS 2.0.8)

- Status: Accepted
- Scope: `packages/shared` (iOS). Android, Cloud Functions, Firebase configuration and normal LinkedIn login are unchanged.
- Related: PR #80 (`fix/ios-delete-account-callable-2.0.8`).

## Context

Delete Account used to delete Firebase Auth, `users/{uid}`, Storage and related documents from the client. The backend now exposes `deleteMyAccount` (us-central1), which is the only component allowed to delete an account. Before deleting anything it checks, in this order: authenticated caller, App Check, a recent sign-in (`auth_time` at most 300 s old, 60 s future skew), and an empty payload. Precondition failures (`UNAUTHENTICATED`, `APP_CHECK_REQUIRED`, `RECENT_LOGIN_REQUIRED`, `INVALID_ARGUMENT`) delete nothing. `DELETION_RETRYABLE` and `DELETION_FAILED` may follow a partial deletion. Success is idempotent: `DELETED` or `ALREADY_DELETED`.

Password, Google, Apple and Facebook accounts can prove a recent sign-in with `reauthenticateWithCredential`, which refreshes `auth_time` for the same user without replacing the session.

LinkedIn signs in through the A3 custom-token flow. It provides no Firebase `AuthCredential`, so `reauthenticateWithCredential` cannot be used. The only way to get a fresh LinkedIn session is the full A3 flow: LinkedIn OAuth in the browser, then Identity Functions resolves **or creates** the Firebase user for the selected LinkedIn identity, then `signInWithCustomToken`. Identity Functions resolves or creates that identity before the client can compare UIDs. Running that flow inside Delete Account could therefore create an additional Auth user when the person picks a different LinkedIn account, even if the client later refuses to switch sessions. That is not acceptable inside a destructive flow.

## Decision

1. **The backend is the only deletion authority.** The app calls `deleteMyAccount` once, with an empty payload, the JS ID token and an App Check token. It never deletes Auth, Firestore, Storage, `contactHashes`, `discoveryProfiles`, `proximitySignals` or matching data. After a confirmed success (`DELETED` / `ALREADY_DELETED`) it only clears local state: Visibility runtime, last-known visibility, native provider sessions, Firebase sign-out and navigation to Login.
2. **The backend recent-session check is authoritative.** The client skips reauthentication when the current `auth_time` is at most 240 s old. That is only an optimization that stays under the 300 s backend limit. `RECENT_LOGIN_REQUIRED` from the backend always wins.
3. **Credential-based reauthentication only, with an explicit method selector.** Delete Account lists every safe method actually linked in `currentUser.providerData` (password, Google, Apple, Facebook; never inferred from the email, never LinkedIn) as a radio selector shown before any attempt, with the first one selected by default. The password field appears only while password is selected. The destructive action stays disabled until exactly `DELETE` is typed. Changing the selection never opens a provider or starts a deletion. After the destructive confirmation:
   - password: the typed password is always verified;
   - Google / Apple / Facebook: skipped while the session is still recent, otherwise only the selected provider reauthenticates; after a backend `RECENT_LOGIN_REQUIRED` the next attempt always reauthenticates.

   Reauthentication uses `reauthenticateWithCredential` for the UID that was confirmed. A UID change before or after reauthentication aborts before the callable.
4. **No LinkedIn OAuth inside Delete Account.** Delete Account never starts the LinkedIn A3 flow, opens the LinkedIn browser, requests a custom token, calls `signInWithCustomToken`, handles the A3 callback or resume, or resolves or creates a LinkedIn identity. For a LinkedIn session, Delete Account either uses the current session when it is recent or shows guidance:
   - Recent session: `deleteMyAccount` is called directly.
   - Stale session, or backend `RECENT_LOGIN_REQUIRED`: "For security, sign out, sign back in with LinkedIn, and request account deletion within the next 5 minutes." Nothing is deleted. There is no automatic sign-out. Loading is released, and the person can cancel or retry.
   - LinkedIn plus another provider: password, Google, Apple or Facebook is offered for reauthentication. LinkedIn is never an inline reauthentication button. If the session is already recent, no provider has to be chosen.
5. **Ambiguous outcomes never claim completion.** Network timeouts and unknown failures are reported as "we couldn't confirm"; the profile gate stays suppressed because `users/{uid}` may already be gone. No automatic retry.
6. **Errors are mapped by `details.reason`** to translated EN / ES messages. Raw Firebase or backend messages are never shown, and tokens or PII are never logged.

## Guards

Static tests fail if any file of the Delete Account flow contains `signInWithCustomToken` / custom tokens, LinkedIn login adapters (`authenticateWithLinkedIn`, `runLinkedInA3BrowserAuthFlow`), LinkedIn OAuth endpoints, `expo-web-browser`, the A3 callback / durable resume, or user creation (`resolveOrCreateUser`, `createUser…`). Imports from `authentication/linkedinA3` are limited to the shared App Check and environment modules. A separate test confirms that normal LinkedIn login still uses the A3 browser flow and `signInWithCustomToken`.

## Consequences

- A LinkedIn-only account with a stale session needs one extra step: sign out, sign back in with LinkedIn, and request deletion within 5 minutes.
- No Auth user can be created as a side effect of Delete Account.
- Accounts with a linked credential provider keep inline reauthentication.
