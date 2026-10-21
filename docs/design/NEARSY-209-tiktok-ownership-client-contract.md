# NEARSY-209 — TikTok ownership client contract

Definitive per-mode client contract for TikTok verified ownership (Own Profile).

Do not invent payloads beyond this document.

## Auth and transport

- All callables: Firebase Auth ID token + App Check (same family as YouTube ownership).
- Mobile return deep link: `nearsy://tiktok-ownership`.
- **No SelectChannel.** Login Kit Web does not use provider PKCE; client proof is S256 only (client→backend).

Personal and Professional TikTok links are independent (mode-scoped).

## Browser sequence

1. Auth + App Check → generate `clientProofVerifier` + `clientProofChallenge = S256(verifier)`.
2. `tiktokOwnershipStart` with `{ mode, platform, clientProofChallenge, clientProofMethod: "S256" }` → open `authorizationUrl` in the system browser.
3. TikTok → HTTPS `tiktokOwnershipCallback?code&state` → 302  
   `nearsy://tiktok-ownership?transactionId=…&mode=personal|professional&result=ok`  
   or error without guaranteed `mode` / `transactionId`.
4. `tiktokOwnershipExchange` with `{ transactionId, clientProofVerifier }` only (no `mode`).
5. `tiktokOwnershipGet` / `tiktokOwnershipUnlink` with `{ mode }` for the editor mode in focus.

## Callables

`tiktokOwnershipStart`, `tiktokOwnershipExchange`, `tiktokOwnershipGet`, `tiktokOwnershipUnlink`.

Platform on Start: `"ios"` | `"android"`. Platform on verified responses: `"tiktok"`.

Verified fields: `openId`, `canonicalUrl` (`https://www.tiktok.com/@username`), `usernameCache`, `verifiedAt`.

## Product rules (pilot)

- Own Profile only; out of CRJ.
- Same account may be linked in both modes independently.
- Manual TikTok URL is not a verified path; legacy bag URLs are preserved privately and never counted as verified.
- Do not log verifier, state, tokens, or authorization URLs.
