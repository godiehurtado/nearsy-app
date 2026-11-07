# Nearsy iOS: PostHog analytics

Project Nearsy, ID 716015, US Cloud, host `https://us.i.posthog.com`. Plan version `2026-11-06.1`.

**Remote delivery is off, in production too.** Nothing in this repository turns it on. No event has been received in PostHog and no physical test has been run for this work.

## Activation

Set these at bundle time. Do not commit a token: use `apps/nearsy-ios/.env.local` locally and EAS environment variables for builds.

| Variable | Value | Effect |
|---|---|---|
| `EXPO_PUBLIC_POSTHOG_ENABLED` | `true` | Required. Any other value keeps analytics off |
| `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` | `phc_...` | Required. Missing or malformed keeps analytics off without failing |
| `EXPO_PUBLIC_POSTHOG_ALLOW_DEVELOPMENT` | `true` | Also required in a dev bundle or on `nearsy-dev` |
| `EXPO_PUBLIC_ATTRIBUTION_LINK_HOSTS` | `go.example.com` | Optional. Hosts accepted as campaign links |
| `NEARSY_ATTRIBUTION_ASSOCIATED_DOMAINS` | `go.example.com` | Optional, build time. Adds the `applinks:` entitlement |

No Personal API Key is needed.

### While off

`startAnalyticsRuntime` returns before doing anything: no SDK module loaded, no AppState listener, no local storage, no queue, no network. Every `track*` call returns immediately. Events are not saved to send later.

### While on

- Starts at the first real `active` state, so a location-task launch never initializes it.
- Off by configuration: autocapture and `PostHogProvider` (not used), lifecycle capture, session replay, remote config, feature flags, surveys, push capture, error autocapture and GeoIP.
- `before_send` lets out only contract events plus `$identify` and `$set`.
- `$device_name` is cleared. The SDK still adds technical `$os_*`, `$locale` and `$timezone`.
- Disabling GeoIP tells PostHog not to enrich location. To also discard the IP, use the project setting in PostHog.

### Development isolation

There is one PostHog project. `nearsy-dev` has its own UIDs and every event carries `environment`, but this does not isolate everything: person properties are not stored on events, and an event filter does not separate persons or identities. Keep activation in development to controlled tests, and delete test persons afterwards if they should not count.

## Code

| Path | Role |
|---|---|
| `packages/shared/src/analytics/contract.ts` | Allowlist of events and properties |
| `analytics/client.ts` | Ordering, identity, error isolation |
| `analytics/index.ts` | API used by screens |
| `analytics/runtime.ts` | App wiring. Only `App.tsx` imports it |
| `analytics/postHogTransport.ios.ts` | The only file using the SDK. The `.ts` variant is a no-op |
| `analytics/fakeTransport.ts` | Fake client for tests |
| `analytics/profileProperties.ts` | Person properties from `users/{uid}` |
| `analytics/attribution.ts` | Campaign link parser and temporary store |
| `alerts/pushOpenCoordinator.ts` | Push taps, warm and cold |
| `authentication/linkedinA3/accountCreationSignal.ts` | LinkedIn seam |

Tests: `pnpm run test:analytics`.

## Events

Every event also carries `platform` (`iOS`), `app_version`, `app_build`, `environment` and `tracking_plan_version`. Version and build come from the running binary.

| Event | Properties | Fires when |
|---|---|---|
| `app_opened` | `open_type` (`cold_start`, `return_from_background`), `is_first_open`?, `session_id`? | Real arrival to foreground. Waits for the Auth session |
| `signup_completed` | `signup_method`, `signup_source`?, `signup_campaign`?, `signup_content`?, `signup_tool`?, `attribution_method`? | Confirmed account creation |
| `acquisition_attributed` | same acquisition fields | A link arrives after signup, within 24 h, with no acquisition recorded |
| `campaign_access` | `campaign_source`?, `campaign_name`?, `campaign_content`?, `campaign_tool`?, `attribution_method` | Campaign link from an existing user |
| `onboarding_step_completed` | `step`, `step_number`, `skipped`, `item_count`?, `catalog_count`?, `custom_count`?, `manual_count`?, `verified_count`? | Successful save of the milestone |
| `profile_completed` | `completion_time_min`?, `account_created_at`? | Successful `profileSetupCompleted: true` write |
| `foreground_location` | `granted` | See permissions |
| `background_location` | `granted` | See permissions |
| `visibility_changed` | `enabled` | Successful activate or deactivate call |
| `discovery_opened` | `load_time_sec`, `people_shown` | First successful load of an entry |
| `profile_viewed` | `match_score`?, `match_score_range`? | Successful profile load, once per screen |
| `match_made` | `match_id`, `match_score`, `match_score_range` | Result with a score shown on screen |
| `social_linked` | `social_platform`, `link_type` (`manual`, `verified`) | A connection was added |
| `match_social_tapped` | `social_platform`, `open_result` (`opened`, `invalid`, `failed`, `unknown`), `match_score`?, `match_score_range`? | Tap on a network in a Discovery profile |
| `alert_opened` | `source` (`push`, `inbox`), `alert_id`?, `alert_motive`? | Tap on a push or an inbox row |

