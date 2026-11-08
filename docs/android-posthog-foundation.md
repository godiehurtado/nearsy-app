# Android PostHog tracking plan

Tracking Plan v1, Android only. Remote sending is off in every build, production included.

## Evidence so far

| Level | State |
|---|---|
| Implemented | Everything in this document, except what "Pending" lists |
| Tested with mocks | The suites in `packages/shared/src/analytics/__tests__` |
| Real SDK executed | Only under Node, with `react-native` stubbed and the network scripted (`analyticsRealSdk.test.ts`, `analyticsBetaTransport.test.ts`, `analyticsBetaBuild.test.ts`). Not under Hermes, with no native module |
| Tested on a device | No |
| Received in PostHog | No. Nothing has been sent |

The logs of `inspect` mode show what the app asks for. They do not prove that the SDK works. The
scripted runs prove how the SDK reacts to answers. They do not prove what PostHog answers.

## Modes

`resolveAnalyticsConfig` returns one of these. Any invalid setting falls back to `inspect` in
development builds and to `off` in release builds.

| Mode | Build | SDK | Network | Needs |
|---|---|---|---|---|
| `off` | Release | Not loaded | None | Default |
| `inspect` | Dev | Not loaded | None | Default in dev; sanitized logs |
| `sdk_intercept` | Dev Client | Real | None | Optional local tool: `NEARSY_ANALYTICS_SDK_INTERCEPT=true` |
| `beta` | Release | Real | PostHog | See "Beta" below. **Not activated** |
| `remote` | Release | Real | PostHog | See "Remote" below. **Not activated** |

A build that asks for both `beta` and `remote` resolves to `off` (`ambiguous_mode`) and carries no
token. A release build that asked for sending and resolved to `off` logs the reason, never a value.

### Beta

Beta is tested through the Google Play internal track, on production Firebase, against the PostHog
project Nearsy 716015 (US Cloud), with real Firebase UIDs and no prefix. It needs no `nearsy-dev`, no
synthetic domain and no `sdk_intercept`.

Profile `beta` in `apps/nearsy-android/eas.json` extends `production`, so it is a store bundle on production
Firebase, with no Dev Client. It adds `NEARSY_ANALYTICS_BETA_ENABLED=true`,
`NEARSY_ANALYTICS_DISTRIBUTION_CHANNEL=beta`, `NEARSY_ANALYTICS_ENV=production` and
`NEARSY_ANALYTICS_ENABLED=false`. Its submit profile is the same as `production` on track `internal`.

The only value missing is the token, which never goes in Git. It lives in the EAS `production`
environment, which `beta` inherits. The `production` profile can read it too, but without a declared mode
the build config does not embed it. Use `sensitive`, not `secret`: a secret is not available when EAS
resolves `app.config.js`.

```bash
eas env:create production --name NEARSY_POSTHOG_TOKEN --value <project token of Nearsy 716015> --visibility sensitive --scope project
```

Do not create any other `NEARSY_ANALYTICS_*` variable in EAS: the Expo docs do not state whether an EAS variable
or a profile `env` value wins. A project token is public by design: it ends up inside the app.

From `apps/nearsy-android`, when authorized:

```bash
eas build --platform android --profile beta
```

```bash
eas submit --platform android --profile beta --latest
```

- `autoIncrement` comes from `production`, so each Beta build consumes a version code of the shared remote counter.
- The release reaches Play as a `draft`, as in `production`. Testers get it after publishing it in Play Console.
- `eas submit` uses the Play service account stored in Expo, unless one is set. That this app has one was not checked.

Requirements checked at runtime: a release build, no Dev Client, and `nearsy-pj` both in the build setting
and in the **initialized Firebase app**. The token only shows a valid format: nothing in the app can confirm
it belongs to project 716015, so check that once.

Rules that follow from it:

- `distribution_channel=beta` is **declared by the build**. The app does not detect the Play track.
- **Do not promote a Beta build to production in Play.** Promotion keeps the same binary, so its
  events would stay marked as tests. General capture needs its own build.
- The `production` EAS profile sets none of these variables and did not change.

### Installation and account are different things

