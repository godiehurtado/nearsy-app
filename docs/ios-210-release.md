# Nearsy iOS 2.1.0

Consolidated release. The fixes once called "2.0.11" ship here; there is no intermediate release.

- **Branch:** `feature/ios-210`, from `feature/ios-2011-crj-photo-picker` @ `56ca048`. It contains 2.0.10 (80) (`3f248cc`).
- **Not merged:** `develop-android`. Android implements its own side on its own branch.
- **Public 2.0.10:** unchanged.
- **Status:** nothing built, submitted, merged or deployed.

## Included

| Commit | Scope |
|---|---|
| `d10ad6a` | CRJ profile photo: library and camera without silent exits, permission and error messages. |
| `56ca048` | Optional update notice reads the installed version from expo-application; 2.0.9 and 2.0.10 could never show it. |
| `2a2cadf` | Production PostHog, `first_name` / `last_name`, More › iPhone notifications, Spanish "comparten". |

Everything validated in 2.0.10 (80) is kept: Contacts at 5000, affiliations, affiliation names in Alerts, app version in About, the logo button.

## 1. PostHog in production

**Client configuration (done):**
- `eas.json` `production`: `EXPO_PUBLIC_POSTHOG_ENABLED=true`, `EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL=production`.
- `beta`: keeps channel `beta`.
- `testflight-contacts-diagnostics`: extends `production`, so it sets both keys to `""` (capture off).

**Required before building (Owner):**
- The EAS sensitive variable `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` must exist in the EAS `production` environment. Without it the EAS build fails on purpose. It is never in Git.

**Test users vs normal users:**
- `is_test_user` is per build. Only the Beta channel sends `true`, and it is `trueOnly`.
- Production builds never mark anyone, so a former Beta tester's person keeps `true`.
- A per-user source is proposed (see Pending).

**Unchanged:**
- Events, properties, identity (identify on login, reset on account change), queue isolation, the deletion hold/discard, `before_send` allowlist.
- Off: session replay, autocapture, feature flags, GeoIP.
- Analytics failures never block, because every call is fire-and-forget behind try/catch.

**Account deletion (Functions):**
- It is not limited to Beta. Every Auth deletion schedules PostHog person and events deletion (`POSTHOG_PERSON_DELETION_ENABLED=true` in nearsy-pj since 2026-11-07).
- Open: if an account with the same UID exists again (LinkedIn, deterministic UID), nothing is deleted and the case stays open. Legal/Owner must accept or resolve this before opening capture to everyone.

