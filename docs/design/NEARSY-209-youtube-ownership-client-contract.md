# NEARSY-209 — YouTube ownership client contract



Definitive per-mode client contract for YouTube verified ownership (Own Profile).

Do not invent payloads beyond this document.



## Auth and transport



- All callables: Firebase Auth ID token + App Check (same family as LinkedIn A3).

- Mobile return deep link: `nearsy://youtube-ownership`.

- **Removed:** `youtubeOwnershipSetPublication` — clients must not call it.



Personal and Professional YouTube links are independent (mode-scoped). The social card reflects the profile mode being edited only.



## Browser sequence



1. Auth + App Check → generate `clientProofVerifier` + `clientProofChallenge = S256(verifier)`.

2. `youtubeOwnershipStart` with `{ mode, platform, clientProofChallenge, clientProofMethod: "S256" }` → open `authorizationUrl` in the system browser.

3. Google → HTTPS `youtubeOwnershipCallback?code&state` → 302  

   `nearsy://youtube-ownership?transactionId=…&mode=personal|professional&result=ok|error&error?`

4. `youtubeOwnershipExchange` with `{ transactionId, clientProofVerifier }` only (no `mode`).

5. If `select_channel` → picker from `channels[]` only → `youtubeOwnershipSelectChannel` with `{ transactionId, channelId }` (no `mode`).

6. `youtubeOwnershipGet` / `youtubeOwnershipUnlink` with `{ mode }` for the editor mode in focus.



## Payloads / responses



### Start



**Request**



```json

{

  "mode": "personal",

  "platform": "ios",

  "clientProofChallenge": "<base64url 43-128, S256(verifier), no padding>",

  "clientProofMethod": "S256"

}

```



- `mode`: `"personal"` | `"professional"` — profile mode being connected.

- `platform`: client OS `"ios"` | `"android"` (not `"youtube"`).

- **Forbidden** in Start request: `url`, `channelUrl`, `redirectUri`, `returnUrl`.



**Response**



```json

{

  "transactionId": "…",

  "mode": "personal",

  "authorizationUrl": "https://…",

  "expiresAt": 1730000000000

}

```



- `expiresAt`: epoch milliseconds (**number**); client also accepts ISO-8601 strings.



### Callback deep link



`nearsy://youtube-ownership?transactionId=…&mode=personal|professional&result=ok|error&error?`



- `mode` is an informative echo of Start; client validates it matches Start `mode`.

- Callback `error`: `TX_INVALID` | `TX_EXPIRED` | `TX_FAILED`.

- Do not send `mode` on Exchange or SelectChannel.



### Exchange



**Request:** `{ "transactionId", "clientProofVerifier" }` — if body includes `mode` → `invalid-argument`.



**Response verified**



```json

{

  "result": "verified",

  "platform": "youtube",

  "mode": "personal",

  "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx",

  "canonicalUrl": "https://www.youtube.com/channel/UC…",

  "customUrlCache": null,

  "verifiedAt": "…"

}

```



**Response select_channel**



```json

{

  "result": "select_channel",

  "platform": "youtube",

  "mode": "personal",

  "transactionId": "…",

  "channels": [

    {

      "channelId": "UC…",

      "title": "…",

      "customUrlCache": null,

      "canonicalUrl": "https://…"

    }

  ]

}

```



No `publishPersonal` / `publishProfessional` on any response.



### SelectChannel



**Request:** `{ "transactionId", "channelId" }` — no `mode`.



**Response:** same as Exchange **verified**.



### Get



**Request:** `{ "mode": "personal" | "professional" }`



**Response verified:** same as Exchange verified.



**Response not_linked**



```json

{

  "result": "not_linked",

  "platform": "youtube",

  "mode": "personal",

  "linked": false

}

```



### Unlink



**Request:** `{ "mode" }`



**Response**



```json

{

  "result": "unlinked",

  "platform": "youtube",

  "mode": "personal",

  "unlinked": true

}

```



## Errors



| Token / code | Meaning |

|--------------|---------|

| `(youtube-not-enabled)` | Core off |

| `(youtube-no-channel)` | 0 channels |

| `(youtube-channel-claimed)` | Another UID |

| `(youtube-channel-not-in-candidates)` | Invalid select |

| `(youtube-not-linked)` | Unlink/get with no claim for mode |

| `TX_EXPIRED` / `TX_INVALID` / `TX_FAILED` / `CLIENT_PROOF_INVALID` / `unauthenticated` | Session / tx / proof |

| Callback query errors | `TX_INVALID` \| `TX_EXPIRED` \| `TX_FAILED` |

| `mode must be personal` / `mode cannot be changed after Start` | `invalid-argument` |



## Product rules (pilot)



- Verification is **out of CRJ**; Own Profile only.

- Connect does not change Firebase session or link sign-in methods.

- UI: Connect / Disconnect; Connecting… / Disconnecting…; block repeat actions while busy; restore prior state on error with retry; never show success before backend confirmation.

- Mode switch: load that mode’s link via Get; discard late responses from previous mode/uid (`requestGen`).

- Successful OAuth ≠ verified link until Exchange/Select returns `verified`.

- Manual YouTube URL is not a verified path.

- Legacy `socialLinks*.youtube` may be retained client-side without deletion.

- Do not log codes, verifier, or authorization URLs.



## Identity exports (when deployed)



`youtubeOwnershipStart`, `youtubeOwnershipExchange`, `youtubeOwnershipSelectChannel`, `youtubeOwnershipGet`, `youtubeOwnershipUnlink` (callable v2); `youtubeOwnershipCallback` (HTTPS onRequest v2); `cleanupYoutubeOwnershipOnAuthUserDeleted` (Auth onDelete).



**Not exported to clients:** `youtubeOwnershipSetPublication`.