| | Installation | Account |
|---|---|---|
| Where | `is_test_user=true` and `distribution_channel=beta` on **each event** | `is_test_user=true` on the **person**, with set_once |
| Decided by | The build | Signing in on a Beta build |
| Reaches | Every event of this install, anonymous ones and any account | Only the signed-in account |
| Means | "This event came from a Beta build" | "This account was used on a Beta build at least once" |
| Lasts | While this build is installed | Permanently, unless changed by hand in PostHog |

What happens:

| Situation | Result |
|---|---|
| App opened, nobody signed in | Anonymous events with both marks. No person is created |
| Real account signs in on a Beta build | `$identify` with the real UID, then set_once of `is_test_user`. That account is now a test person, and its anonymous events of this install join it |
| App restarts with the session | Same person. Set_once again, once per process, without a new `$identify` |
| Logout | `reset()`: new anonymous id. The next anonymous events belong to nobody |
| Account B signs in on the same device | B gets its own person and its own mark. Nothing of A travels to B: no email, no list, no mode memory. B is marked because B used the build |
| The same account on a production install | Its events carry no marks, and that build writes no classification. The person stays `true` |
| A Beta install is updated to a general build | New events lose the marks, although the SDK persisted them. Events already queued keep them |

No code path can write `is_test_user=false`: general builds do not write the property, and the outgoing
filter removes a false value from any person update. Because of set_once, the first value stays, so a
person already marked stays marked after other builds, devices and restarts. The SDK side is tested with the
real class; PostHog applying set_once is checked in QA, after the first events arrive.

**`is_test_user` absent does not mean `false`, and `false` is never sent.** Real users and events simply do not
have the property. A filter of the form `is_test_user = false` would match nothing and lose every real user.
Future Marketing filters must **exclude `true` and keep absent values**. In PostHog, confirm that the
chosen operator keeps events and persons without the property.

**Consequence to decide when analyzing:** a real user who signs in once on a tester's device stays
marked as a person. To measure by build, filter on the event property. To drop test people entirely,
filter on the person property as well, knowing that this also drops that account's production events.
Undoing a mark is manual, in PostHog. This app holds no administrative credentials.

### `sdk_intercept`

Optional, local, and not needed for Beta. It executes the real SDK with simulated answers: queueing,
flush, identify, `before_send` and sessions run for real, and every request ends in a local log. The
host is a `.invalid` name as a second barrier, and the token is a placeholder. It needs a Dev Client
on the development Firebase. Only here do requests get a simulated success.

```bash
NEARSY_ANALYTICS_SDK_INTERCEPT=true NEARSY_FIREBASE_ENV=development NEARSY_DEV_CLIENT=true pnpm --filter nearsy-android exec expo start --dev-client --port 8082
```

Logs: `[analytics:sdk_intercept] /batch/ <event> props=[names] person=[names] unset=[names]`. Names only.

### Transport while sending (`beta`, `remote`)

Verified in SDK 4.85.3 and `@posthog/core` 1.64.1, in the installed code and in the public docs.

| Request | Needed | Treatment |
|---|---|---|
| `POST {host}/batch/` | Yes: all events and person updates | Real answer reaches the SDK |
| `GET us-assets.i.posthog.com/array/{token}/config` | The SDK always sends it at startup | **Real**, see below |
| `POST /flags/` | No | Not sent: `disableRemoteFeatureFlags`, `preloadFeatureFlags: false` |
| `GET /api/surveys/` | No | Not sent: `disableSurveys` |
| `/i/v1/logs`, `metrics`, `traces` | No | The app never uses them |
| Anything else | No | Refused with an error, reported as `request_blocked` |

Remote config:

- It cannot be disabled. `disableRemoteConfig` is declared in the types, marked deprecated and no-op,
  and no implementation reads it. **Correction:** the first batch passed it believing it worked, and
  a later report said it did not exist. It exists and does nothing.
- It carries the project token and no person data.
- **The earlier decision was wrong and is reverted.** Answering it locally with `{}` made the SDK turn
  off compression, because the answer lists no supported format. The real answer now reaches the SDK.
