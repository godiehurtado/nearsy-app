# Nearsy iOS: PostHog analytics

Project Nearsy, ID 716015, US Cloud, host `https://us.i.posthog.com`. Plan version `2026-11-07.1`.

**Remote delivery is off, in production too.** Only the `beta` build profile declares capture, and it still needs a token that is not in the repository. No build has been made with it. No event has been received in PostHog and no physical test has been run for this work.

## Activation

Analytics captures only when a build declares all of these at bundle time. The token never goes in Git: use an EAS environment variable for builds, and `apps/nearsy-ios/.env.local` only for local work.

| Variable | Value | Effect |
|---|---|---|
| `EXPO_PUBLIC_POSTHOG_ENABLED` | `true` | Required. Any other value keeps analytics off |
| `EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL` | `beta` or `production` | Required. Without a valid channel nothing is sent |
| `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` | `phc_...` | Required. Missing or malformed keeps analytics off without failing |
| `EXPO_PUBLIC_NEARSY_FIREBASE_ENV` | `production` | Both channels refuse `development`. Empty reads as production, as in `app.config.js` |
| `EXPO_PUBLIC_POSTHOG_ALLOW_DEVELOPMENT` | `true` | Only for a Metro or Dev Client bundle. Its events carry `environment=development` |
| `EXPO_PUBLIC_ATTRIBUTION_LINK_HOSTS` | `go.example.com` | Optional. Hosts accepted as campaign links |
| `NEARSY_ATTRIBUTION_ASSOCIATED_DOMAINS` | `go.example.com` | Optional, build time. Adds the `applinks:` entitlement |

No Personal API Key is needed.

### Channels

| Channel | Build | Events | Person |
|---|---|---|---|
| `beta` | EAS profile `beta`, for TestFlight | `distribution_channel=beta`, `is_test_user=true` | `is_test_user=true`, permanent |
| `production` | Not enabled today | `distribution_channel=production`, no `is_test_user` | Never writes `is_test_user`, so an earlier Beta mark stays |
| none | Every other build, including the current `production` profile | Nothing is sent | Nothing |

**Enabling general capture after QA needs no code change**, only configuration and a new build. Add these to the `production` profile's `env` in `eas.json`, then build:

```json
"EXPO_PUBLIC_POSTHOG_ENABLED": "true",
"EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL": "production"
```

The source guard in `analyticsCore.test.ts` already accepts that. It rejects a token in `eas.json`, a channel that does not match its profile, and these switches in any other profile.

### TestFlight Beta

Beta is TestFlight on **production Firebase** and PostHog project 716015. It replaces any earlier requirement to use Firebase development.

- **UID:** the real Firebase UID, with no prefix.
- **Event values:** `environment=production`, `distribution_channel=beta`, `is_test_user=true`.
- **Declared, not detected:** the app does not try to detect TestFlight. The channel comes only from the build profile.

The `beta` profile is in `apps/nearsy-ios/eas.json`. It extends `production`, so it uses the same EAS environment (`production`), Firebase production and signing. The `production` profile declares no channel, so its binary keeps PostHog with capture off.

```json
"beta": {
  "extends": "production",
  "env": {
    "EXPO_PUBLIC_NEARSY_FIREBASE_ENV": "production",
    "EXPO_PUBLIC_POSTHOG_ENABLED": "true",
    "EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL": "beta",
    "NEARSY_IOS_VERSION": "2.0.10",
    "NEARSY_IOS_BUILD_NUMBER": "74"
  }
}
```

**Before the first Beta build:**

`app.config.js` refuses to build a profile that declares analytics without a valid token. On the EAS builder (`EAS_BUILD=true`), where EAS injects its variables, the `beta` profile stops with a message naming `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN`, so a QA build cannot ship without analytics. The EAS CLI first reads `app.config.js` on the local machine without the EAS variables, so that local read only checks the profile is complete. Profiles that declare nothing need no token. The message never includes the token.

