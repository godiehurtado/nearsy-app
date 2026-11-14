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

## 2. Person properties (done in iOS)

| Property | Source | Clear |
|---|---|---|
| `first_name` | top-level `realName` | `$unset` when removed |
| `last_name` | top-level `lastName` | `$unset` when removed |
| `industry` | top-level `professionalIndustryId` (catalog id, pattern `^[a-z][a-z0-9_]{1,40}$`) | `$unset` when the selection is cleared, absent or malformed |

- Never split from a display name.
- Person-only: never in logs, super-properties or events. Names are capped at 80 characters.
- Synced on login, every app open, profile saves (`realName`, `lastName`, `professionalIndustryId`) and mode changes.
- **Industry and mode (Product decision):**
  - Firestore keeps the professional Industry when switching to Personal.
  - The PostHog `industry` attribute also stays while the personal mode is active; `profile_type` segments it.
  - Only an explicit clear removes it.
- Nothing writes `professionalIndustryId` yet. The attribute starts flowing once the selector ships.

## 3. Industry in the professional profile

**Approved by Product:**
- A field of the professional profile only. Single selection, optional.
- A broad catalog with stable ids. Functions proposes it and closes the contract; iOS builds no provisional catalog.
- Matching only when both people are in the professional mode.
- An independent preference `notifyNearbyIndustry`; its initial value must be explicit in the contract.
- Kept in the profile, and as the PostHog attribute, when switching to Personal (see 2).
- **Selector:** a modal with search, a list with local icons, a check mark and a "Sin especificar / Not specified" option (writes `null`). Search covers EN/ES labels and synonyms. No free text, no Logo.dev.

**Agreed with Functions (storage and validation):**
- Storage: top-level `professionalIndustryId: string | null`. It is outside the affiliation category `industry` and outside the per-mode dotted-key defect.
- Rules: id pattern or `null`; `notifyNearbyIndustry` with its own `is bool` rule.
- The server ignores unknown ids.
- The client calls `reevaluateProximityNotices` after saving.

**Contract closed (Owner-approved, Functions `5c1e115`; catalog frozen at `b574639` by the Owner on 2026-11-12 (decision record `d6cb364`), `docs/industries/INDUSTRY_CONTRACT.md`):**
- **Catalog v1:** NAICS 2022 / SCIAN 2023, 20 groups, 108 industries.
  - Each item: id, EN/ES `label` (≤ 40) and `shortLabel` (≤ 32), synonyms, and an icon key with Material and Ionicons names.
  - Apps bundle the JSON pinned by version.
  - Retired ids still display and match, but are hidden in the picker.
- **Preference:** `notifyNearbyIndustry` absent = `true`, never written at sign-up. When it is off, Industry is not eligible and the next eligible motive applies; with nothing left, no push.
- **Discovery:** objects are exactly `{ id, name }`, with `name` = the full English label (fallback only).
  - `profile.industry` has no switch.
  - `sharedIndustry` stays behind `PROXIMITY_INDUSTRY_ALERTS` (off).
- **Copy:**
  - EN "{{name}} is nearby. You both work in {{industry}}."
  - ES "{{name}} está cerca y comparten industria: {{industry}}."
  - `{{industry}}` = `shortLabel`.
- **Icons:** where Ionicons has no fitting glyph, the sector icon is used (no misleading icons).

**Implemented in iOS (on the frozen v1 catalog):**
- **Catalog:** `packages/shared/src/industries/industry-catalog.v1.json`, a verbatim copy of `b574639` pinned by the hash of its parsed content. `b574639` adds the search synonyms from the iOS review and rewords two labels; ids, groups and codes are unchanged.
- **Catalog module:** lookup, labels by language, Ionicons with the generic icon as the fallback, picker sections, and search ranked exactly as the contract.
- **Picker:** `IndustrySearchField`: a modal with search, sector headers, local icons, a check mark and "Sin especificar" (`null`).
- **Field (professional only):**
  - CRJ details step;
  - Edit profile (draft, dirty state, save patch);
  - written only when changed, then `reevaluateProximityNotices`.
- **Display:** Discovery profile, professional face only.
- **More:** `notifyNearbyIndustry` toggle (absent = on), written only from the toggle, then reevaluation.
- **Parsing:** `profile.industry` (summary and detail) and `sharedIndustry`, accepted only for professional profiles; malformed values are ignored, never an error.
- **Inbox:** Industry row with priority over affiliation and interests, using the short label from the bundle.
- **Push and analytics:** motive `industry`; `alert_opened.alert_motive` accepts `industry`.
- **PostHog:** `industry` person property (see 2).

**Not in scope:** match score and search filters.

## 4. Alerts and push for Industry (contract closed; implemented in iOS, server switch off)

- **Motive:** `industry`. It has priority over contact, affiliation and interest, with no combined values. `fromContacts` keeps its value.
- **Limits:** one push per receiver and encounter, one row per person.
- **Payload keys unchanged:** `kind=contact_nearby`, `actorUid`, `actorName`, `fromContacts`, `motive`, `alertId`, with a server-built title and body. Public 2.0.9 and 2.0.10 only read `actorUid` and fall back on unknown motives, so the push is safe for them.
- **Discovery (additive, optional):**
  - `profile.industryId` on the professional face;
  - `sharedIndustry: { id, name }` only when both are professional.