- The answer cannot turn on what the app declines. A test answers with flags, surveys, replay and
  error tracking all on, and nothing but the two requests above leaves.
- It failing does not stop events. It is reported as `config_failed`.

Errors are not hidden. The SDK sees each real status, and `[analytics:transport]` logs the kind and the
status, without URL, token or payload.

What the SDK does with each answer, run with the real class:

| Answer | Result |
|---|---|
| 2xx | Removed from the queue |
| 408, 429, 5xx | Retried, same event uuid. Default 3 retries, 3 s apart. **After the last retry the batch is dropped** |
| Other 4xx (invalid token, for example) | **Dropped, no retry**. What follows still goes out |
| 413 | Batch split, no loss |
| Network failure | Stays queued for the next flush |
| Process restart | Queue and identity survive on storage, once written |

Disk writes are not immediate, so a kill right after an event can lose it. Options also off because the
app does not use them: lifecycle events, replay, error autocapture, GeoIP, default person properties for
flags, and push subscriptions and opens. The last two matter: they default to true, and with the native
plugin they would send outside `before_send`. That plugin is not installed.

### Remote

General capture is ready by configuration alone; it stays off. A later build only needs these variables
(and no Beta ones), with no code change. A test runs that path with a fake token, and no event or person
update carries `is_test_user` or `distribution_channel`. Persons marked by Beta keep `true`.

Needs `NEARSY_ANALYTICS_ENABLED=true`, `NEARSY_ANALYTICS_ENV=production`, a valid
`NEARSY_POSTHOG_TOKEN`, production Firebase, no Dev Client and a release build. `preview` resolves
to `off` unless it is declared as Beta. A token enters the build only when its mode can resolve.

## Contract

`before_send` drops any event outside this table and, on these events, any custom property it does
not list. SDK `$` keys stay. The app does not send autocapture, screens, replay, exceptions, flags,
surveys or GeoIP. Event names are final: the app reports these exact ones.

### Properties on every event

| Property | Type | Values |
|---|---|---|
| `platform` | string | `Android` |
| `app_version` | string | Binary version; omitted if unreadable |
| `app_build` | string | Binary build; omitted if unreadable |
| `environment` | string | `production` (`beta`, `remote`); `development`, `sdk_intercept` locally |
| `tracking_plan_version` | string | `v1` |
| `is_test_user` | boolean | `true` on Beta builds. **Absent otherwise**, never `false` |
| `distribution_channel` | string | `beta` on Beta builds. **Absent otherwise** |

### Events

"When" is the capture rule. Optional properties are omitted when unknown, never sent as `null` or `0`.

| Event | Who | When |
|---|---|---|
| `app_opened` | Anonymous or signed in | First foreground of the process, or return after 30 s or more away. Own flows do not count |
| `signup_completed` | Signed in | `additionalUserInfo.isNewUser === true`, or email account created (Email, Google, Facebook). LinkedIn: `accountOutcome=created` whose `authCreationTimeMs` is this user's creation |
| `acquisition_attributed` | Signed in | Acquisition evidence older than the signup arrived after `signup_completed` was sent, and that signup had none. At most once per account |
| `profile_completed` | Signed in | Final CRJ save succeeded |
| `onboarding_step_completed` | Signed in | A milestone was saved; once per milestone, account and process |
| `social_linked` | Signed in | A connection was added. Not on hydration or on an edit |
| `match_social_tapped` | Anonymous or signed in | Tap on a network of a Discovery profile |
| `foreground_location`, `background_location` | Anonymous or signed in | Answered request, or a change on return. Not the first reading of the process |
| `visibility_changed` | Signed in | Activate or deactivate succeeded. Not automatic recovery |
| `discovery_opened` | Signed in | First successful load of an entry to Nearby, also when empty |
| `profile_viewed` | Signed in | Discovery profile loaded, once per screen visit |
| `match_made` | Signed in | Card 50% visible or profile opened, with a valid score; once per profile, user and SDK session |
| `alert_opened` | Anonymous or signed in | Inbox row or push tapped; a push needs `actorUid` or `alertId` |
| `campaign_accessed` | Signed in | Campaign link opened while signed in, or held from before a sign-in that Firebase confirmed as an existing account. Never decided by account age |

