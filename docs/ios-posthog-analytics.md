# Nearsy iOS: PostHog analytics

Project Nearsy, ID 716015, US Cloud, host `https://us.i.posthog.com`. Plan version `2026-11-06.2`.

**Remote delivery is off, in production too.** Nothing in this repository turns it on. No event has been received in PostHog and no physical test has been run for this work.

## Activation

Set these at bundle time. Do not commit a token: use `apps/nearsy-ios/.env.local` locally and EAS for builds.

| Variable | Value | Effect |
|---|---|---|
| `EXPO_PUBLIC_POSTHOG_ENABLED` | `true` | Required. Any other value keeps analytics off |
| `EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL` | `beta` | Required. It is the only accepted channel, so general capture stays off |
| `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` | `phc_...` | Required. Missing or malformed keeps analytics off without failing |
| `EXPO_PUBLIC_NEARSY_FIREBASE_ENV` | `production` | Beta refuses `development`. Empty reads as production, as in `app.config.js` |
| `EXPO_PUBLIC_POSTHOG_ALLOW_DEVELOPMENT` | `true` | Only for a Metro or Dev Client bundle. Its events carry `environment=development` |
| `EXPO_PUBLIC_ATTRIBUTION_LINK_HOSTS` | `go.example.com` | Optional. Hosts accepted as campaign links |
| `NEARSY_ATTRIBUTION_ASSOCIATED_DOMAINS` | `go.example.com` | Optional, build time. Adds the `applinks:` entitlement |

No Personal API Key is needed.

### TestFlight Beta

Beta is TestFlight on **production Firebase** and PostHog project 716015. It replaces any earlier requirement to use Firebase development.

- **UID:** the real Firebase UID, with no prefix.
- **Event values:** `environment=production`, `distribution_channel=beta`, `is_test_user=true`.
- **Declared, not detected:** the app does not try to detect TestFlight. The channel comes only from configuration.

**Configuration to add when activating (not in the repository today):**

1. Add a build profile that only Beta uses, so an App Store build cannot inherit the switches:
   ```json
   "beta": {
     "extends": "production",
     "env": {
       "EXPO_PUBLIC_NEARSY_FIREBASE_ENV": "production",
       "EXPO_PUBLIC_POSTHOG_ENABLED": "true",
       "EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL": "beta"
     }
   }
   ```
2. Create `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` as an EAS environment variable. Without the two switches above it does nothing.
3. Update the source guard in `analyticsCore.test.ts` that forbids `EXPO_PUBLIC_POSTHOG` in `eas.json`. That change should be deliberate.
4. Use a build number above the published binary, 2.0.10 (72).

**Do not promote a Beta binary to the App Store.** The channel is compiled into the bundle, so every store user would be reported as `is_test_user=true`. Build again for the store.

### Beta install versus test account

These are two different facts:

| Level | Property | Means |
|---|---|---|
| Event | `is_test_user=true`, `distribution_channel=beta` | This event came from a Beta install |
| Person | `is_test_user=true` | This account has been used on a Beta install at least once |

The person flag does not mean the account was created for testing. The app has no list of test accounts. A real customer who signs in on a Beta install is marked too.

| Situation | Events | Person |
|---|---|---|
| Beta, before login | Flag on every event, anonymous id | No person is created until login |
| Beta, sign in as A | Flag on every event, distinct id A | A marked |
| Beta, A→B | Each event under its own account, all flagged | A and B both marked. A's mark stays |
| Account marked earlier, later on a non-Beta build | No `is_test_user` on those events | Stays marked |

- **The flag can only be true.** The contract rule rejects `false` from any caller or build, so another build cannot clear it by accident.
- **To remove a person's mark:** edit the person in PostHog by hand.
- **To filter:** use the event property to exclude Beta traffic. Use the person property to exclude every event of accounts that passed through Beta, which also removes a real customer's later activity.

### While off

`startAnalyticsRuntime` returns before doing anything: no SDK module loaded, no AppState listener, no local storage, no queue, no network. Every `track*` call returns immediately. Events are not saved to send later.

### While on

