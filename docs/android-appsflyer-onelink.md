# Android: AppsFlyer OneLink (contract nc1)

Status: implemented on `feature/android-appsflyer` from `origin/develop-android` `70f9e1b`.
AppsFlyer is enabled only in the EAS profile `appsflyer-nearsy-dev` (nearsy-dev). That profile has not
been built. Every other profile, production included, leaves it off.

Contract nc1 was agreed between the Android and iOS sessions on 2026-11-21. Owner direction the same
day: navigation scope `home`, `profile`, `alerts`, no parameters, after authentication and the CRJ.
Navigation, acquisition and campaign access stay separate. Expiries of 30 min (direct) and 24 h
(deferred) were **accepted** by the Owner on 2026-11-21.

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
text. The Owner has accepted the expiries; closing nc1 still needs the Owner to approve this full table.

| Area | Rule |
|---|---|
| Parameters read | Only `deep_link_value` and `deep_link_sub1..5`: sub1 source, sub2 campaign, sub3 content, sub4 tool, and sub5, which must be exactly `nc1`. Everything else (`pid`, `c`, `af_*`, `media_source`, `campaign`) is ignored |
| Value validation | Slug `^[a-z0-9][a-z0-9._-]{0,63}$` after lowercasing. `organic`, `unknown`, `none`, `null` and `undefined` are refused. An invalid field is dropped on its own; a touch needs a source or a campaign. If sub5 isn't `nc1`, nothing is attributed (navigation is still allowed) |
| OAuth guard | A payload with `code`, `state`, `token`, `access_token`, `id_token`, `refresh_token`, `transactionId`, `transaction_id`, `result`, `error` or `mode` is dropped whole: no attribution and no navigation. Keys are compared case-insensitively |
| Confirmed touch | A direct UDL result (`is_deferred=false`) is `onelink_direct`. A deferred one with `match_type=referrer` is `onelink_deferred`. An unknown `is_deferred` counts as deferred |
| Probabilistic deferred | Never attributed, not even as `campaign_accessed`, and there is no "estimated" value. The destination is still honored (navigation only) |
| Before signup | A confirmed touch with no session is kept as pending attribution for 7 days; the last touch wins until signup |
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
| Play-distributed (store, internal testing) | Play App Signing key (registered in AppsFlyer) | Yes |
| EAS artifacts (`production`/`beta`/`qa` AABs, verified on 2.1.0 (55)) | Upload key `23:42:4B:0D:90:D7:6E:AE:B6:B0:7B:83:9C:8C:8F:B3:85:91:26:31:4C:3B:67:7B:C2:32:38:E0:D0:99:35:C7` | Only if this fingerprint is also registered |
| EAS internal APK (`appsflyer-nearsy-dev`) | **Expected** to be the same upload key. Every profile uses EAS remote credentials (no `credentials.json`, no `credentialsSource` override), and EAS has one Android keystore per application. **Not verified:** EAS holds no internal APK whose artifact still exists. The only one, `development` 1.0.17 (28) from 2026-07-21, has expired (404) | Same as above |
| Local test APK (`nearsy-android-2.1.0-nearsy-dev-70f9e1b.apk`) | Expo template debug key `FA:C6:17:45:…:91:03:3B:9C` | No (never register a public debug key) |

Once the build exists, before installing it, confirm the effective signature with
`apksigner verify --print-certs <apk>`. The SHA-256 must be `23:42:…:C7`. If it differs, register that
fingerprint in the OneLink template before the device tests. On the device, check
`adb shell pm get-app-links com.nearsy.app`: `nearsy.onelink.me` must show `verified`.

Note: the two earlier EAS builds of `development-nearsy-dev` (2.0.2 (32) and 2.0.5 (35)) ended with
errors. Their logs weren't reviewed. The missing Firebase file, now fixed, is the likely cause.

## Next build: profile `appsflyer-nearsy-dev`