| Event | Property | Type | Values | Sent |
|---|---|---|---|---|
| `app_opened` | `session_id` | string | SDK session id | If available |
| `profile_completed` | `completion_time_min` | number | Minutes since Auth creation, 1 decimal | If the date is valid |
| `onboarding_step_completed` | `step` | string | `profile_type`, `basics`, `about`, `affiliations`, `interests`, `socials` | Always |
| | `step_number` | integer | 1 to 6, in that order | Always |
| | `skipped` | boolean | `true` when it ended without content | Always |
| | `profile_type` | string | `personal`, `professional` | `profile_type` step |
| | `item_count` | integer | Total | `affiliations`, `interests`, `socials` |
| | `catalog_count`, `custom_count` | integer | Parts of the total | `affiliations`, `interests` |
| | `manual_count` | integer | Manual links | `socials` |
| | `verified_count` | integer | Verified networks | `socials`, if known |
| `social_linked` | `social_platform` | string | `linkedin`, `instagram`, `facebook`, `youtube`, `x`, `tiktok`, `snapchat`, `website` | Always |
| | `link_type` | string | `manual`, `verified` | Always |
| | `profile_type` | string | `personal`, `professional` | Always |
| `match_social_tapped` | `social_platform` | string | As in `social_linked` | Always |
| | `match_score` | number | 0 to 100 | If known |
| | `match_score_range` | string | `low` [0,50), `medium` [50,75), `high` [75,100] | If known |
| | `open_result` | string | `opened`, `invalid`, `failed`; only whether the OS accepted the link | Always |
| `foreground_location`, `background_location` | `granted` | boolean | | Always |
| | `trigger` | string | `request`, `state_change` | Always |
| `visibility_changed` | `enabled` | boolean | | Always |
| `discovery_opened` | `load_time_sec` | number | Seconds, 1 decimal | Always |
| | `people_shown` | integer | Results of that load, before text filters | Always |
| `profile_viewed` | `match_score`, `match_score_range` | number, string | As above | If known |
| `match_made` | `match_score`, `match_score_range` | number, string | As above | Always |
| | `presented_in` | string | `nearby_list`, `discovery_profile` | Always |
| | `session_id` | string | SDK session id | If available |
| `alert_opened` | `source` | string | `push`, `inbox` | Always |
| | `alert_id` | string | `data.alertId` of the push | Push that carries it. None does yet |
| `campaign_accessed` | `campaign_source`, `campaign_name`, `campaign_content`, `campaign_tool` | string | Safe tokens, up to 64 characters | Those present in the link |
| | `attribution_method` | string | `custom_scheme`, `app_link` | Always |
| `signup_completed`, `acquisition_attributed` | `signup_source`, `signup_campaign`, `signup_content`, `signup_tool` | string | Safe tokens, up to 64 characters | Those present in the evidence |
| | `attribution_method` | string | `custom_scheme`, `app_link`, `install_referrer` | Only with evidence; never `organic` or `unknown` |

Renamed for the shared contract, with no old name sent alongside: `step_name` is `step`, `score` is
`match_score`, `connection_type` is `link_type`.

### Person properties (active mode)

The person id is the Firebase UID, unprefixed. A confirmed empty value is sent explicitly (`[]`, `null`). An
unknown one is never written as empty. See "Changing mode" for what happens to its stored value.

