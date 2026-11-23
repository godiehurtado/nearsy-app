# Android: AppsFlyer OneLink (contract nc1)

Status: implemented on `feature/android-appsflyer` from `origin/develop-android` `70f9e1b`.
AppsFlyer is enabled only in the EAS profile `beta-appsflyer`: Beta on production Firebase, for Google
Play Internal Testing. That profile has not been built. Every other profile, the public production
profile included, leaves it off.

Contract nc1 was agreed between the Android and iOS sessions on 2026-11-21. Owner direction the same
day: navigation scope `home`, `profile`, `alerts`, no parameters, after authentication and the CRJ.
Navigation, acquisition and campaign access stay separate. The current terms stand (Owner,
2026-11-22): 30 min for direct navigation, 24 h for deferred navigation, and 7 days to keep a campaign
captured before signup. **The priority between campaigns is still pending approval.**

Nothing has been validated on a device.

## Configuration

| Item | Value |
|---|---|
| Package | `com.nearsy.app` |
| OneLink | `https://nearsy.onelink.me/Uxo6` (template `Uxo6`) |
| URI-scheme fallback | None |
| SDK | `react-native-appsflyer` 7.0.4 (Android SDK 7.0.4, New Architecture TurboModule) |
| Enable | `NEARSY_APPSFLYER_ENABLED=true` plus `NEARSY_APPSFLYER_DEV_KEY` (EAS variable with visibility Sensitive; never in Git, never printed). An EAS build that has the flag but no valid key fails |
| Disabled build | Identical to builds before the integration. The native module is not linked (`apps/nearsy-android/react-native.config.js`), so the build has no SDK, no OneLink intent filter, no MainActivity change, no backup-rule change and no dev key in its config. The flag must also be set at Gradle time, as EAS does |
| Enabled build, manifest | SDK 7.0.4 declares `INTERNET`, `ACCESS_NETWORK_STATE`, `AD_ID` (removed by `withFacebookPrivacyHardening`), `com.samsung.android.mapsagent.permission.READ_APP_INFO` (removed by `appsflyerConfig.js`) and its own Auto Backup rules. Those rules are merged with expo-secure-store's into `nearsy_backup_rules` / `nearsy_data_extraction_rules`: shared preferences only, with `SecureStore` and AppsFlyer state excluded |

## nc1: shared table (identical on Android and iOS)