- Starts at the first real `active` state, so a location-task launch never initializes it.
- Off by configuration: autocapture and `PostHogProvider` (not used), lifecycle capture, session replay, feature flags, surveys, push capture, error autocapture and GeoIP.
- `before_send` lets out only contract events plus `$identify` and `$set`.
- `$device_name` is cleared. The SDK still adds technical `$os_*`, `$locale` and `$timezone`.
- Disabling GeoIP tells PostHog not to enrich location. To also discard the IP, use the project setting in PostHog.

### SDK workarounds

Both live in `defineNearsyPostHog` in `postHogTransport.ios.ts`, the only file that uses the SDK. `posthog-react-native` is pinned to exactly 4.85.3, and `@posthog/core` to 1.64.1 through the lockfile.

**Remote config: `reloadRemoteConfigAsync` override.**

- **What it touches:** a public, documented SDK method, overridden in a subclass. It is not a private detail.
- **Why:** the SDK types mark `disableRemoteConfig` as a deprecated no-op, saying remote config is now always loaded. There is no supported option to stop this read.
- **What it returns:** `undefined`, the same result as a failed fetch in the SDK. It does not simulate a successful config.
- **What it does not touch:** event delivery. `/batch` failures still reject `flush`, and every SDK error is logged by name as `sdk_error`.

**Queue: `discardQueuedEventsFor`.**

- **What it touches:** public `getPersistedProperty` and `setPersistedProperty`, but the queue item shape is internal to the SDK.
- **Why:** `reset` keeps the queue by design, and no public call removes items from it.

**Upgrade check:** `postHogRealSdk.test.ts` fails if the versions change, if the SDK starts honoring `disableRemoteConfig`, or if the override or the discard stops working.

## Code

| Path | Role |
|---|---|
| `packages/shared/src/analytics/contract.ts` | Allowlist of events and properties |
| `analytics/config.ts` | Activation rules and Beta mode |
| `analytics/client.ts` | Ordering, identity, deletion, error isolation |
| `analytics/index.ts` | API used by screens |
| `analytics/runtime.ts` | App wiring. Only `App.tsx` imports it |
| `analytics/postHogTransport.ios.ts` | The only file using the SDK. The `.ts` variant is a no-op |
| `analytics/fakeTransport.ts` | Fake client for tests |
| `analytics/profileProperties.ts` | Person properties from `users/{uid}` |
| `analytics/attribution.ts` | Campaign link parser and temporary store |
| `alerts/pushOpenCoordinator.ts` | Push taps, warm and cold |
| `authentication/linkedinA3/accountCreationSignal.ts` | LinkedIn seam |

Tests: `pnpm run test:analytics`.

**`postHogRealSdk.test.ts` runs the real SDK in Node** with `fetch` intercepted and native modules stubbed, so no request leaves the process. It covers identify, person properties, sessions, capture, the queue, retries and the absence of other requests. **It is not native QA:** it says nothing about real AsyncStorage, app lifecycle or networking on a device, or whether the native build compiles.

## Events

Every event also carries `platform` (`iOS`), `app_version`, `app_build`, `environment` and `tracking_plan_version`. In Beta it also carries `distribution_channel` and `is_test_user`. Version and build come from the running binary.

| Event | Properties | Fires when |
|---|---|---|
| `app_opened` | `open_type` (`cold_start`, `return_from_background`), `is_first_open`?, `session_id`? | Real arrival to foreground. Waits for the Auth session |
| `signup_completed` | `signup_method`, `signup_source`?, `signup_campaign`?, `signup_content`?, `signup_tool`?, `attribution_method`? | Confirmed account creation |
| `acquisition_attributed` | `signup_source`?, `signup_campaign`?, `signup_content`?, `signup_tool`?, `attribution_method`? | A link arrives after signup, within 24 h, with no acquisition recorded |
| `campaign_accessed` | `campaign_source`?, `campaign_name`?, `campaign_content`?, `campaign_tool`?, `attribution_method` | Campaign link from an existing user |
| `onboarding_step_completed` | `step`, `step_number`, `skipped`?, `item_count`?, `catalog_count`?, `custom_count`?, `manual_count`?, `verified_count`? | Successful save of the milestone |
| `profile_completed` | `completion_time_min`?, `account_created_at`? | Successful `profileSetupCompleted: true` write |
| `foreground_location` | `granted` (boolean) | See permissions |
| `background_location` | `granted` (boolean) | See permissions |
| `visibility_changed` | `enabled` | Successful activate or deactivate call |
| `discovery_opened` | `load_time_sec`, `people_shown` | First successful load of an entry |
| `profile_viewed` | `match_score`?, `match_score_range`? | Successful profile load, once per screen |
| `match_made` | `match_id`?, `match_score`, `match_score_range` | See Discovery |
| `social_linked` | `social_platform`, `link_type` (`manual`, `verified`) | A connection was added |
| `match_social_tapped` | `social_platform`, `open_result` (`opened`, `invalid`, `failed`, `unknown`), `match_score`?, `match_score_range`? | Tap on a network in a Discovery profile |
| `alert_opened` | `source` (`push`, `inbox`), `alert_id`?, `alert_motive`? (`interest`, `contact`, `both`) | Tap on a push or an inbox row |