| Property | Type | Values | Source |
|---|---|---|---|
| `email` | string | | Auth, then document |
| `platform` | string | `Android` | Build |
| `app_version` | string | | Build |
| `profile_type` | string | `personal`, `professional` | Active mode |
| `occupation` | string or null | | `profiles.<active mode>.occupation` only |
| `languages` | string[] | Language codes | `languageCodes` |
| `country_birth` | string or null | Upper-case ISO alpha-2 | `birthCountryCode`; Product treats origin as birth |
| `country_live` | string or null | Upper-case ISO alpha-2 | `currentCity.countryCode`; never GPS or IP |
| `age_range` | string or null | `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`; `null` under 18 | `birthDate` |
| `interests`, `affiliations` | string[] | Stable catalog or provider ids | Active mode |
| `interests_custom`, `affiliations_custom` | string[] | Original custom text | Active mode |
| `interests_custom_normalized`, `affiliations_custom_normalized` | string[] | Trim, collapsed spaces, lowercase | Active mode |
| `interests_count`, `interests_catalog_count`, `interests_custom_count` | integer | Real totals; same for `affiliations_*` | Active mode |
| `social_platforms_manual` | string[] | Valid links of the mode, Website included; `custom` for any custom network | Active mode |
| `social_platforms_verified` | string[] | `instagram`, `tiktok`, `x`, `youtube` | Confirmed Identity reads |
| `socials_connected` | string[] | Union of both | Only when both are known |
| `has_socials` | boolean | | Only when both are known |
| `foreground_location_granted`, `background_location_granted` | boolean | | Current permission |
| `is_test_user` | boolean | `true`, set_once. **Beta builds only; absent is not `false`** | Build |
| `signup_source`, `signup_campaign`, `signup_content`, `signup_tool` | string | Safe tokens, set_once | Confirmed signup with evidence |
| `attribution_method` | string | `custom_scheme`, `app_link`, `install_referrer`, set_once | Same |

Details:

- A custom id embeds typed text (`custom_music_<slug>_<ts>`), so it never enters `interests` or
  `affiliations`. `*_other` and `*_group_*` are excluded, as in the product's own count.
- Analytics limits: 100 items per list, 120 characters per text. Counts stay real, and the profile is
  never modified. Product limits are 40 characters for a custom interest and 120 for an affiliation.
- A custom social network reports only `custom`; its name is free text.
- Verified status comes from confirmed reads only. A failed read also clears the card, so
  `onConnectedChange` cannot tell "not linked" from "unknown" and is not used.

### Changing mode

Profile documents are never modified or migrated by analytics. For each property of the active mode:

| Properties | State in the document | Action |
|---|---|---|
| `profile_type` | Valid mode | Set |
| `occupation` | Value in `profiles.<mode>` | Set |
| | Only a top-level value | **Unset**: nothing shows which mode wrote it, although the product displays it |
| | Blank string | `null` |
| | No string anywhere | **Unset** |
| `interests*`, `affiliations*` | Modern rows, or an empty list | Set, `[]` and `0` when empty |
| | No list and no legacy rows | Set as empty, as the product reads it |
| | Only legacy rows, which have no stable ids | **Unset**, all six of each family |
| `social_platforms_manual` | Valid or absent bag | Set |
| | Malformed bag | **Unset**, with `socials_connected` and `has_socials` |
| `social_platforms_verified`, `socials_connected`, `has_socials` | All four networks read once (confirmed, failed or rejected) | Set. A failed or rejected network keeps its last confirmed value on this device, or is left out |
| | A network not read yet, **same mode as the last update** | Omitted: the last confirmed value stays |
| | A network not read yet, **another mode or none known** | **Unset**, until the reads finish |
| All of the above | Document without a valid mode | **Unset** only if this device wrote for another mode |
| All | Document could not be read | Nothing changes, `profile_type` included |

`languages`, countries, `age_range` and `email` belong to the account, not to the mode.

- **Unset means "unknown".** The property disappears from the person, and no value stands in for it.
  It is a `$set` event with `$unset`.
- The mode last written is kept per account in local storage (`NEARSY_ANALYTICS_PERSON_MODE:<uid>`), so
  a restart can tell a failed read in the same mode from a switch. If it cannot be read, it counts as a
  switch.
- **Limit:** with two devices, one that still remembers the same mode cannot see a switch and back made
  on the other. If its verified reads also fail, those three properties can stay out of date until a
  read succeeds.
- A switch can make verified networks briefly absent, between the update and the read that follows.

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

- `social_linked` fires on a manual add (no previous value), on an OAuth connect or return, and on
  the first verified Instagram read after a pending one. A local marker keeps that pending state
  across a closed card or a restart. Never on hydration, on editing a link, or while pending.