**Local read before upload:** `app.config.js` also requires `EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY`, which lives in EAS. If it is not in the local environment, the CLI stops before uploading. A placeholder `pk_` value works for that local read only, because the builder evaluates the config again with the real EAS value.

1. **Token.** Create it once in the EAS `production` environment, which the `beta` profile inherits. The `production` profile also receives it, and stays off because it declares no channel.
   ```bash
   eas env:create --environment production --name EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN --value <phc_token> --visibility sensitive
   ```
   An `EXPO_PUBLIC_` value is compiled into the app, so it is not a secret from the binary. Visibility only keeps it out of logs and the dashboard.
2. **Version and build number.**
   - **Source:** `appVersionSource` is `local` and `autoIncrement` is `false`. EAS has no remote counter for this app and takes both values from the resolved app config.
   - **The `beta` profile numbers itself** with `NEARSY_IOS_VERSION` and `NEARSY_IOS_BUILD_NUMBER`, which `app.config.js` applies to that build only. The public `production` profile numbers itself the same way, as 2.0.10 (76); the internal Contacts diagnostic profile uses 2.0.10 (75). `app.json` stays at 2.0.9 (70), which the remaining profiles still read. Beta and production share one App Store build number space, so the next Beta needs 77 or higher.
   - **History checked on 2026-11-07 with `eas build:list`:** the highest iOS build is 2.0.10 (72), from the `testflight-contacts-diagnostics` profile on another branch. 2.0.9 already has builds up to 71. So the first Beta used **2.0.10 (73)**. Rechecked before the second Beta: the highest was still 73, so it uses **2.0.10 (74)**.
   - **Still to confirm in App Store Connect:** that no build above 72 was uploaded outside EAS (Xcode or Transporter), and that the 2.0.10 version is still open for builds. If either fails, change only the two values in the `beta` profile.

**Commands:**

```bash
cd apps/nearsy-ios
eas build --platform ios --profile beta --clear-cache
eas submit --platform ios --profile production --id <BUILD_ID_FROM_THE_BETA_BUILD>
```

Use `--id` with the Beta build's ID rather than `--latest`, so a different build cannot be submitted by mistake. The only submit profile is `production`, which uploads to App Store Connect. The build then appears in TestFlight.

**First Beta, 2.0.10 (73), distributed on 2026-11-07:**

| Item | Value |
|---|---|
| EAS build | `95f13034-2b81-40e2-8488-3e31b23fb9d6`, profile `beta`, distribution store |
| Commit built | `b4e7c7fc566f2166346c2a76bd8a28070e7cb23b` |
| EAS submission | `ec50716f-a8aa-49c5-9d81-b8f54f2bca2a` |
| App Store Connect app | `6759302206` (`com.nearsy.app.client`) |
| Later commit | `7384762` sets `ascAppId` in the `production` submit profile. It does not change the binary |
| Status | Processed by Apple and available in TestFlight |

Distribution is complete. Physical QA and receipt of events in PostHog are still pending.

**Do not promote a Beta binary to the App Store.** The channel is compiled into the bundle, so every store user would be reported as `is_test_user=true`. Build the store version from the `production` profile. See [ios-2010-public-release.md](ios-2010-public-release.md).

**Local bundles and the Metro cache:** Metro can reuse a cached transform that already holds other `EXPO_PUBLIC_` values. When switching configuration locally, start Metro or `expo export` with `--clear`. EAS builds start from a clean cache.

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
| Account marked earlier, later on a `production` build | No `is_test_user` on those events | Stays marked: `production` never writes the property |

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

- **What it touches:** public `getPersistedProperty` and `setPersistedProperty`, then the protected `flushStorage` from the subclass. The queue item shape, `{ message: { distinct_id, timestamp } }`, is internal to the SDK.
- **Why:** `reset` keeps the queue by design, and no public call removes items from it.
- **Found by the real SDK test:** in memory the SDK can hold `timestamp` as a `Date`, and on disk as an ISO string. Both are read. An unreadable timestamp is removed rather than kept.