`?` means omitted when unknown, never sent as empty, zero or `unknown`.

`signup_method`, `open_type`, `link_type`, `open_result`, `alert_motive`, `acquisition_attributed`, `campaign_access` and `visibility_changed` are additions to the Tracking Plan document. `social_platform` replaces the plan's `platform` on social events.

**Not sent:** `gender`, `seniority`, `industry`, monetization events. `alert_sent` (accepted by Expo, not delivered) and `event_cohort` (server, by presence at venue and time window) belong to Functions.

## Person properties

| Property | Source and rule |
|---|---|
| `user_id` | Firebase UID, also the `distinct_id` |
| `email` | Firebase Auth when present. May be an Apple relay address |
| `account_created_at` | `$set_once` from Firebase creation time. Separates accounts older than the launch |
| `platform`, `app_version`, `app_build`, `environment`, `tracking_plan_version` | As in events |
| `profile_type` | `users.mode` |
| `occupation`, `occupation_truncated` | Active mode, up to 120 characters |
| `country_birth` | `birthCountryCode`. Product confirms country of origin means country of birth for Nearsy |
| `country_live` | `currentCity.countryCode` if the user chose a city. Never GPS or IP |
| `languages` | `languageCodes` |
| `age_range`, `age_range_status` | `18-24` to `65+`. Under 18 sends `below_minimum` and no range; never the date |
| `interests` | Catalog IDs of the active mode |
| `interests_custom` | Original custom text |
| `interests_custom_normalized` | Trimmed, single-spaced, one case. Synonyms stay apart |
| `interests_catalog_count`, `interests_custom_count`, `interests_count` | Real totals, even past the limits |
| `interests_truncated` | True if a list or text went over the limit |
| `affiliations*` | Same shape. Stable values are `provider:<providerId>` and `topic:<category>:<topic>` |
| `socials_manual` | Valid saved links, Website and `custom` included |
| `socials_verified` | Verified connections |
| `socials_connected`, `has_socials` | Union without duplicates. Sent only if verified state is known |
| `foreground_location`, `background_location` | Current permission |
| `signup_*`, `attribution_method` | `$set_once`, only with real values |

- **Mode:** active mode only. Switching mode replaces these values.
- **Limits:** 50 items per list, 80 characters per custom text, 120 per ID. The profile itself is not changed.
- **Empty or unknown:** a bag that exists and is empty sends `[]`. An absent bag or a failed read sends nothing. Old profiles that only have legacy interest labels therefore report no interests.
- **Sync:** at login and restore, on each app open, after profile writes that touch these fields, and after a mode change. Only changes are sent.
- **Affiliations can include faith and values categories.** This is an approved product decision.

## Identity

- `identify` at registration, login and restore, once per account.
- `reset` at logout and before A→B, and at restore if the SDK holds another account.
- Calls run in order. Account events name their UID and are dropped if the session moved on.
- A sign-in can finish before the Auth listener runs, so the client adopts the live session if it owns that UID.
- `signup_completed`: email right after `registerWithEmail`; Google, Apple and Facebook when Firebase reports `isNewUser === true`.

### LinkedIn

Evidence, read-only from `nearsy-identity-functions`: `linkedInFirebaseUid(iss, sub)` derives the UID from the provider subject, so a deleted and recreated account gets the same UID. `resolveOrCreateUser` already knows `created`, but the callback discards it and Exchange does not return it.

- Local dedupe uses **UID + Firebase creation time**, so a recreated account can report its own signup and onboarding. Without a valid creation time, dedupe is memory-only.
- `accountCreationSignal.ts` has `LINKEDIN_ACCOUNT_CREATION_FIELD = null`. Today every LinkedIn sign-in is `unknown` and emits no signup.
- When the field is agreed with Identity, set that one constant. A missing field stays unknown.
- Until then the signup count excludes LinkedIn, while its onboarding events are sent, which inflates `profile_completed / signups`.