- **Copy:**
  - Push EN: "{{name}} is nearby. You both work in {{industry}}."
  - Push and inbox ES (Owner-approved, option B): "{{name}} está cerca y comparten industria: {{industry}}." `{{industry}}` is the `shortLabel` (≤ 32 characters). Live pushes are EN only today.
  - Inbox EN: "{{name}} is nearby and you both work in {{industry}}."
- **Activation:** `PROXIMITY_INDUSTRY_ALERTS` is off by default. Turn it on only after iOS and Android 2.1.0 are public.
- **Analytics:** `industry` is added to `alert_motive` (client) and `alert_sent` (server).

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

## Status (joint list, iOS and Functions)

### Resolved decisions

| Decision | Resolution |
|---|---|
| Industry scope | Professional profile only, single, optional, broad catalog with stable ids (Functions closes it), matching only professional ↔ professional, priority over the other motives, one push per receiver and encounter. |
| Industry preference | Independent `notifyNearbyIndustry`. Its initial value goes into the contract. |
| Industry and mode | Kept in Firestore and as the PostHog `industry` attribute when switching to Personal (`profile_type` segments it). An explicit clear removes the attribute. |
| Industry selector | Modal with search, local icons, check mark, "Sin especificar". EN/ES labels and synonyms. No free text, no Logo.dev. |
| PostHog production | Capture for normal users in the `production` profile (done in iOS). Server events and `alertId` for all users are part of the scope. |
| Test users | The existing Beta list only (client Beta channel; server-only `POSTHOG_BETA_UIDS`). The admin custom claim is not approved. |
| Per-mode profile saves | Separate defect, out of 2.1.0. No fix or migration without a later decision based on its impact. |

### Technical dependencies (do not block the independent work)

| | Who | Item |
|---|---|---|
| T1 | Functions | Server capture for every user, `alertId` for every user, `is_test_user` only from the Beta list (never `false`). Authorized by the Owner in the Functions session, **implemented** at `42d8c95` (`feature/posthog-server`, `POSTHOG_CAPTURE_MODE=all`). **Not deployed, not active.** PostHog failures never change an alert; no client change needed (`alertId` stays optional). Activation follows P4. |
| T2 | Functions → Owner | **Closed:** Industry contract approved by the Owner and implemented in Functions at `5c1e115` (not deployed, not active). Catalog v1 **frozen** at `b574639` (Owner, 2026-11-12; decision record `d6cb364`). Both consolidations kept: software = software + cloud + data centers; oil_gas = extraction + refining + pipelines. v1 files are not edited again; the iOS hash test pins the copy. |
| T3 | iOS | **Implemented** (see 3 and 4): picker, CRJ and Edit field, Discovery display, More toggle, parsing, inbox priority, push motive, analytics. Re-copy the JSON if v1 wording changes before the freeze. |
| T4 | Android | The same contracts on its own branch, when its Owner opens 2.1.0. |
| T5 | Functions | Keep `PROXIMITY_INDUSTRY_ALERTS` off until both 2.1.0 apps are public. |
| T6 | iOS | **Implemented:** proposal G, `distinct_id` per LinkedIn account generation (contract approved, Functions `37af793`; milestone 1 of `POSTHOG_210_PLAN.md`). Inactive: the cutover `EXPO_PUBLIC_POSTHOG_GENERATION_ID_SINCE_MS` is in no `eas.json` profile. The QA profile with a QA cutover is milestone 2. Details in [ios-posthog-analytics.md](ios-posthog-analytics.md). |

### Pending before publication or before opening capture

| | Who | Item |
|---|---|---|
| P1 | Owner | App Privacy labels and the privacy policy for product analytics, including name and Industry. |
| P2 | Owner | **Present** (checked 2026-11-12, name and visibility only): `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN`, project scope, Sensitive, EAS environment `production` (used by production, beta and diagnostics). The Owner confirms in the EAS dashboard that it is the token of PostHog project 716015. |
| P3 | Owner/Legal | The PostHog deletion block when a LinkedIn account is recreated with the same UID. Every other deleted account is already covered (active since 2026-11-07). Direction approved: proposal G (T6); it takes effect only after QA, a common cutover and `POSTHOG_DELETION_GENERATION_IDS=on` in Functions. Product (2026-11-13): `user_id` stays the UID as a person property only (two generations can share it with different `distinct_id`s); `match_id` is withdrawn from new `match_made` events, with no change to past events. |
| P4 | Owner | Activation order: server capture (T1) only after the 2.1.0 apps capture in public and P1 is settled. |
| P5 | Owner | PostHog event volume and cost with capture for everyone. |
| P6 | Owner | Authorize the 2.1.0 candidate build, numbering and submission. |

P1–P3 do not block the independent work, but must be resolved before capture is opened.

**Per-mode profile defect, now in 2.1.0 (QA 81 blocker):** see [defect-profile-mode-dotted-keys.md](defect-profile-mode-dotted-keys.md), section Fix (2.1.0).

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
6. **Industry:**
   - In professional mode, open the picker and search in EN and ES (for example "dentista", "software"); select an industry, save, reopen it, then choose "Sin especificar".
   - Switch to Personal and back: the industry stays.
   - Another professional profile shows its industry in Discovery.
   - The More toggle persists.
   - Inbox and push need Functions deployed with `PROXIMITY_INDUSTRY_ALERTS` on in a test environment.