`?` means omitted when unknown, never sent as empty, zero or `unknown`.

`signup_method`, `open_type`, `link_type`, `open_result`, `alert_motive`, `acquisition_attributed`, `campaign_accessed` and `visibility_changed` are additions to the Tracking Plan document. `social_platform` replaces the plan's `platform` on social events.

**Not sent:** `gender`, `seniority`, `industry`, monetization events. `alert_sent` (accepted by Expo, not delivered) and `event_cohort` (server, by presence at venue and time window) belong to Functions.

## Person properties

| Property | Source and rule |
|---|---|
| `user_id` | Firebase UID, also the `distinct_id` |
| `email` | Firebase Auth when present. May be an Apple relay address |
| `account_created_at` | `$set_once` from Firebase creation time. Separates accounts older than the launch |
| `platform`, `app_version`, `app_build`, `environment`, `tracking_plan_version` | As in events |
| `distribution_channel` | Last channel seen for this account |
| `is_test_user` | `true` only. See Beta install versus test account |
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
| `affiliations`, `affiliations_custom`, `affiliations_custom_normalized`, `affiliations_catalog_count`, `affiliations_custom_count`, `affiliations_count`, `affiliations_truncated` | Same shape. Stable values are `provider:<providerId>` and `topic:<category>:<topic>` |
| `social_platforms_manual` | Valid saved links, Website and `custom` included |
| `social_platforms_verified` | Verified connections |
| `socials_connected`, `has_socials` | Union without duplicates. Sent only if verified state is known |
| `foreground_location_granted`, `background_location_granted` | Current permission, boolean |
| `signup_source`, `signup_campaign`, `signup_content`, `signup_tool`, `attribution_method` | `$set_once`, only with real values |

- **Limits:** 50 items per list, 80 characters per custom text, 120 per ID. The profile itself is not changed.
- **Sync:** at login and restore, on each app open, after profile writes that touch these fields, and after a mode change. Only changes are sent.
- **Affiliations can include faith and values categories.** This is an approved product decision.

### Modes: known, empty, unknown and stale

Mode-scoped properties are `profile_type`, `occupation*`, `interests*`, `affiliations*`, `social_platforms_*`, `socials_connected` and `has_socials`. Nothing is migrated in Firestore.

| What the read found for the active mode | What is sent | Example |
|---|---|---|
| A value | The value | New mode has interests |
| A bag that exists and is empty (confirmed empty) | `[]` and zero counts | User removed every selection |
| No bag, in a profile that was read (unknown) | `$unset` | Legacy profile with no data for this mode |
| No valid `mode` on the profile | `$unset` of every mode-scoped property | Very old profile |
| The profile read failed | Nothing | Valid data is never erased by an error |

Unknown is unset rather than left alone, because whatever PostHog holds may belong to the other mode.

- **Occupation:** the mode's nested value wins. Otherwise the app's top-level value is used for legacy profiles, except once a switch was seen in this process or when that value equals the other mode's occupation. The switch runs in the backend, so the top level can still hold the previous mode. A legacy account that switched therefore reports no occupation in that process, even if the app still shows the top-level value.
- **Verified lookup that fails:** it keeps values only if this mode already confirmed them in this process. Otherwise `social_platforms_verified`, `socials_connected` and `has_socials` are unset. After a restart, a failed lookup therefore clears them until the next successful one.
- **Limit:** a legacy profile with no nested data whose mode was switched in an earlier process cannot be told apart, so its top-level occupation is still reported.