## app_opened

- `inactive → active` never counts (system dialogs, Notification Center).
- A launch that stays in background is not an open.
- An OAuth browser or Settings visit that really backgrounds the app counts when it returns.
- `session_id` is the SDK session: 30 minutes of inactivity by default, and it resets on restart and on `reset`.
- `is_first_open` is true only with no marker, no Welcome or appearance preference, and no restored session. It is omitted if storage fails.
- **Coverage limits:** a reinstall is a first open of that install. An install from before the Welcome gate that upgrades while signed out, without ever choosing an appearance, would read as first open.

## Onboarding

| Milestone | Number | Internal steps | Fires after |
|---|---|---|---|
| `profile_type` | 1 | `type` | `persistType` |
| `basics` | 2 | `identity` + `photo` | `persistPhoto` |
| `about` | 3 | `details` | `persistDetails` |
| `affiliations` | 4 | All categories | Saving the last category |
| `interests` | 5 | Intro, categories, celebration | Saving interests |
| `socials` | 6 | `socialMedia` | Saving social links |

- **`identity` holds:** first name, last name and country of origin (required), current city (optional). The photo is required. Registration and date of birth come before and are measured by `signup_completed`.
- **`about` holds:** occupation, bio, languages, and company when professional.
- **`skipped`** is true when the milestone ended with no content. Partial content is false, with counts. It does not read the button.
  - `profile_type`, `basics` and `about` are always false, because their fields are required.
  - `interests` is always false today, because of the minimum of 10.
- **Resuming** never creates earlier milestones. Events fire only on a real transition.
- **Dedupe limits:** the ledger is local. A reinstall or a second device can repeat a milestone if the user completes that step again there. The `crjResumeStage` cursor is not treated as delivery.
- **`completion_time_min`** runs from Firebase creation, pauses included. Omitted when the date is missing, invalid or in the future. Old complete profiles emit nothing.

## Permissions and visibility

| Event | iOS equivalent of `granted: true` |
|---|---|
| `foreground_location` | Foreground status `granted`: While Using, Always, or Allow Once during its session |
| `background_location` | Effective Always (`iosScope === 'always'`) |

- Observed when a request resolves and on each return to `active`.
- Emitted when a request resolves with no earlier decision, or when `granted` changes.
- The first observation of an existing install only stores a baseline, without an event.
- Location publishing never triggers it. No requests were added.
- `visibility_changed` means the activate or deactivate call succeeded, including automatic recovery in foreground. Calls made in a background launch are not reported.

## Discovery

- **`discovery_opened`:** one per entry. Interval, foreground and pull refreshes do not count. Returning from a profile opened from the list is the same entry. An empty result counts; errors do not, and the entry stays open for the next success.
- **`load_time_sec`:** from the start of the successful load, including location publish, to the response.
- **`people_shown`:** results returned by that load.
- **`match_made`:** compatibility with a discovered profile, not a mutual match. Requires 50% of the row visible for 300 ms and a real score. Ranges are [0,50), [50,75), [75,100].
- **Rule pending final validation:** one per viewer, profile and SDK session. A new session can count again.
- **`match_id`:** truncated SHA-256 of the two UIDs. It is stable and pseudonymous, not anonymous. Nothing is written to Firestore, and the other UID is not sent.
- **`match_social_tapped`:** a tap on any Discovery profile. It does not prove a connection between people. If the open has not resolved in 1.5 s, it reports `unknown`.

## Alerts

- The listener and `getLastNotificationResponseAsync` both go through one coordinator, deduped by notification identifier.
- If the app cannot show the profile yet, the destination waits up to 30 s, until `MainTabs` exists. Sign-out clears it.
- `alert_id` is read from the payload if present. Current payloads do not include it, and none is made up.
- `source=inbox` does not imply a push was sent.

## Attribution

Contract: `signup_source` channel, `signup_campaign` campaign, `signup_content` piece, `signup_tool` tool, `attribution_method` method.

Link format: `https://<host>/c/<anything>?utm_medium=<channel>&utm_campaign=<campaign>&utm_content=<piece>&utm_source=<tool>`.

- Only `https`, a configured host and the `/c/` path are accepted, so OAuth returns and other links are ignored.
- Values must be slugs. `organic` and `unknown` are refused.
- Only validated fields are stored, never the URL, for up to 7 days.

**Order of operations:**

1. Link, then signup: the fields go on `signup_completed` and `$set_once`.
2. Signup, then link within 24 h: `acquisition_attributed` and `$set_once`.
3. Existing user or later link: `campaign_access`, without touching acquisition.
4. With no evidence, nothing is written. There is no `unknown` to block a later value, and `organic` is never claimed.