**Upgrade check:** `postHogRealSdk.test.ts` fails if the versions change, if the SDK starts honoring `disableRemoteConfig`, or if the override or the discard stops working.

## Code

| Path | Role |
|---|---|
| `packages/shared/src/analytics/contract.ts` | Allowlist of events and properties |
| `analytics/config.ts` | Activation rules and Beta mode |
| `analytics/client.ts` | Ordering, identity, deletion, error isolation |
| `analytics/deletionRecords.ts` | Local deletion records applied to the queue at start |
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

Every event also carries `platform` (`iOS`), `app_version`, `app_build`, `environment` and `tracking_plan_version`. With a declared channel it also carries `distribution_channel`, and in Beta `is_test_user=true`. Version and build come from the running binary.

| Event | Properties | Fires when |
|---|---|---|
| `app_opened` | `open_type` (`cold_start`, `return_from_background`), `session_id`? | Real arrival to foreground. Waits for the Auth session |
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
| `alert_opened` | `source` (`push`, `inbox`), `alert_id`?, `alert_motive`? (`interest`, `contact`, `both`, `affiliation`, `contact_affiliation`; omitted when the payload names a motive this binary does not know) | Tap on a push or an inbox row |

`?` means omitted when unknown, never sent as empty, zero or `unknown`.

`signup_method`, `open_type`, `link_type`, `open_result`, `alert_motive`, `acquisition_attributed`, `campaign_accessed` and `visibility_changed` are additions to the Tracking Plan document. `social_platform` replaces the plan's `platform` on social events.

**2.1.0 person properties:**
- `first_name` / `last_name`: top-level `realName` / `lastName`; `$unset` when removed.
- `industry`: the `professionalIndustryId` catalog id. It is kept while the personal mode is active (`profile_type` segments it), and `$unset` when the selection is cleared.

All three are person-only, never on events.

**Not sent:** `gender`, `seniority`, monetization events. `alert_sent` (accepted by Expo, not delivered) and `event_cohort` (server, by presence at venue and time window) belong to Functions.

## Person properties

| Property | Source and rule |
|---|---|
| `user_id` | Firebase UID. Also the `distinct_id`, except for a LinkedIn account created after the proposal G cutover (see below). Under review: a recommendation to remove it is pending a decision |
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

- **Occupation:** only the mode's own nested value, `profiles.<mode>.occupation`. The top-level `occupation` of a legacy profile is never sent, because it cannot be shown to belong to the active mode: the switch runs in the backend and does not rewrite it. Without a nested value, `occupation` and `occupation_truncated` are unset. This holds after a process restart too, and Firestore is not changed. The app may still show the top-level value.
- **Verified lookup, one platform at a time:** each network is read separately, and only a successful Get is evidence. Any refusal leaves that network unknown, including `*_NOT_ENABLED`: it means the feature is off for this account (core off, or restricted and not on the allowlist), not that no link exists. One unknown network never hides the others.
- **Unknown networks keep their last proved value:** the app remembers, per account and mode, the last value each network proved, on the device (`nearsy.analytics.verified.v1`), so a restart with YouTube off does not erase a YouTube link reported earlier. The record is removed when the account deletion is confirmed. A network never proved on this install stays out of `social_platforms_verified`; a value sent from another install is not known here.
- **Nothing proved at all:** it keeps values only if this mode already confirmed them in this process. Otherwise `social_platforms_verified`, `socials_connected` and `has_socials` are unset.
## Identity

- `identify` at registration, login and restore, once per account.
- `reset` at logout and before A→B, and at restore if the SDK holds another account.
- Calls run in order. Account events name their UID and are dropped if the session moved on.
- A sign-in can finish before the Auth listener runs, so the client adopts the live session if it owns that UID.
- `signup_completed`: email right after `registerWithEmail`; Google, Apple and Facebook when Firebase reports `isNewUser === true`.