**Server events and correlation (in scope; Functions implementation pending the Owner's direct go-ahead in that session):**
- **Today:** `alert_sent` and `event_cohort_joined` are captured only for `POSTHOG_BETA_UIDS`, and `data.alertId` goes only to Beta UIDs.
- **Agreed design:**
  - `POSTHOG_CAPTURE_MODE=all` captures for every user, with `distinct_id` = Firebase uid, and sends `alertId` to every receiver (`POSTHOG_ALERT_ID_SCOPE` becomes redundant).
  - `is_test_user` is `true` only for uids in the server-only Beta list, otherwise omitted (never `false`). On the person it stays `$set_once`.
- **Unchanged:** deletion (person and events by `distinct_id`) and per-account isolation.
- **Client:** no change needed. `alert_opened` already reads `alertId` from the push; inbox taps carry none.
- **Effort and activation:** about half a day of Functions code, tests and docs. Activation is env-only plus an Owner deploy of the proximity and event-cohort functions.
- **Until then:** `alert_opened` from normal users carries no `alert_id`.
- **The admin test-user mark** (Auth claim `nearsyTestUser`) is an extra proposal, not an approved contract.

**App Store:**
- App Privacy labels and the privacy policy must cover product analytics, now including name (Contact Info › Name, linked to the user, Analytics purpose).

## 2. Person properties

**Agreed (iOS, Android, Functions):**

| Property | Source | Clear |
|---|---|---|
| `first_name` | top-level `realName` (account copy of the active face) | `$unset` |
| `last_name` | top-level `lastName` | `$unset` |
| `industry` | stable catalog id (see 3); not implemented yet | `$unset` |

- Never split from a display name.
- Person-only: never in logs, super-properties or events.
- Capped at 80 characters.
- Implemented in iOS for the two names; synced on login, every app open, name saves and mode changes.

**Two separate questions:**
- **Firestore data:** switching to personal must not erase the professional Industry. The storage proposal guarantees it, since personal saves never touch `professionalIndustryId`.
- **PostHog attribute:** what the `industry` person property shows while the personal mode is active is a separate, open Product decision. Android proposes unsetting it, like `occupation`; iOS proposes keeping the professional value. Nothing is implemented until Product decides.

## 3. Industry in the professional profile: proposal for Product

Nothing exists today. "industry" is only an affiliation category (`types/profile.ts:49`, Functions `catalog.ts:60`), so the new field must not reuse that id.

| Decision | Proposal | Why |
|---|---|---|
| Storage | top-level `professionalIndustryId: string \| null` on `users/{uid}` | Same convention as `professionalAffiliations`; no collision with the affiliation category. Personal saves never touch it. |
| Catalog | about 20 stable ids, owned by Functions with EN/ES names, mirrored in the apps (e.g. `technology`, `finance`, `healthcare`, `education`, `government`, `legal`, `real_estate_construction`, `manufacturing`, `energy`, `retail_ecommerce`, `hospitality_food`, `media_entertainment`, `marketing_advertising`, `consulting`, `transport_logistics`, `agriculture`, `nonprofit`, `arts_design`, `science_research`, `telecommunications`) | Push text can only name a server-known industry. |
| Selection | single | Clear text ("both work in X") and a single motive. |
| Required | optional in the CRJ and Edit | Older professional profiles stay valid; no new sign-up friction. |
| Alerts preference | new toggle `notifyNearbyIndustry`, default on when absent | The user can turn it off without losing interests or affiliations. Alternative: reuse `notifyNearbyInterests`. |
| Display | professional face: own profile and DiscoveryProfile, under occupation/company | Professional profile only. |

**Discovery (Functions, additive and optional):**
- `profile.industryId` on the professional face, for display.
- `sharedIndustry: { id, name }` only when both professional faces hold the same id.

**Validation:**
- Firestore rules check the id pattern; the server checks the catalog.
- The client calls `reevaluateProximityNotices` after saving Industry.

**Not in scope:** match score and search filters.

## 4. Alerts and push for Industry: draft contract

- **Motive:** `industry`. It has priority over contact, affiliation and interest; there are no combined values. `fromContacts` keeps its value.
- **Limits:** one push per receiver and encounter, one row per person.
- **Payload keys unchanged:** `kind=contact_nearby`, `actorUid`, `actorName`, `fromContacts`, `motive`, `alertId`, with a server-built title and body. Public 2.0.9 and 2.0.10 only read `actorUid` and fall back on unknown motives, so the push is safe for them.
- **Copy:**
  - Server push EN: "{{name}} is nearby. You both work in {{industry}}."
  - Proposed ES: "{{name}} está cerca y comparten la industria {{industry}}."
  - Inbox EN: "{{name}} is nearby and you both work in {{industry}}."
  - Inbox ES: "{{name}} está cerca y comparten la industria {{industry}}."
- **Activation:** Functions switch `PROXIMITY_INDUSTRY_ALERTS`, off by default. Turn it on only after iOS and Android 2.1.0 are public and confirm the new motive in the inbox.
- **Analytics:** add `industry` to `alert_motive` (client) and to `alert_sent` (server).
- **iOS implementation:** after Product approves the decisions in 3. The parser already ignores unknown keys and motives.

## 5. More › iPhone notifications (done)

- **Placement:** first row of Privacy & discovery, iOS only.
- **Behavior by state:**

| State | Shown as | Tap |
|---|---|---|
| Not requested | Sin solicitar / Not requested | Requests the permission once |
| Off | Desactivadas / Off | Opens Settings |
| Quiet delivery | Entrega silenciosa / Delivered quietly | Opens Settings for alerts |
| Allowed | Permitidas / Allowed | Opens Settings |
| Unavailable | No disponible / Unavailable | Nothing |

- **Never requests on its own:** mount and foreground only read the permission.
- **Back from Settings:** re-reads the permission and registers the push token when delivery became possible.
- **Separate concepts:** the notice-type toggles and visibility are untouched.

## 6. Spanish

- "comparten" replaces "compartís" (interests).
- Affiliation inbox texts use the same register: "comparten afiliaciones", "comparten una afiliación".
- Android changes its 4 lines the same way.
- Server push ES table: not used live (pushes are EN); Functions aligns it if Product wants.

## Pending decisions and dependencies (joint list, iOS and Functions)

| | Owner of the decision | Item |
|---|---|---|
| A | Product | Industry: catalog, single or multiple, required, which preference controls alerts, and whether `sharedIndustry` requires both people in the professional face. |
| B | Product | What the PostHog `industry` property shows while the personal mode is active (keep the professional value or unset it). Firestore always keeps the professional value. |
| C | Owner/Legal | The PostHog deletion block when a LinkedIn account is recreated with the same UID. Every other deleted account is already covered (active since 2026-11-07). |
| D | Owner | App Privacy labels and the privacy policy for product analytics, including name. |
| E | Owner | The EAS sensitive variable `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` in the `production` environment; the build fails without it. |
| F | Owner → Functions | Server capture for every user, `alertId` for every user, `is_test_user` from the Beta list only. Agreed design; code starts when the Owner confirms in the Functions session (about half a day). |
| G | Owner | Proposal, not approved: an admin test-user mark (claim `nearsyTestUser`). |
| H | Owner | Separate defect: per-mode profile fields saved as literal dotted names. Needs authorization to read test documents before any decision. |
| I | Functions, iOS, Android | After A: the Industry contract, catalog, rules (id pattern, `notifyNearbyIndustry` bool), Discovery projection, and `PROXIMITY_INDUSTRY_ALERTS` off until both 2.1.0 apps are public. |
| J | Owner | Activation order: server capture only after the production apps capture (2.1.0 public) and after D. |
| K | Owner | PostHog event volume and cost in the project with capture for everyone (`alert_sent` is one event per accepted push). |

- **Separate defect, not in 2.1.0:** per-mode profile fields are saved as literal dotted names. See [defect-profile-mode-dotted-keys.md](defect-profile-mode-dotted-keys.md). No code change, migration or document repair until the Owner authorizes checking real data.
- **Functions review of the Industry proposal:** compatible.
  - Rules: id pattern `^[a-z][a-z0-9_]{1,40}$` or null.
  - A new `notifyNearbyIndustry` needs its own `is bool` rule.
  - `sharedIndustry` only when both people are in the professional face.
  - Live pushes are EN only.

## Physical validation (when a candidate is authorized)

1. **More › iPhone notifications:**
   - fresh install with the CRJ notifications step skipped shows "Sin solicitar"; one tap shows the iOS prompt;
   - turned off in Settings shows "Desactivadas"; the tap opens Settings; back in the app the row updates and Alerts receive pushes again.
2. **PostHog (production build with the token):**
   - a normal account sends `app_opened` without `is_test_user`;
   - the person shows `first_name`/`last_name`; editing or clearing the last name updates or removes it;
   - logout and login with another account shows no events mixed between them.
3. **Spanish:** the Alerts inbox reads "comparten intereses" / "comparten afiliaciones".
4. **CRJ photo:**
   - library opens with Photos set to None;
   - camera denied shows Cancel / Open Settings.
5. **Update notice:** from an older 2.1.0 build with the server pointing to a newer version, the notice appears.
