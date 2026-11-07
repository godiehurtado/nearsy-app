# Android PostHog tracking plan

Tracking Plan v1, Android only. Remote sending is off in every build, production included.

## Evidence so far

| Level | State |
|---|---|
| Implemented | Everything in this document, except what "Pending" lists |
| Tested with mocks | 150+ tests in `packages/shared/src/analytics/__tests__` |
| Real SDK executed | Only under Node, with `react-native` stubbed and requests intercepted (`analyticsRealSdk.test.ts`) |
| Tested on a device | No |
| Received in PostHog | No. Nothing has been sent |

The logs of `inspect` mode show what the app asks for. They do not prove that the SDK works.

## Modes

`resolveAnalyticsConfig` returns one of these. Any invalid setting falls back to `inspect` in
development builds and to `off` in release builds.

| Mode | Build | SDK | Network | Needs |
|---|---|---|---|---|
| `off` | Release | Not loaded | None | Default |
| `inspect` | Dev | Not loaded | None | Default in dev; sanitized logs |
| `sdk_intercept` | Dev Client | Real | None | `NEARSY_ANALYTICS_SDK_INTERCEPT=true` |
| `smoke` | Dev Client | Real | PostHog | See "Smoke" below. **Not activated** |
| `remote` | Release | Real | PostHog | See "Remote" below. **Not activated** |

### `sdk_intercept`

A subclass of the real PostHog class overrides `fetch`, the only method through which the SDK
reaches the network. Queueing, flush, identify, `before_send` and sessions run for real, and every
request ends in a local log. The host is a `.invalid` name as a second barrier, and the token is a
placeholder. It needs a Dev Client on the development Firebase, and it wins over `smoke`.

```bash
NEARSY_ANALYTICS_SDK_INTERCEPT=true NEARSY_FIREBASE_ENV=development NEARSY_DEV_CLIENT=true pnpm --filter nearsy-android exec expo start --dev-client --port 8082
```

Logs: `[analytics:sdk_intercept] /batch/ <event> props=[names] person=[names]`. Names only.

### Network guard, in every mode

SDK 4.85.3 requests `/array/{token}/config` at startup and has no option to stop it; the
`disableRemoteConfig` option used by the first batch does not exist. The guard answers that request
and any other path locally, so only `/batch/` can ever leave.

### Smoke

Prepared and off. All of this must hold at runtime:

- `__DEV__`, a Dev Client, and `NEARSY_FIREBASE_ENV=development`.
- The **initialized Firebase app** reports project `nearsy-dev`, not only the build setting.
- `NEARSY_ANALYTICS_SMOKE_ENABLED=true` and a valid `NEARSY_ANALYTICS_SMOKE_TOKEN`.
- `NEARSY_ANALYTICS_SMOKE_EMAIL_SUFFIX`, ending in a reserved domain (`.test`, `.example`,
  `.invalid`), so a suffix such as `@gmail.com` is rejected.

Isolation:

- Only an account whose email has that suffix gets a person, as `smoke_nearsy_dev_<uid>`. Any other
  account sends nothing, not even anonymous events.
- Nothing is sent while signed out, and `environment` is `smoke_nearsy_dev`.
- Persistence is in memory: no queue or identity stays on the device.

**A separate PostHog project is still the better isolation.** With the production project, smoke
persons and events share its totals unless filtered by `environment`. No administrative credential
is used or needed.

### Remote

Needs `NEARSY_ANALYTICS_ENABLED=true`, `NEARSY_ANALYTICS_ENV=production`, a valid
`NEARSY_POSTHOG_TOKEN`, production Firebase, no Dev Client and a release build. `preview` resolves
to `off`, because it uses production UIDs. Tokens enter the build only when their mode is enabled.

## Contract

`before_send` drops any event outside this table and, on these events, any custom property it does
not list. SDK `$` keys and the technical properties stay. The app does not send autocapture,
screens, replay, exceptions, flags, surveys or GeoIP.

Every event also carries `platform`, `app_version`, `app_build`, `environment` and
`tracking_plan_version`.