- Removing and adding again counts as a new connection.
- Verified networks (Instagram, X, YouTube, TikTok), in the profile editor and in onboarding, which mount
  the same cards:
  - A connect attempt leaves a local marker per account, mode and network. If the finalizer fails
    and the following read (reconciliation) confirms the connection, `social_linked` fires once. The
    direct path and the reconciliation share one key, so they never both fire.
  - A read that confirms not connected closes the attempt. Instagram pending reads as not connected
    and keeps its attempt open.
  - A confirmed disconnection updates the person and emits nothing.
  - A failed read, or a rejection such as `*_NOT_ENABLED` (YouTube outside its allowlist), is unknown:
    never a disconnection. It keeps the last confirmed value, remembered per account on the device,
    and does not hide the other networks.
  - Another account starts clean. A read made for an account that is no longer signed in is dropped.
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

**Decided rule.** `match_made` means compatibility discovered, not mutual acceptance. The mobile app
emits it.

- An entry is one mount of `NearbySearchScreen`. Returning from a profile is not an entry.
- `load_time_sec` runs from the start of the attempt that succeeded, after the profile snapshot is
  ready. `people_shown` is the result count of that load, before any text filter. An error is not an
  empty success.
- Fires for a card at least 50% visible, or an opened profile. Results that never appear, and the
  30-second alert polling, do not count.
- Needs a valid score, 0 to 100. Without one there is no `match_made`, because there is no compatibility
  to report. `profile_viewed` and `match_social_tapped` still fire, without a score.
- Ranges: `low` [0,50), `medium` [50,75), `high` [75,100].

**Unit of count:** one profile, per user and per **SDK session**. So:

- A card seen and then opened is one event, and `presented_in` keeps the first place.
- Going back to a profile, a refresh or a rerender do not repeat it. A refresh creates no session.
- `session_id` is the SDK's own. Another session counts the same profile again, so this is **not** a
  count of unique pairs of people.
- Another account on the device starts its own count, under its own person and session.
- Delivery is what the SDK retries. Dedupe lives in the process, so a restart begins a new session anyway.

**Deviation from the plan:** the plan lists `match_id`, and it is not sent. Nothing uses it, and a stable
id would need the other person's UID or a hash of it. That UID is only a local dedupe key and never
leaves the device. iOS and Functions should not expect `match_id` from Android.

### Alerts

- `source=push` needs `actorUid` or `alertId`. `data.alertId` is optional and never fabricated. No push
  sends it yet, so `alert_id` stays absent until Functions adds it.
- `source=inbox` has no id: the inbox id is the other person's UID.
- Cold start now works: the initial response waits until the Home tab is reachable, for up to 5 minutes.
  The tap is claimed by id, so the initial response and the listener cannot process it twice, and a
  tap handled by an earlier run is not replayed.
- Tokens and reminders are unchanged. `alert_sent` belongs to Functions and means accepted by Expo.

### LinkedIn

Exchange may return `accountOutcome` (`created` or `existing`) and `authCreationTimeMs` (Unix
milliseconds, positive integer). Both or none: a missing, partial or invalid pair is unknown and never
changes the login. The pair travels in memory through the browser path and the resumed (cold start) path,
and is reported only after Firebase holds the session. Exchange is not repeated, and the one-use
transaction is untouched.

| Signal | Result |
|---|---|
| `created`, time equal to `metadata.creationTime` of the signed-in user | `$identify`, then `signup_completed` with held acquisition |
| `created`, another time | Unknown: nothing |
| `existing` | No signup; held evidence becomes `campaign_accessed` |
| Absent or invalid (Identity not deployed) | Unknown: nothing; evidence stays held |
| Another account signed in by then | Unknown |

- Times are compared at the precision both sides have: RNFirebase gives milliseconds; a whole-second
  value on either side is compared by second. No window.
- Dedupe is per UID and creation time, so a recreated account with the same UID counts again.

### Attribution

- Allowlist: `utm_source`, `utm_campaign`, `utm_content`, `nearsy_tool` or `utm_tool`. Values must be
  safe tokens of up to 64 characters.
- A URL with an OAuth parameter (`code`, `state`, `token`, `transactionId`, `result`, ...) is ignored
  entirely. Only the fields go to temporary storage, never the URL.