| Item | Value |
|---|---|
| Profile | `appsflyer-nearsy-dev`: extends `development-nearsy-dev` with `developmentClient: false`, internal `apk` distribution |
| Firebase / Functions | `NEARSY_FIREBASE_ENV=development` → **nearsy-dev**, `us-central1`. The CRJ hotfix is live there |
| App Check | Debug provider, the same as `development-nearsy-dev` (`NEARSY_DEV_CLIENT=true`); production keeps Play Integrity. The device's debug token must be registered in nearsy-dev |
| EAS environment | `development` |
| PostHog | **QA mode** (`NEARSY_ANALYTICS_QA_ENABLED=true`): real SDK, network to the single PostHog project (716015, US host), with every event and person marked as a test. See below |
| AppsFlyer | `NEARSY_APPSFLYER_ENABLED=true` |
| Firebase file | `GOOGLE_SERVICES_JSON_DEV` (EAS file variable, `development`, visibility Secret). `app.config.js` reads its path for nearsy-dev only |

### PostHog QA mode (real path, test-marked)

Before this change, a nearsy-dev binary could never send to PostHog: capture was reserved for
nearsy-pj. The new `qa` mode is fail-closed. It runs only when every condition holds:

- the build declares `NEARSY_ANALYTICS_QA_ENABLED=true`, with nearsy-dev Firebase and no other capture
  mode (two modes at once means everything is off);
- at runtime, the extras and the initialized Firebase app are both `nearsy-dev`, and the JS bundle is a
  release (`__DEV__` false);
- the token `NEARSY_POSTHOG_TOKEN` is valid. A build without it fails on the EAS worker.

It can never be active on nearsy-pj, so real users can't be counted.

**Identification:**

| Where | Mark |
|---|---|
| Every event | `is_test_user: true`, `distribution_channel: "qa"`, `environment: "development"`, `platform: "Android"`, `app_version`, `app_build` |
| Person | `is_test_user: true` (never unset); distinct id = nearsy-dev UID |
| Test accounts | Dedicated nearsy-dev accounts created for the session; never Diego's affected account. Their UIDs go in the private test log, never in Git or chat |

In PostHog, filter by `distribution_channel = qa` and the build's `app_build`. The internal test filter
(`is_test_user`) excludes these events from real metrics, exactly as it does for Beta. The same marks
were proposed to iOS.

**Events to verify on this binary:**

| Case | Expected in PostHog |
|---|---|
| Direct OneLink, signed out, then a new account (signup + CRJ) | `signup_completed` with `signup_source/campaign/content/tool` + `attribution_method=onelink_direct`; the person gets `signup_*` as set_once |
| Direct OneLink with a session, or an existing account signing in | `campaign_accessed` with `campaign_*` + `onelink_direct`; acquisition unchanged |
| Same link twice within 10 min | Only one event |
| Link with `deep_link_sub5` other than `nc1` | No attribution event; navigation only |
| Link with an OAuth key | Nothing: no event and no navigation |
| Any destination | No event contains `deep_link_value` |

**Not verifiable on this binary:** `onelink_deferred` and a late `acquisition_attributed`. A deterministic
deferred match needs the Play Install Referrer, which only exists for Play installs. A sideloaded
internal APK gets at most a probabilistic match, which only navigates. Validating those cases needs a
Play-distributed binary.

### Configuration in EAS (checked by name only, no values read, 2026-11-21)

| EAS variable | development | preview | production |
|---|---|---|---|
| `NEARSY_APPSFLYER_DEV_KEY` | **missing** | missing | missing |
| `NEARSY_POSTHOG_TOKEN` | **missing** | missing | present |
| `GOOGLE_SERVICES_JSON_DEV` | present (Secret, file; content not verifiable locally) | — | — |
| `EXPO_PUBLIC_FACEBOOK_APP_ID` / `_CLIENT_TOKEN` | present | — | present |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | present | — | present |

Without `NEARSY_APPSFLYER_DEV_KEY` and `NEARSY_POSTHOG_TOKEN` in `development`, an EAS build of this
profile fails on purpose.

