# Android: AppsFlyer OneLink (contract nc1)

Status: implemented on `feature/android-appsflyer` from `origin/develop-android` `70f9e1b`.
AppsFlyer is enabled only in the EAS profile `appsflyer-nearsy-dev` (nearsy-dev). That profile has not
been built. Every other profile, production included, leaves it off.

Contract nc1 was agreed between the Android and iOS sessions on 2026-11-21. Owner direction the same
day: navigation scope `home`, `profile`, `alerts`, no parameters, after authentication and the CRJ.
Navigation, acquisition and campaign access stay separate. The expiries are a **proposal**.

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
text. Owner approval is still pending, as is the expiry proposal.

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
| Navigation | `home` → Home tab, `profile` → own Profile tab, `alerts` → Alerts tab. No parameters. One pending destination; the last one wins. Consumed once by the signed-in account when the main tabs are focused (after login, OAuth and the CRJ). Expiry (**proposal**): 30 min direct, 24 h deferred. Never sent to analytics |
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
| EAS artifacts (`production`/`beta` AABs seen locally) | Upload key `23:42:4B:0D:90:D7:6E:AE:B6:B0:7B:83:9C:8C:8F:B3:85:91:26:31:4C:3B:67:7B:C2:32:38:E0:D0:99:35:C7` | Only if this fingerprint is also registered |
| EAS internal APK (`appsflyer-nearsy-dev`, `preview`) | Expected to be the same EAS keystore (not verified: no internal APK available locally) | Same as above |
| Local test APK (`nearsy-android-2.1.0-nearsy-dev-70f9e1b.apk`) | Expo template debug key `FA:C6:17:45:…:91:03:3B:9C` | No (never register a public debug key) |

To test the next binary, register the upload key fingerprint above in the OneLink template, unless it
is already there. Verify on the device with `adb shell pm get-app-links com.nearsy.app`.

## Next build: profile `appsflyer-nearsy-dev`

| Item | Value |
|---|---|
| Profile | `appsflyer-nearsy-dev`: extends `development-nearsy-dev` with `developmentClient: false`, internal `apk` distribution |
| Firebase / Functions | `NEARSY_FIREBASE_ENV=development` → **nearsy-dev**, `us-central1` |
| App Check | Debug provider, the same as `development-nearsy-dev` (`NEARSY_DEV_CLIENT=true`); production keeps Play Integrity. The device's debug token must be registered in nearsy-dev |
| EAS environment | `development` |
| PostHog | Off (capture exists only in production). PostHog events can't be validated end to end on this binary |
| AppsFlyer | `NEARSY_APPSFLYER_ENABLED=true` |
| Firebase file | `GOOGLE_SERVICES_JSON_DEV` (EAS file variable, `development`, visibility Secret). `app.config.js` now reads its path for nearsy-dev only; before this change, no EAS nearsy-dev build could find its Firebase file, because `.easignore` excludes it |

Configuration checked by name only, no values read (2026-11-21):

| EAS variable | development | preview | production |
|---|---|---|---|
| `NEARSY_APPSFLYER_DEV_KEY` | **missing** | missing | missing |
| `GOOGLE_SERVICES_JSON_DEV` | present (Secret, file; content not verifiable locally) | — | — |
| `EXPO_PUBLIC_FACEBOOK_APP_ID` / `_CLIENT_TOKEN` | present | — | present |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | present | — | present |

Without `NEARSY_APPSFLYER_DEV_KEY` in `development`, an EAS build of this profile fails on purpose.

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
  - EAS profiles (only `appsflyer-nearsy-dev` enables AppsFlyer, on nearsy-dev) and the dev Firebase
    file variable (read for nearsy-dev only).
- Analytics plus the EAS and Firebase config suites: 387 tests, 386 passing. The 1 failure is the
  pre-existing `Android EAS Node 22 security pin`, which also fails on the base.
- Full `packages/shared` suite: 2350 tests, 27 failures. They're the same failing files as on the base
  `70f9e1b`.
- `tsc --noEmit`: 0 errors. `check:metro-imports`: 0 problems.
- Prebuild with AppsFlyer on (synthetic key): the OneLink filter has `autoVerify`; `onNewIntent` is
  injected. Gradle `processReleaseMainManifest` and `compileReleaseKotlin` pass, and the merged
  manifest has no `AD_ID` and no Samsung permission. Prebuild with AppsFlyer off is identical to the
  base. No APK was produced.

### Tests that need a device (next authorized binary)

- App Link verification for `nearsy.onelink.me` (`pm get-app-links`) with the EAS signature.
- Direct OneLink with the app closed or open, signed out or in, before and after the CRJ: navigates to
  `home`, `profile` and `alerts`.
- Deferred install (Play, via the referrer); a probabilistic deferred match only navigates.
- Account switch and sign-out with a pending destination.
- Traffic capture: the SDK never receives LinkedIn, TikTok, YouTube, X or Facebook (`fb<id>://`)
  returns, at cold start or with the app open.
- Physical CRJ, Personal and Professional, against nearsy-dev.

None of this is done. The Device Farm binaries (2.1.0 (55)) and the local nearsy-dev APK don't include
AppsFlyer, and no result for this integration is attributed to them.

### Pending configuration that requires rebuilding

- Create `NEARSY_APPSFLYER_DEV_KEY` (visibility Sensitive) in the EAS `development` environment.
  Required for the build.
- Any change to the contract after Owner or iOS review (OAuth keys, expiries, destinations): code.
- EU consent (no CMP; `setConsentData` isn't called): code if a CMP is added.
- Enabling AppsFlyer in a production profile: only after the device tests above.

### Pending configuration that does not require rebuilding

- Register the upload key fingerprint in the AppsFlyer OneLink template, unless it's already there.
- Register the test device's App Check debug token in nearsy-dev.
- Google Play Data safety and the privacy policy (before any production enablement).
- Owner approval of nc1, including the expiry proposal.