### Account deletion

Checked against the real SDK: **`reset` does not empty the queue.** Each queued event already holds its `distinct_id`, so after a normal logout it is still delivered, under the right account. Deletion therefore removes queued events explicitly.

Analytics follows three states published by the deletion modules. It subscribes to them, they never wait for it, and their listeners are guarded, so an analytics failure cannot block or alter the Nearsy deletion.

| State | Source | What analytics does |
|---|---|---|
| **Intent** | `beginAccountDeletionSession`, or an uncertain result kept by `accountDeletionReconciliation` | New events and person updates of that account are dropped, not queued. Queued ones wait. A local `intent` record is written |
| **Cancelled** | The session ends with no closure and no pending deletion | The account reports normally again. The `intent` record is removed and nothing is discarded |
| **Confirmed** | The closure: the backend confirmed, or Auth reported `user-not-found` | A local `confirmed` record is written. The account's queued events are removed and the removal is written to disk at once. The SDK identity resets, and later events of that account generation are refused |
| **Exit while unresolved** | The person signs out of a deletion whose outcome is unknown. The deletion module sets the same closure | Treated like Confirmed by analytics, as a **preventive discard of the local queue only**. It is not evidence that the account was deleted, and nothing is reported anywhere as a deletion |

**Persisting the discard:** the queue item is removed with `setPersistedProperty`, then the write is forced with `flushStorage`. That is the SDK's own step after it changes the queue, instead of its usual debounce. The real SDK test restarts right after a discard and sends nothing.

**After a restart:** before the transport serves any operation, every local record removes that account's queued events up to the recorded time, then the records are deleted. This covers an app that died before the live discard reached disk.

- **Intent left by a dead process:** the deletion may or may not have happened, so that account's earlier queued events are removed. A few events are lost rather than risk sending those of a deleted account.
- **Time bound:** it keeps a recreated account with the same UID untouched, and an account that turned out to still exist reports normally afterwards.
- **Exit while unresolved:** the queue of that account is discarded as a precaution, even if the account still exists. A few events are lost rather than risk sending those of a deleted account. When that closure ends, the same account can sign in and report again. This block does not change that flow.

**Limits for Functions, not closable from the app:**

- **A request already on the wire cannot be recalled,** including the SDK's automatic retries of that batch. It holds only events captured before the intent, since the intent stops new ones. It can still reach PostHog after Functions deleted the person, and PostHog would then create the person again from it.
- **PostHog ingestion is asynchronous.** Events accepted just before the deletion call may be processed after it, with the same effect.
- **The UID alone does not identify a deleted account.** A LinkedIn account recreated with the same UID is a different account generation. Without a cutover it shares the PostHog `distinct_id`, so it is the same PostHog person. Proposal G (below) separates generations once the cutover is set.
- **`account_created_at` can help detect a recreation, nothing more.** The recreated account's `signup_completed` and `profile_completed` carry its own creation time, which differs from the deleted one. The person property itself is `$set_once`, so it can still show the deleted account's value. None of this separates the two generations' data, makes deleting that person safe, or closes the race above.
- **Not solvable here without a decision in Functions:** once a recreated account shares the person, deleting it also deletes the new account's data, and leaving it keeps late events of the deleted one. How to treat that case is for Functions and Product to decide.

### distinct_id per account generation (proposal G)

Contract: Functions `docs/analytics/ANALYTICS_DISTINCT_ID_CONTRACT.md` @ `37af793` (approved 2026-11-12). Code: `packages/shared/src/analytics/distinctId.ts`.