| Event | Properties | Fires |
|---|---|---|
| `app_opened` | `session_id` | First foreground, or a qualifying return |
| `signup_completed` | none | Account creation confirmed: email, Google, Facebook |
| `profile_completed` | `completion_time_min` | Final CRJ save succeeded |
| `onboarding_step_completed` | `step_name`, `step_number`, `skipped`, `profile_type`, `item_count`, `catalog_count`, `custom_count`, `manual_count`, `verified_count` | Milestone saved |
| `social_linked` | `social_platform`, `connection_type` (`manual`, `verified`), `profile_type` | A connection was added |
| `match_social_tapped` | `social_platform`, `score`, `match_score_range`, `open_result` | Tap on a network of a Discovery profile |
| `foreground_location`, `background_location` | `granted`, `trigger` (`request`, `state_change`) | Request result, or a change on return |
| `visibility_changed` | `enabled` | Activate or deactivate succeeded |
| `discovery_opened` | `load_time_sec`, `people_shown` | First successful load of an entry |
| `profile_viewed` | `score`, `match_score_range` | Discovery profile loaded |
| `match_made` | `score`, `match_score_range`, `presented_in`, `session_id` | Compatibility discovered on a presented profile |
| `alert_opened` | `source` (`push`, `inbox`), `alert_id` | Alert opened |
| `campaign_accessed` | `campaign_source`, `campaign_name`, `campaign_content`, `campaign_tool`, `attribution_method` | Campaign link by an existing account |

### Person properties (active mode)

An unknown value is omitted. A confirmed empty one clears the stored value.

| Property | Source |
|---|---|
| `email`, `platform`, `app_version` | Auth and build |
| `profile_type`, `occupation` | Active mode |
| `languages` | `languageCodes` |
| `country_birth` | `birthCountryCode`; Product treats origin as birth |
| `country_live` | `currentCity.countryCode`; never GPS or IP |
| `age_range` | `birthDate`: `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+` |
| `interests`, `affiliations` | Stable catalog or provider ids |
| `interests_custom`, `affiliations_custom` | Original custom text |
| `interests_custom_normalized`, `affiliations_custom_normalized` | Trim, collapsed spaces, lowercase |
| `interests_count`, `interests_catalog_count`, `interests_custom_count` | Real totals; same for `affiliations_*` |
| `social_platforms_manual` | Valid links of the mode's bag, Website included |
| `social_platforms_verified` | Confirmed Identity reads |
| `socials_connected`, `has_socials` | Union of both; only when both are known |
| `foreground_location_granted`, `background_location_granted` | Current permission |
| `signup_source`, `signup_campaign`, `signup_content`, `signup_tool`, `attribution_method` | set_once, confirmed signup with evidence |

Details:

- A person under 18 gets `age_range: null`. Age validation is unchanged.
- A custom id embeds typed text (`custom_music_<slug>_<ts>`), so it never enters `interests` or
  `affiliations`. `*_other` and `*_group_*` are excluded, as in the product's own count.
- Analytics limits: 100 items per list, 120 characters per text. Counts stay real, and the profile is
  never modified. Product limits are 40 characters for a custom interest and 120 for an affiliation.
- A custom social network reports only `custom`; its name is free text.
- Verified status comes from confirmed reads only. A failed read also clears the card, so
  `onConnectedChange` cannot tell "not linked" from "unknown" and is not used.

## Rules

### `app_opened`

- 30 seconds minimum away: **provisional**, set with `NEARSY_ANALYTICS_APP_OPENED_MIN_BG_SEC`. It is
  not the SDK session, which rotates on its own clock.
- A departure caused by an own flow does not count, up to 10 minutes away: sign-in, permission
  dialogs, image pickers, contacts, Custom Tabs, Settings, Instagram inbox.
- Other links, such as the privacy policy, still count if the user stays away long enough.
- `is_first_open` stays omitted.

Users who already had the app send nothing until they update, and their first `app_opened` is not a
first open. Cohorts must start from installs after the release. No historical events are emitted.

### Onboarding

| # | Milestone | CRJ steps | Completed when |
|---|---|---|---|
| 1 | `profile_type` | `type` | Mode saved |
| 2 | `basics` | `identity`, `photo` | **Photo** saved |
| 3 | `about` | `details` | Details saved |
| 4 | `affiliations` | `affiliation:*` | Last category saved |
| 5 | `interests` | `interestsIntro`, `interest:*` | Last category saved |
| 6 | `socials` | `socialMedia` | Socials saved |

- The internal `identity` step holds first name, last name and birth country (required) and current
  city (optional). Birth date is captured before the wizard. Registration is measured by
  `signup_completed`.
- `about` is the real `details` group: occupation, bio, languages, and company when professional.
- `skipped=true` means the milestone ended without content. Partial content is `false`, with amounts.
- Gallery, location and notifications are not milestones.

Dedupe limits:

- One emission per milestone, account and process. Back and forward, and rerenders, do not repeat it.
- A resume marks the milestones behind the cursor as done without sending them.
- The first completion wins: content added after going back is not reported again.
- A crash between the save and the SDK flush loses the event. A restart that goes back behind the
  cursor's own step can repeat that one milestone.