## Identity

- `identify` at registration, login and restore, once per account.
- `reset` at logout and before A→B, and at restore if the SDK holds another account.
- Calls run in order. Account events name their UID and are dropped if the session moved on.
- A sign-in can finish before the Auth listener runs, so the client adopts the live session if it owns that UID.
- `signup_completed`: email right after `registerWithEmail`; Google, Apple and Facebook when Firebase reports `isNewUser === true`.

### Account deletion

Checked against the real SDK: **`reset` does not empty the queue.** Each queued event already holds its `distinct_id`, so after a normal logout it is still delivered, under the right account.

When the deletion closure is set (the backend confirmed it, Auth reported `user-not-found`, or the person signed out of an unresolved deletion), the client:

1. Removes that UID's queued events. Events of other identities stay.
2. Resets the SDK identity at once, without waiting for Firebase to emit the sign-out.
3. Refuses later events and person updates for that account generation (UID + creation time). A recreated account with the same UID is another generation.

Analytics is a subscriber of `accountDeletionSession`, whose listeners are guarded, so a PostHog failure cannot block deletion. The deletion code does not import analytics.

**Limits:**

- A batch already on the wire cannot be recalled, including its automatic retries. Nothing else follows it, but it can arrive after the backend deleted the person.
- The SDK persists with a short debounce, so a kill just after the discard could restore those events on the next launch.
- Signing out of an unresolved deletion also discards that account's queued events, even if the account turns out to still exist. A few events are lost rather than risk sending those of a deleted account. When the closure ends, the same account can sign in and report again.
- If the app dies between the backend's confirmation and the closure, the queue survives until reconciliation sets the closure, and a flush could happen before that.
- Deleting the PostHog person belongs to Functions and is not implemented in iOS.

### LinkedIn

Evidence, read-only from `nearsy-identity-functions`: `linkedInFirebaseUid(iss, sub)` derives the UID from the provider subject, so a deleted and recreated account gets the same UID. `resolveOrCreateUser` already knows `created`, but the callback discards it and Exchange does not return it.

- Local dedupe uses **UID + Firebase creation time**, so a recreated account can report its own signup and onboarding. Without a valid creation time, dedupe is memory-only.
- `accountCreationSignal.ts` has `LINKEDIN_ACCOUNT_CREATION_FIELD = null`. Today every LinkedIn sign-in is `unknown` and emits no signup.
- When the field is agreed with Identity, set that one constant. A missing field stays unknown. The contract is not invented here.
- Until then the signup count excludes LinkedIn, while its onboarding events are sent, which inflates `profile_completed / signups`.

## app_opened

An open is a real arrival to foreground.

| Sequence | Result |
|---|---|
| First `active` of the process | `cold_start` |
| `background → active` | `return_from_background` |
| `active → inactive → active` | Nothing |
| Launch that stays in background | Nothing until the user brings the app forward |
| `background → active` where the background began during a sign-in | Nothing |

- **Permissions:** the system dialog only moves the app to `inactive`, so it never counts. Going to Settings is a real background and counts when the user returns.
- **Authentication:** Google, Apple, Facebook and LinkedIn run inside `withExternalAuthFlow`. Sheets that only go `inactive` never count. If the flow really backgrounds the app, its return is the same visit. The exclusion expires after 10 minutes, so an abandoned sign-in cannot hide a later real return.
- **Not covered:** re-authentication inside account deletion is not wrapped, because the session is ending. LinkedIn resume after iOS killed the app counts as `cold_start`, which is what happened.
- **To verify on a device:** which `AppState` values iOS really delivers for each provider. This has only been tested with simulated sequences.
- `session_id` is the SDK session: 30 minutes of inactivity by default, and it resets on restart and on `reset`.

**`is_first_open`** is sent only when it can be shown:

| Evidence | Value |
|---|---|
| Marker, Welcome or appearance preference, or a restored session | `false` |
| None of those, and the app's install date is within 24 h | `true` |
| None of those, and the install date is older or unavailable | Omitted |
| Storage cannot be read | Omitted |