Final on both platforms (2026-11-21): Android `feature/android-appsflyer` (godiehurtado/nearsy-app#125)
and iOS `feature/ios-appsflyer-onelink` `b2a3d8a` (godiehurtado/nearsy-app#124). Both carry this same
text. Closing nc1 still needs the Owner to approve the priority between campaigns.

| Area | Rule |
|---|---|
| Parameters read | Only `deep_link_value` and `deep_link_sub1..5`: sub1 source, sub2 campaign, sub3 content, sub4 tool, and sub5, which must be exactly `nc1`. Everything else (`pid`, `c`, `af_*`, `media_source`, `campaign`) is ignored |
| Value validation | Slug `^[a-z0-9][a-z0-9._-]{0,63}$` after lowercasing. `organic`, `unknown`, `none`, `null` and `undefined` are refused. An invalid field is dropped on its own; a touch needs a source or a campaign. If sub5 isn't `nc1`, nothing is attributed (navigation is still allowed) |
| OAuth guard | A payload with `code`, `state`, `token`, `access_token`, `id_token`, `refresh_token`, `transactionId`, `transaction_id`, `result`, `error` or `mode` is dropped whole: no attribution and no navigation. Keys are compared case-insensitively |
| Confirmed touch | A direct UDL result (`is_deferred=false`) is `onelink_direct`. A deferred one with `match_type=referrer` is `onelink_deferred`. An unknown `is_deferred` counts as deferred |
| Probabilistic deferred | Never attributed, not even as `campaign_accessed`, and there is no "estimated" value. The destination is still honored (navigation only) |
| Before signup | A confirmed touch with no session is kept as pending attribution for 7 days; the last touch wins until signup (priority pending Owner approval) |
| Acquisition at signup | `signup_completed` carries `signup_source`/`campaign`/`content`/`tool` plus `attribution_method` when the pending touch was captured before the account was created, on this install, and no other account on this install has claimed acquisition. Sent as `$set_once`; never overwritten |
| Late evidence | `acquisition_attributed` is sent only when all of these hold: the touch was captured before Firebase `creationTime`; the account was created after the install marker; it's the first account on this install to claim (otherwise nothing is sent); no acquisition is recorded yet; and it's ≤ 24 h since creation. The 24 h is a cap, never evidence by itself |
| Campaign access | A **direct** touch opened with a session, after account creation, or by an existing account becomes `campaign_accessed` with `campaign_source`/`name`/`content`/`tool` plus `attribution_method`. Acquisition is untouched. A **deferred** touch for an account that already existed is dropped, because it describes an install |
| Deduplication | The same source/campaign/content/tool, direct or deferred, within 10 min counts once. Navigation: the same key isn't consumed twice within 10 min |
| Account switch | A touch is classified for the account signed in when it arrives and never moves to another account. A touch from a signed-out session goes to the first account that signs in or up. A destination captured with account A is discarded when B signs in; a real sign-out clears it |
| Navigation | `home` → Home tab, `profile` → own Profile tab, `alerts` → Alerts tab. No parameters. One pending destination; the last one wins. Consumed once by the signed-in account when the main tabs are focused (after login, OAuth and the CRJ). Expiry (accepted): 30 min direct, 24 h deferred. Never sent to analytics |
| Privacy | No customer user ID, no in-app events, no ATT or consent prompt, no clipboard, no advertising IDs. Partner sharing filter: `all`. SDK debug is off on every build, nearsy-dev included. The PostHog mapping applies only when PostHog is on |
| Switch | `NEARSY_APPSFLYER_ENABLED=true` in the profile plus the sensitive EAS variable `NEARSY_APPSFLYER_DEV_KEY`. Off means the SDK isn't linked |

### Deliberate platform differences

| Topic | Android | iOS |
|---|---|---|
| Install marker | The package manager's first install time (survives Auto Backup restores) | Local marker written at the first analytics launch |
| Deterministic deferred | Play Install Referrer (`match_type=referrer`) | None: every deferred match on iOS is probabilistic |
| Conversion-data listener | Fallback with the same rules when UDL found no deferred link | Not registered |
| SDK input | App Links for the same host and path. `setIntent()` is called only for a OneLink; OAuth returns are excluded | Only https Universal Links on `nearsy.onelink.me/Uxo6`, filtered in AppDelegate; never openURL or launch options |
| Cold start from a non-OneLink URL | AppsFlyer is skipped for that process | AppDelegate never forwards it; the SDK still starts |
| Build with AppsFlyer off | Not linked (`react-native.config.js`) | Unlinked (`react-native.config.js`) |
| Extras | Merged backup rules; Samsung `READ_APP_INFO` removed; also `setDisableNetworkData(true)`, `disableAppSetId()`, `setCollectAndroidID(false)` | Podfile strict mode |

### iOS deferred attribution limits (as reported by iOS)

iOS has no deterministic deferred match: without ATT/IDFA (Nearsy never prompts), a deferred OneLink
match on iOS is probabilistic. As a result, under nc1:

- an iOS install from a OneLink never yields `onelink_deferred`, and no acquisition is attributed;
- the destination of that deferred link still applies, for navigation only;
- iOS acquisition through OneLink exists only when a direct link (Universal Link, app already
  installed) is opened before signup.

iOS OneLink acquisition numbers are therefore a lower bound, and they can't be compared with
Android's.

### PostHog mapping and outcomes

| Field | PostHog (acquisition / access) |
|---|---|
| `deep_link_sub1` | `signup_source` / `campaign_source` |
| `deep_link_sub2` | `signup_campaign` / `campaign_name` |
| `deep_link_sub3` | `signup_content` / `campaign_content` |
| `deep_link_sub4` | `signup_tool` / `campaign_tool` |
| `deep_link_value` | none (navigation only) |

| Outcome | PostHog |
|---|---|
| Confirmed acquisition | `signup_completed` with `signup_*` plus `attribution_method` and person set_once; or `acquisition_attributed` if it lands after signup |
| Campaign access | `campaign_accessed` with `campaign_*` plus `attribution_method`; never touches acquisition |
| Navigation | None; it has a separate store |

`attribution_method` gains `onelink_direct` and `onelink_deferred`. Android keeps `app_link`,
`custom_scheme` and `install_referrer`; iOS has `universal_link`.

### Deferred: UDL first, conversion data as fallback (Android)

UDL is the source. Conversion data is read only if UDL found no deferred link on that launch: UDL has
a 15-minute lookback and may not fire for SRN clicks. The fallback applies the same rules plus
`is_first_launch = true`, `af_status = Non-organic` and not retargeting. A flag makes sure only one of
the two acts.

### Android destinations

| Key | Android target |
|---|---|
| `home` | `MainTabs` → `Home` → `MainHome` |
| `profile` | `MainTabs` → `Profile` → `CompleteProfile` (own profile) |
| `alerts` | `MainTabs` → `Alerts` |

`useOneLinkDestination` runs inside `RootTabs`, which only mounts after the profile gate (onboarding,
phone and CRJ complete).

## OAuth and other URLs

- `MainActivity` is `singleTask`, and React Native doesn't call `setIntent()`. The config plugin adds
  an `onNewIntent` that calls `setIntent()` **only** for `https://nearsy.onelink.me/Uxo6...`. As a
  result, the SDK never sees LinkedIn, TikTok, YouTube or X returns (`nearsy://...`) as the activity
  intent.
- A cold start whose launch URL isn't a OneLink skips AppsFlyer for that whole process.
- `performDeepLinking` is called only with a OneLink (on a cold start, after `start()`); its second
  delivery is dropped by the 10-minute dedupe.
- The JS campaign parser ignores the OneLink host, so a OneLink is never counted by both paths.
- **Open:** Facebook Login returns through its own activity (`fb<app id>://`). AppsFlyer's SDK is
  closed source, so whether it reads other activities' intents has to be checked with a traffic
  capture on the next authorized binary.

## Privacy

Before `start()`, on every launch, the binding calls:

- `setDisableAdvertisingIdentifiers(true)`
- `setCollectAndroidID(false)`
- `setDisableNetworkData(true)`
- `disableAppSetId()`
- `setSharingFilterForPartners(['all'])`

`withFacebookPrivacyHardening` keeps removing the `AD_ID` permission that the SDK declares
(`tools:node="remove"`). There is no customer user ID, no in-app events, no clipboard, no S2S and no
SDK debug.

## Signing and App Links

| Binary | Signer SHA-256 | Opens OneLink as a verified App Link |
|---|---|---|
| Installed from Google Play (Internal Testing included) | Play App Signing key: Play re-signs the AAB. This is the key registered in AppsFlyer | Yes |
| EAS AAB as uploaded (`production`/`beta`/`qa`; verified on 2.1.0 (55)) | Upload key `23:42:4B:0D:90:D7:6E:AE:B6:B0:7B:83:9C:8C:8F:B3:85:91:26:31:4C:3B:67:7B:C2:32:38:E0:D0:99:35:C7` | Not applicable: devices never install the uploaded AAB, only Play's re-signed version |
| Local test APK (`nearsy-android-2.1.0-nearsy-dev-70f9e1b.apk`) | Expo template debug key `FA:C6:17:45:…:91:03:3B:9C` | No (never register a public debug key) |

With distribution through Play Internal Testing, the effective signature is Play App Signing's, which
is already in AppsFlyer. No extra fingerprint is needed. To check:

- before uploading, `keytool -printcert -jarfile <aab>` must show `23:42:…:C7`;
- on the installed app, `adb shell pm get-app-links com.nearsy.app` must show `nearsy.onelink.me`
  as `verified`.

## Next build: profile `beta-appsflyer`

The Owner confirmed it directly on 2026-11-22: a Beta build against **production Firebase**, using the
existing PostHog configuration for Beta. Nothing is sent from nearsy-dev.

| Item | Value |
|---|---|
| Profile | `beta-appsflyer`: extends `beta` and adds only `NEARSY_APPSFLYER_ENABLED=true` |
| Firebase / Functions | `NEARSY_FIREBASE_ENV=production` → **nearsy-pj**, `us-central1` |
| App Check | Play Integrity (production), unchanged |
| EAS environment | `production` |
| PostHog | Existing Beta channel: every event and person carries `is_test_user: true`, and every event `distribution_channel: "beta"`; generation-id cutover `1794787200000`, the same as production |
| Version | 2.1.0. The remote versionCode is 55 today, so the build would be **56** (`autoIncrement`) |
| Artifact | AAB (`app-bundle`), `store` distribution |
| Submit profile | `beta-appsflyer` extends `beta`: Play `internal` track, release as draft. EAS Submit isn't used today (no Play service account); the upload is manual |

**This build classifies every user as Beta: it goes to Internal Testing only and must never be promoted
to closed testing, open testing or production.**

### Distribution through Google Play Internal Testing (prepared, not executed)

Each step needs its own authorization.

1. **Build:** `eas build --platform android --profile beta-appsflyer`, once `NEARSY_APPSFLYER_DEV_KEY`
   exists in `production` and the CRJ hotfix is live in nearsy-pj.
2. **Check the AAB:** run `keytool -printcert -jarfile` for the upload key; confirm `versionCode` 56 and
   the OneLink intent filter in the AAB's manifest.
3. **Manual upload** to Play Console → Testing → Internal testing, as with 2.0.9 (46/47) and 2.1.0
   (52–55). Release notes say "Beta AppsFlyer; do not promote".
4. **Testers:** the Owner's named test accounts are added to the internal testers list. Each tester
   accepts the opt-in link with the Google account of the phone.
5. **Install from Play.** This is the only way to get the Play Install Referrer, which a deterministic
   deferred match (`onelink_deferred`) needs.

### Referrer test (deferred install)

1. Uninstall Nearsy from the phone (the tester stays opted in).
2. Open a nc1 OneLink, for example `https://nearsy.onelink.me/Uxo6?deep_link_value=profile&deep_link_sub1=<source>&deep_link_sub2=<campaign>&deep_link_sub5=nc1`.
   OneLink sends the phone to Play, which opens the internal-testing version.
3. Install it, open it, sign up (new account) and complete the CRJ.
4. Expected:
   - the `profile` destination opens after the CRJ;
   - `signup_completed` carries `signup_*` and `attribution_method=onelink_deferred` (if AppsFlyer
     reports `match_type=referrer`);
   - otherwise nothing is attributed, and only the navigation happens.

Whether Play passes the referrer for an internal-testing install still has to be confirmed on a device.

### Test users and events in PostHog

| Where | Mark |
|---|---|
| Every event | `is_test_user: true`, `distribution_channel: "beta"`, `environment: "production"`, `platform: "Android"`, `app_version: "2.1.0"`, `app_build: "56"` |
| Person | `is_test_user: true` (never unset); distinct id = UID, or a generation id per the cutover |
| Test accounts | The Owner's named accounts, in nearsy-pj; never Diego's affected account. UIDs go in the private test log, never in Git or chat |

In PostHog, filter by `app_build = 56`, `distribution_channel = beta` and the test accounts.

| Case | Expected |
|---|---|
| Deferred install from Play (referrer) → new account | `signup_completed` with `signup_*` + `onelink_deferred`; person `signup_*` set once |
| Direct OneLink signed out → new account | `signup_completed` with `onelink_direct` |
| Direct OneLink with a session, or an existing account | `campaign_accessed` with `campaign_*` + `onelink_direct`; acquisition unchanged |
| Referrer that arrives after the signup (≤ 24 h, first account on the install) | `acquisition_attributed`, no new `signup_completed` |
| Second account on the same install | Nothing attributed |
| Same link twice within 10 min | One event |
| `deep_link_sub5` other than `nc1` | No attribution; navigation only |
| Link with an OAuth key | Nothing at all |
| Any destination | No event carries `deep_link_value` |

### Configuration in EAS (checked by name only, no values read, 2026-11-22)

| EAS variable (`production` environment) | State |
|---|---|
| `NEARSY_APPSFLYER_DEV_KEY` | **Missing.** Without it the build fails on purpose |
| `NEARSY_POSTHOG_TOKEN` | Present (the existing Beta configuration) |
| `EXPO_PUBLIC_FACEBOOK_APP_ID` / `_CLIENT_TOKEN`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY` | Present |

### CRJ hotfix in production

The hotfix is Functions `531131b` (PR #47). As of 2026-11-21, `activateVisibility` and
`setActiveProfileMode` in **nearsy-pj** are still on their 2026-11-14 revisions: **not deployed**. In
nearsy-dev it has been live since 2026-11-21 15:50Z. The Functions session reports that it is ready for
nearsy-pj, waiting for the Owner's authorization.

A Beta build on nearsy-pj without the hotfix would reproduce the incident for accounts with no stored
mode. The build should wait until the deploy is confirmed. The Android client needs no change.

## Report

### Local validations done

- `src/__tests__/androidAppsFlyerOneLink.test.ts`: 32 cases with synthetic payloads. They cover:
  - URL matching, values, UDL direct and deferred, the conversion fallback;
  - C4 evidence (cap from creation), the install claim, the shared dedupe key, destinations;
  - the build config, the MainActivity injection, the backup-rule merge, native linking by flag;
  - `beta-appsflyer` (the only profile that enables AppsFlyer; equal to `beta` apart from the switch;
    production never enables it; submit to internal);
  - the real `app.config.js` with that profile: nearsy-pj, Beta capture, the OneLink filter.
- The analytics config, contract, build plugin and Beta tests are back to the base `70f9e1b` byte for
  byte: the nearsy-dev QA mode is gone, and the existing protections are untouched.
- Analytics suites: 299/299. Full `packages/shared` suite: 2350 tests, 27 failures, the same failing
  files as on the base `70f9e1b`. `tsc --noEmit`: 0 errors. `check:metro-imports`: 0 problems.
- Prebuild with AppsFlyer on (synthetic key): the OneLink filter has `autoVerify`; `onNewIntent` is
  injected. Gradle `processReleaseMainManifest` and `compileReleaseKotlin` pass, and the merged
  manifest has no `AD_ID` and no Samsung permission. With AppsFlyer off, the prebuild is identical to
  the base. No APK or AAB was produced.

### Tests that need a device (build 56 from Internal Testing, authorized)

- `pm get-app-links`: `nearsy.onelink.me` verified with Play's signature.
- Direct OneLink with the app closed or open, signed out or in, before and after the CRJ: `home`,
  `profile` and `alerts`.
- Deferred install from Play with the referrer, and late evidence.
- Account switch and sign-out with a pending destination; 30 min expiry for direct links.
- The PostHog events in the table, with test accounts.
- Traffic capture: the SDK never receives LinkedIn, TikTok, YouTube, X or Facebook (`fb<id>://`)
  returns.
- Physical CRJ, Personal and Professional (pending; needs the hotfix in nearsy-pj).

None of this is done. The Device Farm binaries (2.1.0 (55)) and the local nearsy-dev APK don't include
AppsFlyer, and no result for this integration is attributed to them.

### Missing configuration (before the build, no code change)

- `NEARSY_APPSFLYER_DEV_KEY` (Sensitive) in the EAS `production` environment. The public `production`
  profile doesn't enable AppsFlyer, so it never carries the key.
- The CRJ hotfix deployed in nearsy-pj (Owner authorization).
- The internal testers list with the named accounts.

### Changes that would require rebuilding

- Any change to nc1 (parameters, OAuth keys, destinations, expiries, dedupe, priority between
  campaigns).
- Changing the Firebase environment or the PostHog channel of the profile.
- An EU consent manager, if one is added.
- Enabling AppsFlyer in the public production profile.

### Other items, no rebuild needed

- Approval of the priority between campaigns, then closing nc1.
- Google Play Data safety and the privacy policy, before any public release with AppsFlyer.
- Separate from this PR: EAS builds of `development-nearsy-dev` can't find their Firebase file. It
  exists only as the EAS file variable `GOOGLE_SERVICES_JSON_DEV`, and `app.config.js` doesn't read it.