- `verified_count` is omitted if the cards had not confirmed status when the step ended. `skipped`
  then counts only what is known.

### Socials

- `social_linked` fires on a manual add (no previous value), on an OAuth connect or return, and when
  Instagram goes from pending to verified. Never on hydration, on editing a link, or while pending.
- Removing and adding again counts as a new connection.
- `match_social_tapped` does not mean a connection between people. `open_result` only says whether
  the OS accepted the link (`opened`, `invalid`, `failed`).

### Permissions and visibility

- The first reading of each process only updates the person. Then an event fires for a change or for
  an answered request. A request that finds the permission already granted is silent.
- A change while the app was closed updates the person without an event.
- The state is read on start and on each return, without dialogs or location samples.
- `visibility_changed` fires on Home's explicit activate and deactivate, which include the return from
  Settings, and on the first CRJ activation. One per real transition in the process.
- Automatic recovery at startup is not a user change, so it is not reported.

### Discovery and match

**Provisional rule, for review.** `match_made` means compatibility discovered, not mutual acceptance.
The mobile app emits it.

- An entry is one mount of `NearbySearchScreen`. Returning from a profile is not an entry.
- `load_time_sec` runs from the start of the attempt that succeeded, after the profile snapshot is
  ready. `people_shown` is the result count of that load, before any text filter. An error is not an
  empty success.
- `match_made` fires for a card at least 50% visible, or an opened profile. Results that never appear,
  and the 30-second alert polling, do not count.
- One per profile, user and **SDK session**. Another session can count again. Refreshes and rerenders
  do not multiply it.
- **Assumption:** without a known score there is no `match_made`, because there is no compatibility to
  report. `profile_viewed` and `match_social_tapped` still fire, without a score.
- The other person's UID is only a local dedupe key. It is never sent, and `match_id` was not needed.

### Alerts

- `source=push` needs `actorUid` or `alertId`. `data.alertId` is optional and never fabricated. No push
  sends it yet, so `alert_id` stays absent until Functions adds it.
- `source=inbox` has no id: the inbox id is the other person's UID.
- Cold start now works: the initial response waits until the Home tab is reachable, for up to 5 minutes.
  The tap is claimed by id, so the initial response and the listener cannot process it twice, and a
  tap handled by an earlier run is not replayed.
- Tokens and reminders are unchanged. `alert_sent` belongs to Functions and means accepted by Expo.

### Attribution

- Allowlist: `utm_source`, `utm_campaign`, `utm_content`, `nearsy_tool` or `utm_tool`. Values must be
  safe tokens of up to 64 characters.
- A URL with an OAuth parameter (`code`, `state`, `token`, `transactionId`, `result`, ...) is ignored
  entirely. Only the fields go to temporary storage, never the URL.
- Expiry: 7 days, set with `NEARSY_ATTRIBUTION_EXPIRY_HOURS`.
- A signed-out or recent account holds the touch. A confirmed signup consumes it as set_once. An
  account older than 2 minutes sends `campaign_accessed` instead.
- `organic` and `unknown` are never written, so later evidence is not blocked. `utm_medium=organic`
  from Play is not treated as evidence.
- Reading a link does not consume it, so LinkedIn and ownership OAuth are unaffected.

Sources:

| Source | State |
|---|---|
| `nearsy://campaign?...` | Works on the existing scheme |
| App Links | Configurable. No filter exists until `NEARSY_APP_LINKS_HOST` and `NEARSY_APP_LINKS_PATH_PREFIX` are set. `/` alone is rejected |
| Install Referrer | `expo-application` already includes it; no new SDK. Off until `NEARSY_ATTRIBUTION_INSTALL_REFERRER=true`. Read once, only while signed out |

## Pending and external

| Item | Owner | Needed |
|---|---|---|
| Domain and App Links | Product | Choose host and path, publish `/.well-known/assetlinks.json` with the **Play App Signing** SHA-256 (Play Console, App integrity), and a landing page for users without the app |
| LinkedIn `signup_completed` | Identity | Name the explicit new-account field. Set it in `linkedinNewAccountSignal.ts` and call it at the two `performSignInOnce` sites of `linkedinSession.ts`. Not inferred meanwhile |
| Account recreation | Identity and iOS | No permanent dedupe by UID is used here, and the iOS report differs. A recreated account counts as a new signup |
| `data.alertId` on push | Functions | Optional field |
| `event_cohort` | Server | Assigned by venue and window, not by link or date. The app does not send it |
| Smoke run | Product | Decide on a separate PostHog project, create synthetic accounts, then authorize |