- Expiry: 7 days, set with `NEARSY_ATTRIBUTION_EXPIRY_HOURS`.
- The real result of authentication decides, never the age of the account:

| Situation | Result |
|---|---|
| Link opened signed out | Held, up to the expiry |
| Then signup confirmed (`isNewUser === true`, or email account created) | `signup_completed` carries `signup_*` and `attribution_method`; same values as person set_once |
| Then sign-in confirmed as existing (`isNewUser === false`, or email and password) | `campaign_accessed`; acquisition untouched |
| Then sign-in with no result (LinkedIn today, or a restored session) | Nothing classified; the evidence stays held |
| Link opened signed in | `campaign_accessed`: the account existed before the link |
| Install referrer, signed in, no signup of this account on this device | Dropped: it describes an earlier install |
| Evidence older than a signup of this account on this device that had no acquisition | `acquisition_attributed` with `signup_*`, and person set_once. No new `signup_completed` |
| That signup already had an acquisition | Never replaced. A link becomes `campaign_accessed`; the referrer is dropped |

"Older" means when the evidence came to exist: the launch of the process for the link that opened the app,
the install for the referrer, the arrival for any other link. A link opened after the signup is never
acquisition. The signup record is local, per account, and lasts as long as the attribution expiry.
- `organic` and `unknown` are never written, so later evidence is not blocked. `utm_medium=organic`
  from Play is not treated as evidence.
- Reading a link does not consume it, so LinkedIn and ownership OAuth are unaffected.

Sources:

| Source | State |
|---|---|
| `nearsy://campaign?...` | Parser and rules tested. Only reaches people who **already have the app installed**: a custom scheme does not survive an install |
| App Links | Configuration only. No filter exists until `NEARSY_APP_LINKS_HOST` and `NEARSY_APP_LINKS_PATH_PREFIX` are set, and no domain or `assetlinks.json` exists. `/` alone is rejected |
| Install Referrer | Parser and rules tested with synthetic strings. Off until `NEARSY_ATTRIBUTION_INSTALL_REFERRER=true`, which the `beta` profile does not set. Read once per install. **Never run against a real Play install**, so it is not validated attribution after install |

Real coverage today: a signed-out person who already has the app, opens a `nearsy://campaign` link and
signs up on that device within 7 days. Acquisition of people without the app needs App Links or the
referrer, and neither is validated.

## Pending and external

| Item | Owner | Needed |
|---|---|---|
| Domain and App Links | Product | Choose host and path, publish `/.well-known/assetlinks.json` with the **Play App Signing** SHA-256 (Play Console, App integrity), and a landing page for users without the app |
| LinkedIn signal deployed | Identity | Exchange must send `accountOutcome` and `authCreationTimeMs`. Until then LinkedIn signs in with no `signup_completed`, and held acquisition stays held |
| Account recreation | Identity and iOS | No permanent dedupe by UID is used here, and the iOS report differs. A recreated account counts as a new signup |
| `data.alertId` on push | Functions | Optional field |
| `event_cohort` | Server | Assigned by venue and window, not by link or date. The app does not send it |
| Beta activation | Product | Authorize; create `NEARSY_POSTHOG_TOKEN` in EAS; confirm the token is project 716015; confirm the Play service account and the internal testers |
| Marketing filters | Marketing | Exclude `is_test_user = true` and keep absent values; do not filter on `false` |

Out of scope: gender, seniority, industry, monetization, backfills, new Firestore rules or fields.

## Unrelated hypothesis: Home, return from Settings

**Pending reproduction. Not confirmed, not run, not fixed here, and not a blocker for PostHog.**

Flow: Home, background visibility on, Android needs the Settings screen for that permission. The app
sets `pendingBgEnableFromSettingsRef` and opens Settings
(`packages/shared/src/screens/MainHomeScreen.tsx:388`, `:412`). The user grants it and returns.

Suspicion: on return, the AppState handler has `if (!pendingVisibilityIntentRef.current) return;` at line
1128, before the block that handles that ref at line 1154. With no pending visibility intent, that block
would never run, so `bgVisible` would not be saved, even with the permission granted.