A logged-out link waits 5 s after sign-in so a signup can claim it first.

### Universal Links setup (not published)

1. Choose a dedicated subdomain. `nearsy.app` and `www.nearsy.app` return 404 for AASA today, and `nearsy.app/legal` must not be affected.
2. Serve `https://<host>/.well-known/apple-app-site-association` as JSON, without redirects:
   ```json
   { "applinks": { "details": [ { "appIDs": ["<TEAM_ID>.com.nearsy.app.client"], "components": [ { "/": "/c/*" } ] } ] } }
   ```
3. Set `NEARSY_ATTRIBUTION_ASSOCIATED_DOMAINS=<host>` and `EXPO_PUBLIC_ATTRIBUTION_LINK_HOSTS=<host>`, and build a new binary. The App ID needs the Associated Domains capability.

This covers **installed apps only**. Links rewritten by Mailchimp, opened in in-app browsers or scanned from old QR codes need to be tested.

### New installs: recommendation

The requirement stays open and no provider is chosen. Nothing here promises automatic coverage.

1. **Run one time-boxed proof of concept** of a clipboard-based deferred link, which is a documented option in Branch (`checkPasteboardOnInstall`) and Adjust (LinkMe, iOS 15+, with a system paste prompt). It carries the click through the clipboard rather than matching device traits, which is why it goes first, but each provider's exact behaviour still has to be confirmed.
2. **Measure it on real devices before deciding:** match rate with Mailchimp links, QR and in-app browsers; how often the paste prompt is accepted; what the SDK sends, per its privacy documentation.
3. **Do not add ATT or an IDFA dependency** until the concrete flow is confirmed to need it.
4. **Use App Store campaign links as a cross-check:** they cover new installs with no SDK, but only in aggregate and with no link to a user.

Still needed from each provider: matching method and data sent, ATT by flow, Apple policy position, Mailchimp and QR support, Expo 54 and New Architecture compatibility with the custom AppDelegate plugins, returned fields and latency, price, privacy manifest. A provider would plug in as another `attribution_method`.

## External dependencies

| Item | Owner | Effect while pending |
|---|---|---|
| Project token | Product | Analytics stays off |
| Account creation signal | Identity | No LinkedIn `signup_completed` |
| `alert_sent`, `alertId` in payload | Functions | No sent counts; `alert_id` omitted |
| `event_cohort` | Functions | Not assigned |
| Attribution domain and AASA | Infrastructure | No Universal Links |
| Attribution for new installs | Product | Channel and campaign unknown for those installs |
| Deleting the PostHog person on account deletion | Backend | Not implemented: person data stays in PostHog after account deletion |
| App Privacy labels and privacy policy | Product | Must be updated before enabling in a store build |
| Final validation of the `match_made` rule | Product | Implemented as a proposal |

## QA on a physical iPhone (Metro on 8081)

Not run yet.

**A. Off (works on the current Dev Client):**

1. Run `pnpm --filter nearsy-ios start:dev-client` and open the app.
2. Confirm no request to `us.i.posthog.com` and no `[analytics]` logs.
3. Regression pass: register, log in and out, complete onboarding, Discovery, alerts, tapping a push with the app closed.

**B. On (needs a new Dev Client, because `expo-application` is a new native module):**

1. Build and install a Dev Client from this branch.
2. In `apps/nearsy-ios/.env.local` set the three activation variables with the token, then restart Metro with a clean cache.
3. Use PostHog **Activity** to check each case:
   - Open, background, return: one `app_opened` each. A permission dialog adds none.
   - Sign up with email, Google, Apple and Facebook: one `signup_completed`. Log in again: none.
   - Sign up with LinkedIn: none, as documented.
   - Log out and into another account: events belong to the right person.
   - Onboarding: milestones 1 to 6. Going back and forward repeats none. Close midway and resume: no earlier ones appear.
   - Permissions: allow and deny; change in Settings and return.
   - Toggle visibility; open Discovery; wait for an interval refresh: no new `discovery_opened`.
   - Open a profile; tap a network.
   - Tap a push with the app closed: navigates to the profile, one `alert_opened` with `source=push`. Tap an inbox row: `source=inbox`.
   - Force the location task with the app closed: no event, no SDK start.
4. Check person properties after editing interests, removing all selections, and switching mode.

**Rollback:** unset `EXPO_PUBLIC_POSTHOG_ENABLED`. Events already sent stay in PostHog.
