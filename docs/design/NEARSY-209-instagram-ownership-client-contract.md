# NEARSY-209 — Instagram reverse-DM: iOS client contract

Canonical Identity + Functions shapes live in:

`nearsy-identity-functions/docs/design/NEARSY-209-instagram-ownership-client-contract.md`

This file records the iOS Own Profile mapping. Do not invent callables or fields beyond Identity.

## Product

- Own Profile only; out of CRJ.
- Personal and Professional are independent.
- No Exchange / Confirm. The client never sends `code`, `handle`, `username`, `igsid`, `url`, `profileUrl`, `redirectUri`, or `returnUrl`.
- Manual Instagram URL is not a verified path; legacy bag URLs are preserved privately and never counted as verified.
- Do not log challenge codes, IGSID, or message text.

## Callables (Auth + App Check)

`instagramOwnershipStart`, `instagramOwnershipGet`, `instagramOwnershipUnlink`.

Inbox authorization is an Identity Owner procedure (`instagramInboxAuthorizeStart`), not user Connect Instagram.

Temporary production Owner action (this admin IPA only): Own Profile → Social shows **Authorize @nearsy.app inbox** solely when iOS + `nearsy-pj` + UID `ATuSeZ1dR7dtMUUo0FWzcy7seO43`. Calls `instagramInboxAuthorizeStart` with `{}` and opens `authorizationUrl` in the system browser. Do not log the URL, codes, or tokens. Effective allowlist remains Identity `INSTAGRAM_INBOX_ADMIN_UIDS`. Reverse-DM Start/Get/Unlink is unchanged.

Start request: `{ mode: "personal"|"professional", platform: "ios" }`.

Start / Get `pending`: `{ result, platform: "instagram", mode, challengeId, code, inboxUsername, inboxProfileUrl, expiresAt }` (`expiresAt` epoch ms).

Get `verified`: `{ result, platform, mode, igsid, canonicalUrl, usernameCache, verifiedAt }`.

Get `expired` (no code): `{ result, platform, mode, challengeId, expiresAt }`.

Get `conflict`: `{ result, platform, mode, reason: "instagram-account-claimed" }`.

Get `not_linked`: `{ result, platform, mode, linked: false }`.

Unlink: `{ mode }` → `{ result: "unlinked", platform, mode, unlinked: true }`.

`expired` and `conflict` are Get results, not HttpsError. Start `instagram-rate-limited` is `resource-exhausted`. The client never auto-Starts a new code.

## Client policy (not specified by Functions)

Poll Get every 5s only while `pending`, the editor screen is focused, and the challenge has not expired. One Get on focus, on AppState return to active, and at local `expiresAt` so `expired`/`conflict` are applied. Stop interval on verified, expired, conflict, `not_linked`, leave, or mode/account change. Never auto-Start a new code. The share action uses `Share.share` (no clipboard module in this Dev Client) and is labeled Share code / Compartir código.