To reproduce: visibility already on, background permission not granted, turn background on, grant
"Allow all the time" in Settings, return. Then check whether the switch and `users/{uid}.bgVisible` update.

## Limitations

- "Only once" is per process, and delivery is what the SDK retries. Count unique people.
- Email signup fires once the Auth account exists, even if the later profile write fails.
- `completion_time_min` is elapsed time since Auth creation, not active time.
- A cold-start tap waits for Home. If that never happens within 5 minutes, it is neither opened nor counted.
- A tap claimed before auth restored has no owner, so it opens for whoever signs in within those 5
  minutes. A tap claimed while signed in is dropped if another account takes over.
- `session_id` in `inspect` mode is a stand-in, not an SDK session.

## QA on a physical Android device

Nothing in this part sends data remotely. It is optional before Beta, and useful to find problems
early. On the development Firebase, with `nearsy-dev` test accounts:

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
| SDK | Start | `/array/.../config` line, then `/batch/`; no external traffic |
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
| Person | Switch personal and professional, with data in each | Person update with the new mode's values; `unset=[...]` only for what is unknown |
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
| Match | Card seen, then open that profile | Still one `match_made` |
| Match | Return, refresh | No multiplied events; same session |
| Profile | Open, go to the gallery, return | One `profile_viewed` |
| Social tap | Tap a network | `match_social_tapped` with `open_result` |
| Alerts | Tap an inbox row | `alert_opened`, `inbox` |
| Alerts | Tap a push, app open | `alert_opened`, `push`; profile opens |
| Alerts | Tap a push, **app closed** | Profile opens once; one event |
| Alerts | Tap a push, restart without tapping | No replay |
| Campaign | `adb shell am start -a android.intent.action.VIEW -d "nearsy://campaign?utm_source=qa"`, then sign up | `signup_source` on the person |
| Campaign | Same link signed out, then sign in with an existing account | `campaign_accessed`; no `signup_*` |
| Campaign | Same link signed in | `campaign_accessed` |
| OAuth | Complete LinkedIn login | Works as before; no campaign data |
| Identity | Logout; A then B | `reset` before the next `$identify` |
| Privacy | Any line | No email, occupation, custom text, UID or token |

### After activation: Beta on Google Play

This is the first run with the native SDK and with PostHog answering. It needs the authorization and
the build of "Beta". In PostHog, activity of project 716015, filtered by `distribution_channel = beta`:

| Step | Expected |
|---|---|
| Open the app signed out | `app_opened`, anonymous, with both marks and `environment=production` |
| Sign in with the test account | `$identify` with the real UID; person has `is_test_user=true` |
| Sign out, sign in with a second test account | Two persons; no data crossed; both marked |
| Airplane mode, use the app, reconnect | Queued events arrive |
| Close the app, reopen, check `app_version`, `app_build` | Real values of the Play build |
| Any screen | No `$screen`, `Application Opened`, `$exception` or `$push_*` events |
| Person of that account, with the property already `true`: use a production install | Stays `true`; events there have no marks |
| Device logs | No `[analytics:transport]` with `batch_rejected`; no `[analytics] off:` line |

If `[analytics] off: firebase_environment_mismatch` appears, the runtime project check did not see
`nearsy-pj`; that read has only been checked by code, never on a device.

### Dev Client

- **Installed client:** enough for `inspect` and `sdk_intercept`, if it includes `expo-application`.
  The SDK is JavaScript only and runs in memory here. Check that the first lines show `app_version`.
- **New build needed:** App Links (a manifest change), and `beta` and `remote`, whose settings are
  fixed at build time. Install Referrer only if the installed client lacks `expo-application`.

## Tests

From `packages/shared`:

```bash
node --experimental-strip-types --test --test-force-exit src/analytics/__tests__/analyticsFoundation.test.ts src/analytics/__tests__/analyticsTrackingPlan.test.ts src/analytics/__tests__/analyticsRealSdk.test.ts src/analytics/__tests__/analyticsBetaTransport.test.ts src/analytics/__tests__/analyticsBetaBuild.test.ts
```