- **Rule:** `distinct_id = analyticsDistinctId(uid, authCreationTimeMs, sinceMs)`. It is the UID, except for an `li_` account created at or after the cutover, which gets `nag1_` + the first 32 hex characters of SHA-256(`nearsy-analytics-distinct-id:v1:<uid>:<seconds>`).
- **Cutover:** build-time `EXPO_PUBLIC_POSTHOG_GENERATION_ID_SINCE_MS`. It is set in no `eas.json` profile; unset means every account keeps its UID, exactly as before. Parse rule: trim, `^[1-9][0-9]{0,15}$` and a safe integer; anything else is ignored with a build warning (`checkGenerationIdSince`) and a runtime log code (`generation_id_since_invalid`).
- **Creation time:** Firebase Auth `user.metadata.creationTime` only.
- **Client:** the same-account checks stay on the UID; `reset()` as before. With a cutover set, an `li_` account whose creation time cannot be read is not identified: account events and person updates are dropped, and device events stay anonymous. It identifies once the time is readable and is not re-derived during that sign-in.
- **Deletion:** the live discard and the durable deletion records cover the UID and every derived id seen for it, with the same time bound.
- **SHA-256:** a small synchronous implementation, so identity changes keep their order. It is tested against Node crypto and the 5 shared vectors. No new dependency.

### LinkedIn

Evidence, read-only from `nearsy-identity-functions`: `linkedInFirebaseUid(iss, sub)` derives the UID from the provider subject, so a deleted and recreated account gets the same UID.

**Additive Exchange signal (consumer ready, Identity is confirming the final contract):**

| Field | Type | Accepted |
|---|---|---|
| `accountOutcome` | string | Exactly `created` or `existing` |
| `authCreationTimeMs` | number | A positive safe integer, Unix milliseconds |

- **Parsing:** both fields travel together. Missing, partial or malformed: no signal, and sign-in works exactly as before. Implemented in `accountCreationSignal.ts`, used by `assertLinkedInAuthExchangeResult`.
- **Propagation:** the signal goes from Exchange to the authenticated result through both the live flow and durable resume, then to `finalizeLinkedInA3AuthenticatedSession`. Exchange is still called once, and a repeated callback is still skipped.
- **`signup_completed` (method `linkedin`)** is emitted only when:
  - `accountOutcome` is `created`, and
  - `authCreationTimeMs` matches the signed-in Firebase user's creation time, read after the Auth reload.
- **Precision:** Firebase exposes `metadata.creationTime` as an HTTP date, in whole seconds, so both are compared by second. A value carrying milliseconds is compared exactly. There is no tolerance window: the next second is another generation, and emits nothing.
- **`existing`, no signal, or another generation:** nothing is emitted.
- **Dedupe:** UID + Firebase creation time, like every signup. Resume or a repeated finalize counts once. A recreated account with a new creation time counts again. Without a creation time nothing is claimed.
- **Order:** identify runs before the event, and a pending campaign link becomes the acquisition, as for other providers.
- **Until Identity deploys the fields,** LinkedIn signups are not counted while its onboarding events are, which inflates `profile_completed / signups`.

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

**`is_first_open` is not sent in this delivery.** Neither a recent install date nor the absence of local traces shows by itself that an open is the first one: storage can be cleared, and an upgrade or a restore can look fresh. The property is out of the contract, so the filter drops it. `app_opened` is unchanged otherwise.

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
- **Verified `social_linked`:** fires from both onboarding and the profile social editor when the backend confirms a connection. For Instagram, only a pending challenge that turns verified counts; opening the editor or a restart never does. Each unlink refreshes the person properties without an event, and a relink reports again.
- **Instagram `social_linked`:** if verification finishes while the app is closed, no event fires because the app only sees it as existing state. `social_platforms_verified` still updates. For X, if the finalizer fails but the reconciliation Get confirms the link, it reports once, only when X was not connected before that attempt. An event for an account that is no longer signed in is dropped.
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
| Deploy of `accountOutcome` and `authCreationTimeMs` in Exchange | Identity | LinkedIn keeps signing in with the current Exchange, but emits no `signup_completed`. The consumer is ready |
| `alert_sent`, `alertId` in payload | Functions | No sent counts; `alert_id` omitted |
| `event_cohort` | Functions | Not assigned |
| Attribution domain and AASA | Infrastructure | No Universal Links |
| Attribution for new installs | Product | Channel and campaign unknown for those installs |
| Deleting the PostHog person on account deletion | Functions (assigned) | Person data stays in PostHog until that ships. See the limits under Account deletion |
| App Privacy labels and privacy policy | Product | Must be updated before enabling in a store build |
| Final validation of the `match_made` rule | Product | Implemented as the initial rule |
| Project token as an EAS variable | Whoever activates Beta | Analytics stays off |
| Build number above the highest in App Store Connect | Whoever builds | The upload is rejected |