The install date separates a fresh install from an old one that upgrades with no other trace. A reinstall is a first open of that install. Its native behaviour has not been checked on a device.

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
- **`socials` counts:** a network both manual and verified counts once; each custom network counts. If verified state is not known yet and there are no manual links, `skipped` is omitted. A failed lookup for one network reads as not connected here. Legacy links kept in the profile count as manual.
- **Resuming** never creates earlier milestones. Events fire only on a real transition.
- **Dedupe limits:** one-time items are claimed just before sending, so if the session changes in that instant the event is lost rather than repeated. The ledger is local. A reinstall or a second device can repeat a milestone if the user completes that step again there. The `crjResumeStage` cursor is not treated as delivery.
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
- **`match_made`** means compatibility was presented, **not a mutual match**.
  - **Trigger:** a Discovery row at least 50% visible for 300 ms, or a Discovery profile opened.
  - **Score:** a valid number from 0 to 100. Unknown, unavailable or out of range emits nothing and does not use up the count. Unknown is never zero.
  - **Ranges:** `low` [0,50), `medium` [50,75), `high` [75,100].
  - **Initial rule:** one per viewer, other profile and SDK session. Row and later opening share one count. A new SDK session can count again. A→B counts separately.
  - **Other user:** the UID is never sent.
- **`match_id`** is optional in the contract, so other emitters are not required to send it.
  - **Construction here:** the first 32 hex characters of SHA-256 of `nearsy.match.v1|<viewerUid>|<otherUid>`.
  - **Unit:** one directed pair, viewer to profile. It repeats across sessions, so distinct `match_id` counts pairs and event totals count presentations per session.
  - **Privacy:** stable and pseudonymous, not anonymous. Nothing is written to Firestore.
  - **Failure:** if hashing fails, the event is sent without it.
- **Instagram `social_linked`:** if verification finishes while the app is closed, no event fires because the app only sees it as existing state. `social_platforms_verified` still updates.
- **`match_social_tapped`:** a tap on any Discovery profile. It does not prove a connection between people. If the open has not resolved in 1.5 s, it reports `unknown`.

## Alerts

- The listener and `getLastNotificationResponseAsync` both go through one coordinator, deduped by notification identifier and delivery date.
- **Navigation not ready:** the destination waits up to 30 s, until `MainTabs` exists and Auth has reported a session.
- **Cold start:** the tap is held until Auth reports. If it reports signed out, the destination is dropped.
- **Signed out at the tap:** no `alert_opened` and no destination, so a later sign-in does not inherit it.
- **A→B or sign-out:** the destination is dropped. A token refresh of the same account keeps it.
- `alert_id` is read from the payload if present. Current payloads do not include it, and none is made up.
- `source=inbox` does not imply a push was sent.
- Push token registration was not changed.

## Attribution

Contract: `signup_source` channel, `signup_campaign` campaign, `signup_content` piece, `signup_tool` tool, `attribution_method` method.

Link format: `https://<host>/c/<anything>?utm_medium=<channel>&utm_campaign=<campaign>&utm_content=<piece>&utm_source=<tool>`.

- Only `https`, a configured host and the `/c/` path are accepted, so OAuth returns and other links are ignored.
- Values must be slugs. `organic` and `unknown` are refused.
- Only validated fields are stored, never the URL, for up to 7 days.

**Order of operations:**

1. Link, then signup: the fields go on `signup_completed` and `$set_once`.
2. Signup, then link within 24 h: `acquisition_attributed` and `$set_once`.
3. Existing user or later link: `campaign_accessed`, without touching acquisition.
4. With no evidence, nothing is written. There is no `unknown` to block a later value, and `organic` is never claimed.

A logged-out link waits 5 s after sign-in so a signup can claim it first.

**`acquisition_attributed` is evidence of late acquisition:**

- **When:** the link arrives after signup, the account is under 24 h old, and this device has no acquisition recorded for that account generation.
- **Not overwriting:** the person properties use `$set_once`, so an original acquisition always wins.
- **Not duplicating:** a local ledger entry by UID + creation time allows it once. A later link becomes `campaign_accessed`.
- **Limit:** the ledger is local, so a second device could emit it again within 24 h. `$set_once` still protects the person.

### Universal Links setup (not published)