Out of scope: gender, seniority, industry, monetization, backfills, new Firestore rules or fields.

## Limitations

- "Only once" is per process, and delivery is what the SDK retries. Count unique people.
- Email signup fires once the Auth account exists, even if the later profile write fails.
- `completion_time_min` is elapsed time since Auth creation, not active time.
- A cold-start tap waits for Home. If that never happens within 5 minutes, it is neither opened nor counted.
- `session_id` in `inspect` mode is a stand-in, not an SDK session.

## QA on a physical Android device (Metro 8082)

Use `nearsy-dev` test accounts only. Nothing here sends data remotely.

```bash
adb reverse tcp:8082 tcp:8082
```

```bash
NEARSY_ANALYTICS_SDK_INTERCEPT=true NEARSY_FIREBASE_ENV=development NEARSY_DEV_CLIENT=true pnpm --filter nearsy-android exec expo start --dev-client --port 8082
```

Filter Metro logs by `[analytics:`. Run once with the first variable, to execute the real SDK, and drop
it to compare with `inspect`.

| Area | Step | Expected |
|---|---|---|
| SDK | Start | `[analytics:sdk_intercept] /batch/` lines; no external traffic |
| Open | Cold start | One `app_opened` |
| Open | Permission dialog or Google sign-in open over 30 s | No new `app_opened` |
| Open | Home screen 30 s or more, then return | One `app_opened` |
| Signup | Email, Google or Facebook, new account | `$identify`, then `signup_completed` |
| Signup | Existing account, restart with session | No `signup_completed` |
| CRJ | Complete each milestone | One event each, numbers 1 to 6 |
| CRJ | Finish identity only | No event; `basics` comes after the photo |
| CRJ | Back and forward | No repeat |
| CRJ | Close and reopen mid-way | Nothing for earlier milestones |
| CRJ | Skip socials with none | `skipped: true` |
| CRJ | Lose network on a save | No event until it succeeds |
| CRJ | Finish | `profile_completed`, with duration |
| Person | Edit interests, add a custom one | Person update; custom text only in `*_custom` |
| Socials | Add Website, then edit it | One `social_linked` |
| Socials | Connect YouTube, TikTok or X | One `social_linked`, `verified` |
| Socials | Instagram pending, then verified | Event only once verified |
| Socials | Reopen the screen | No `social_linked` |
| Permissions | Grant from the dialog | `foreground_location`, `granted: true` |
| Permissions | Change in Settings, return | `background_location`, `state_change` |
| Visibility | Toggle on and off | One `visibility_changed` each; none if the call fails |
| Discovery | Open Nearby | One `discovery_opened`, also when empty |
| Discovery | Wait 2 minutes, pull to refresh | No new `discovery_opened` |
| Discovery | Airplane mode, then retry | Only the retry reports |
| Match | Scroll the list | One `match_made` per visible profile with a score |
| Match | Open a profile, return, refresh | No multiplied events |
| Profile | Open, go to the gallery, return | One `profile_viewed` |
| Social tap | Tap a network | `match_social_tapped` with `open_result` |
| Alerts | Tap an inbox row | `alert_opened`, `inbox` |
| Alerts | Tap a push, app open | `alert_opened`, `push`; profile opens |
| Alerts | Tap a push, **app closed** | Profile opens once; one event |
| Alerts | Tap a push, restart without tapping | No replay |
| Campaign | `adb shell am start -a android.intent.action.VIEW -d "nearsy://campaign?utm_source=qa"`, then sign up | `signup_source` on the person |
| Campaign | Same link, signed in with an older account | `campaign_accessed` |
| OAuth | Complete LinkedIn login | Works as before; no campaign data |
| Identity | Logout; A then B | `reset` before the next `$identify` |
| Privacy | Any line | No email, occupation, custom text, UID or token |

### Dev Client

- **Installed client:** enough for `inspect` and `sdk_intercept`, if it includes `expo-application`.
  The SDK is JavaScript only and runs in memory here. Check that the first lines show `app_version`.
- **New build needed:** App Links (a manifest change), and `remote`, whose settings are fixed at build
  time. Install Referrer only if the installed client lacks `expo-application`.

## Tests

From `packages/shared`:

```bash
node --experimental-strip-types --test --test-force-exit src/analytics/__tests__/analyticsFoundation.test.ts src/analytics/__tests__/analyticsTrackingPlan.test.ts src/analytics/__tests__/analyticsRealSdk.test.ts
```