## QA on a physical iPhone

Not run yet; the first Beta build is available in TestFlight. A successful `expo export` is a bundle check only: it does not show that the native build compiles.

**Priority: TestFlight Beta on Firebase production.** It is the validation that counts. A Dev Client run is optional and is not a prerequisite for it.

**1. TestFlight Beta (priority):**

1. Set the build number and the EAS token as described in TestFlight Beta.
2. Build with the `beta` profile, submit, and install from TestFlight.
3. Run the checklist below. Events must carry `environment=production`, `distribution_channel=beta` and `is_test_user=true`.

**2. Optional, Dev Client with analytics off:** run `pnpm --filter nearsy-ios start:dev-client` and confirm there are no requests to `us.i.posthog.com` or `us-assets.i.posthog.com`, and no `[analytics]` logs. The current Dev Client should work, because the off path never loads a new native module.

**3. Optional, Dev Client with analytics on:** it needs a new Dev Client, because `expo-application` is a new native module. Use production Firebase, set the variables in `apps/nearsy-ios/.env.local` including `EXPO_PUBLIC_POSTHOG_ALLOW_DEVELOPMENT=true`, and start Metro with `--clear`. Its events carry `environment=development`.

**Checklist, using PostHog Activity:**

- **Beta values:** an anonymous `app_opened` before login has `is_test_user=true` and `distribution_channel=beta`. The person shows the real UID with no prefix.
- **Opens:** open, background and return give one `app_opened` each, with no `is_first_open`. A permission dialog adds none. Check each provider's sign-in adds none.
- **Signups:** email, Google, Apple and Facebook give one `signup_completed`. Logging in again gives none. LinkedIn gives none, as documented.
- **A→B:** events belong to the right person, and both are marked.
- **Onboarding:** milestones 1 to 6. Going back and forward repeats none. Close midway and resume: no earlier ones appear.
- **Permissions:** allow and deny; change in Settings and return. Check the `*_granted` person properties.
- **Visibility and Discovery:** toggle visibility; open Discovery; an interval refresh gives no new `discovery_opened`.
- **`match_made`:** one for a row seen, none more when opening that profile. A profile not seen in the list, opened directly, gives one. Another account gets its own.
- **Network tap:** tap a network on a profile.
- **Push:** tap with the app closed navigates to the profile, with one `alert_opened` and `source=push`. Tap while signed out: nothing, and signing in does not jump to it. Tap an inbox row: `source=inbox`.
- **Location task:** force it with the app closed: no event, no SDK start.
- **Person properties:** edit interests, remove all selections, and switch personal and professional, including a legacy account. No value of the previous mode remains, and no top-level `occupation` appears for a mode that has no nested one.
- **Deletion:** with a disposable test account, queue events in airplane mode, then delete the account. Its queued events never arrive, also after force-quitting and reopening, deletion is not blocked, and the next account gets none of them. Cancel a deletion once: the account keeps reporting.

**Rollback:** build without `EXPO_PUBLIC_POSTHOG_ENABLED`. Events already sent stay in PostHog.