1. Choose a dedicated subdomain. `nearsy.app` and `www.nearsy.app` return 404 for AASA today, and `nearsy.app/legal` must not be affected.
2. Serve `https://<host>/.well-known/apple-app-site-association` as JSON, without redirects:
   ```json
   { "applinks": { "details": [ { "appIDs": ["<TEAM_ID>.com.nearsy.app.client"], "components": [ { "/": "/c/*" } ] } ] } }
   ```
3. Set `NEARSY_ATTRIBUTION_ASSOCIATED_DOMAINS=<host>` and `EXPO_PUBLIC_ATTRIBUTION_LINK_HOSTS=<host>`, and build a new binary. The App ID needs the Associated Domains capability.

This covers **installed apps only**. Links rewritten by Mailchimp, opened in in-app browsers or scanned from old QR codes need to be tested.

### New installs: not implemented

**Attribution after a new install does not exist in this code.** Universal Links only reach an installed app. No deferred link SDK is installed.

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
| Deleting the PostHog person on account deletion | Functions (assigned) | Person data stays in PostHog after account deletion until that ships |
| App Privacy labels and privacy policy | Product | Must be updated before enabling in a store build |
| Final validation of the `match_made` rule | Product | Implemented as the initial rule |
| `beta` build profile and project token in EAS | Whoever activates Beta | Analytics stays off |

## QA on a physical iPhone (Metro on 8081)

Not run yet. A successful `expo export` is a bundle check only: it does not show that the native build compiles.

**A. Off (should work on the current Dev Client, to be confirmed here):**

1. Run `pnpm --filter nearsy-ios start:dev-client` and open the app.
2. Confirm no request to `us.i.posthog.com` or `us-assets.i.posthog.com`, and no `[analytics]` logs.
3. Regression pass: register, log in and out, complete onboarding, Discovery, alerts, tapping a push with the app closed, and every social sign-in.

**B. On, Dev Client (needs a new one, because `expo-application` is a new native module):**

1. Build and install a Dev Client from this branch, on production Firebase.
2. In `apps/nearsy-ios/.env.local` set the activation variables, including `EXPO_PUBLIC_POSTHOG_ALLOW_DEVELOPMENT=true`, then restart Metro with a clean cache.
3. Run the checklist below. Events carry `environment=development`.

**C. On, TestFlight Beta:** build with the `beta` profile described in Activation and run the checklist below. Events must carry `environment=production`.

**Checklist, using PostHog Activity:**

- **Beta values:** an anonymous `app_opened` before login has `is_test_user=true` and `distribution_channel=beta`. The person shows the real UID with no prefix.
- **Opens:** open, background and return give one `app_opened` each. A permission dialog adds none. Check each provider's sign-in adds none, and whether its `AppState` sequence matches the rule.
- **First open:** fresh install gives `true`. Installing over an older build does not give `true`.
- **Signups:** email, Google, Apple and Facebook give one `signup_completed`. Logging in again gives none. LinkedIn gives none, as documented.
- **A→B:** events belong to the right person, and both are marked.
- **Onboarding:** milestones 1 to 6. Going back and forward repeats none. Close midway and resume: no earlier ones appear.
- **Permissions:** allow and deny; change in Settings and return. Check the `*_granted` person properties.
- **Visibility and Discovery:** toggle visibility; open Discovery; an interval refresh gives no new `discovery_opened`.
- **`match_made`:** one for a row seen, none more when opening that profile. A profile not seen in the list, opened directly, gives one. Another account gets its own.
- **Network tap:** tap a network on a profile.
- **Push:** tap with the app closed navigates to the profile, with one `alert_opened` and `source=push`. Tap while signed out: nothing, and signing in does not jump to it. Tap an inbox row: `source=inbox`.
- **Location task:** force it with the app closed: no event, no SDK start.
- **Person properties:** edit interests, remove all selections, and switch mode, including a legacy account with no data for the other mode. No value of the previous mode remains.
- **Deletion:** delete a test account with events queued (airplane mode, then back online). Its queued events do not arrive, deletion is not blocked, and the next account gets none of them.

**Rollback:** build without `EXPO_PUBLIC_POSTHOG_ENABLED`. Events already sent stay in PostHog.
