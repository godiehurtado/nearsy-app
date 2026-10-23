# NEARSY-209 — X ownership: iOS client contract

This file records the iOS Own Profile mapping. Do not invent callables or fields beyond Identity.

Pilot Connect, not login. One X subject per consent, no picker. Firebase Auth + App Check. Region `us-central1`.

## Product

- Own Profile only; out of CRJ.
- Personal and Professional are independent.
- Connect uses `ASWebAuthenticationSession` with callback `nearsy://x-ownership`.
- Redirect at X is HTTPS `xOwnershipCallback`. Do not register `nearsy://` in the X console.
- iOS generates a new client-proof S256 pair per Start. That is not X PKCE; the server attaches X PKCE on `authorizationUrl`. Open that URL as-is.
- Exchange sends only `transactionId` + `clientProofVerifier`. `mode` is forbidden on Exchange.
- Deep-link `mode` is informational. Correlate the return with the started transaction and its UID/mode context. Do not send `mode` to mutate.
- Manual X/Twitter URL is not a verified path. Legacy bag field is `twitter` (platform id `x`). Preserve it privately when saving other networks; never count it as verified ownership.
- Do not log verifier, full `authorizationUrl`, OAuth codes, or tokens.

## Callables (Auth + App Check)

`xOwnershipStart`, `xOwnershipExchange`, `xOwnershipGet`, `xOwnershipUnlink`.

Start request:

```
{ mode: "personal"|"professional", platform: "ios", clientProofChallenge, clientProofMethod: "S256" }
```

Start response:

```
{ transactionId, mode, authorizationUrl, expiresAt }
```

`expiresAt` is epoch milliseconds (TTL 10 min). `authorizationUrl` already includes `scope=tweet.read users.read`, X PKCE S256, and no `offline.access`.

Exchange request: `{ transactionId, clientProofVerifier }` (no `mode`).

Verified (Exchange or Get): `{ result: "verified", platform: "x", mode, userId, canonicalUrl, usernameCache, verifiedAt }`.

Get not linked: `{ result: "not_linked", platform: "x", mode, linked: false }`.

Unlink `{ mode }` → `{ result: "unlinked", platform: "x", mode, unlinked: true }`.

## Client policy

- Get on editor enter. Do not auto-repeat Start, OAuth, or Exchange.
- Exchange only after `result=ok`, matching `transactionId`, same UID, and `Date.now() < expiresAt`.
- Clear verifier and transient state on complete, cancel, expiry, or account change.
- After ambiguous Exchange or Unlink failures, reconcile with Get.
- Discard stale results from another account, mode, or in-flight operation.
- Never auto-retry rate-limit or credits/access. Do not claim X is free.