### CRJ hotfix in that environment

The hotfix is Functions `531131b` (PR #47: `activateVisibility` and `setActiveProfileMode`). Latest
Cloud Run revisions as of 2026-11-21:

| Project | `activateVisibility` | `setActiveProfileMode` | Hotfix |
|---|---|---|---|
| nearsy-dev | `00005`, 2026-11-21 15:50Z | `00007`, 2026-11-21 15:50Z | **Live** (deployed after the 06:55Z merge) |
| nearsy-pj | `00007`, 2026-11-14 | `00007`, 2026-11-14 | **Not deployed** (awaiting Owner authorization) |

The Android client needs no change for this hotfix.

## Report

### Local validations done

- Unit tests with synthetic payloads: `src/__tests__/androidAppsFlyerOneLink.test.ts`, 32 cases. They
  cover:
  - URL matching, values, UDL direct and deferred, the conversion fallback;
  - C4 evidence with the cap from creation, the install claim, the shared dedupe key, destinations;
  - the build config, the MainActivity injection, the backup-rule merge, native linking by flag;
  - EAS profiles and the dev Firebase file variable.
- `src/analytics/__tests__/analyticsQaMode.test.ts`, 7 cases. They cover:
  - QA declared only by `appsflyer-nearsy-dev`;
  - never on nearsy-pj, and never combined with another mode;
  - the build failing without the token, without printing it;
  - the runtime check of the initialized app;
  - the event and person marks.
- All analytics suites: 306/306.
- Full `packages/shared` suite: 2357 tests, 27 failures, the same failing files as on the base `70f9e1b`.
- `tsc --noEmit`: 0 errors. `check:metro-imports`: 0 problems.
- Prebuild with AppsFlyer on (synthetic key): the OneLink filter has `autoVerify`; `onNewIntent` is
  injected. Gradle `processReleaseMainManifest` and `compileReleaseKotlin` pass, and the merged
  manifest has no `AD_ID` and no Samsung permission. Prebuild with AppsFlyer off is identical to the
  base. No APK was produced.

### Tests that need a device (next authorized binary)

- Effective APK signature (`apksigner`) and App Link verification for `nearsy.onelink.me`.
- Direct OneLink with the app closed or open, signed out or in, before and after the CRJ: navigates to
  `home`, `profile` and `alerts`.
- The PostHog events in the table above, filtered by `distribution_channel = qa`.
- Account switch and sign-out with a pending destination; expiry (30 min direct).
- Traffic capture: the SDK never receives LinkedIn, TikTok, YouTube, X or Facebook (`fb<id>://`)
  returns, at cold start or with the app open.
- Physical CRJ, Personal and Professional, against nearsy-dev.
- Out of scope for this binary: deferred installs from Play (referrer) and late acquisition.

None of this is done. The Device Farm binaries (2.1.0 (55)) and the local nearsy-dev APK don't include
AppsFlyer, and no result for this integration is attributed to them.

### Missing configuration (before the build, no code change)

- `NEARSY_APPSFLYER_DEV_KEY` (Sensitive) in the EAS `development` environment.
- `NEARSY_POSTHOG_TOKEN` (Sensitive) in the EAS `development` environment: the same project token as
  production. QA marks keep its events apart.
- Upload key fingerprint in the AppsFlyer OneLink template, unless it's already there.
- After installing: the device's App Check debug token, registered in nearsy-dev.

### Changes that would require rebuilding

- Any change to nc1 (parameters, OAuth keys, destinations, expiries, dedupe).
- Changing the PostHog marks or the project (QA mode), or enabling PostHog in another mode.
- An EU consent manager, if one is added.
- Changing the profile's Firebase environment, or enabling AppsFlyer in a production profile.
- A different signing keystore, in which case the new fingerprint also goes into AppsFlyer.

### Other items, no rebuild needed

- Google Play Data safety and the privacy policy (before any production enablement).
- Owner approval to close nc1.
