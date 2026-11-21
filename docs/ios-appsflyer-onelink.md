# Nearsy iOS: AppsFlyer / OneLink

- **Status (2026-11-21):** implemented on `feature/ios-appsflyer-onelink`, based on `develop-ios` `e9a8fce`. That base includes the CRJ hotfix (`a82a4a2`, PR #123).
- **Default:** off in every build profile except the prepared test profile `dev-internal-appsflyer` (never built yet). A binary built without the switch contains no AppsFlyer code: the module isn't linked, nothing is forwarded from the AppDelegate, there's no Associated Domains entry and no key.
- **Not built or validated on a device.** No binary contains this integration. The farm binaries and the CRJ test build 2.1.0 (85) have no AppsFlyer. No result from them applies to this integration.
- **Contract nc1:** agreed with the Android agent on 2026-11-21. It stays provisional until the Owner approves it.
- **Owner direction (2026-11-21):** navigation scope is `home`, `profile`, `alerts`, without parameters, after authentication and the CRJ. Navigation, acquisition and campaign access stay separate. The expiry times (30 min direct, 24 h deferred) are documented as a proposal.

## Shared table (nc1, identical on iOS and Android)

| Area | Rule |
|---|---|
| **Parameters read** | Only `deep_link_value` and `deep_link_sub1..5`. sub1 source, sub2 campaign, sub3 content, sub4 tool, sub5 must be `nc1`. Everything else (`pid`, `c`, `af_*`, `media_source`, `campaign`) is ignored |
| **Value validation** | Slug `^[a-z0-9][a-z0-9._-]{0,63}$` after lowercasing. `organic`, `unknown`, `none`, `null`, `undefined` refused. An invalid field is dropped alone; the touch needs a source or a campaign. sub5 ≠ `nc1` → no attribution (navigation still allowed) |
| **OAuth guard** | A payload with `code`, `state`, `token`, `access_token`, `id_token`, `transactionId`, `transaction_id`, `result`, `error` or `mode` is dropped whole (no attribution, no navigation) |
| **Confirmed touch** | Direct UDL (`is_deferred=false`) → `onelink_direct`. Deferred with `match_type=referrer` → `onelink_deferred`. Unknown `is_deferred` counts as deferred |
| **Probabilistic deferred** | Never attributed, not even as `campaign_accessed`. There is no "estimated" value. Its destination is still honored (navigation only) |
| **Before signup** | A confirmed touch with no session is kept as pending attribution for 7 days; the last touch wins until signup |
| **Acquisition at signup** | `signup_completed` carries `signup_source/campaign/content/tool` + `attribution_method` when the pending touch was captured before the account was created, on this install, and no other account on this install claimed acquisition. Person properties `$set_once`; never overwritten |
| **Late evidence** | `acquisition_attributed` only when all hold: capture before Firebase `creationTime`; account created after the install marker; first account to claim on this install (else nothing, F7); no acquisition recorded yet; at most 24 h since creation (a cap, never evidence by itself) |
| **Campaign access** | A touch opened with a session, after creation, or by an existing account → `campaign_accessed` with `campaign_source/name/content/tool` + `attribution_method`. Acquisition untouched |
| **Deduplication** | Same source/campaign/content/tool arriving direct and deferred within 10 min counts once. Navigation: the same key isn't consumed twice within 10 min |
| **Account switch** | A touch is classified for the account signed in when it arrives; it never moves to another account. A signed-out touch goes to the first account that signs in or up. A destination captured with account A is discarded when B signs in; a real sign-out clears it |
| **Navigation** | `home` → Home tab, `profile` → own Profile tab, `alerts` → Alerts tab. No parameters. One pending destination, last wins. Consumed once, by the signed-in account, when the main tabs are focused (after login, OAuth and the CRJ). Expiry (proposal): 30 min direct, 24 h deferred. Never sent to analytics |
| **Privacy** | No customer user ID, no in-app events, no ATT, no clipboard, no advertising IDs. Partner sharing filter `all`. Debug logs only on nearsy-dev. Mapping to PostHog only when PostHog is on |
| **Switch** | `NEARSY_APPSFLYER_ENABLED=true` in the profile + sensitive EAS variable `NEARSY_APPSFLYER_DEV_KEY`. Off → SDK not linked |

### Platform differences (deliberate, same outcome)

| Topic | iOS | Android |
|---|---|---|
| Install marker | Local marker written on the first analytics launch (app storage) | Package manager first-install time |
| Deterministic deferred match | Not available (no IDFA, no referrer): every iOS deferred match is probabilistic | Install referrer (`match_type=referrer`) |
| Conversion-data listener | Not registered | Fallback under the same rules |
| What reaches the SDK | Only https universal links on `nearsy.onelink.me/Uxo6`, filtered in the AppDelegate; never `openURL` or launch options | App Links on the same host and path; OAuth returns excluded |
| Off build | Module unlinked via `react-native.config.js` | Native module not linked |
| Platform extras | Podfile strict mode (no AdSupport) | Merged Auto Backup rules; Samsung `READ_APP_INFO` removed |

### iOS deferred attribution: limitations

- iOS can't confirm a deferred install. AppsFlyer matches it probabilistically, so **an install that came from a link before the app existed is never attributed on iOS**. It only counts once the person opens a OneLink again with the app installed (direct UDL), and then only as acquisition if that happens before the account is created.
- The deferred destination still works (navigation only), within 24 h.
- `is_deferred` and `match_type` on iOS are still to be checked on a device.
- Consequence for reports: iOS acquisition from deferred campaigns is under-counted by design; it is not missing data.

## Confirmed configuration

| Item | Value |
|---|---|
| OneLink | `https://nearsy.onelink.me/Uxo6`, template `Uxo6` |
| Universal Links | `applinks:nearsy.onelink.me`. AppsFlyer serves the AASA (checked on 2026-11-21): app ID `4DX74Q6UH4.com.nearsy.app.client`, path `/Uxo6/*` |
| URI scheme fallback | None. `nearsy://` stays reserved for OAuth returns |
| App Store ID / bundle / Team | `6759302206` / `com.nearsy.app.client` / `4DX74Q6UH4` |
| SDK | `react-native-appsflyer` 7.0.4 (exact), `@appsflyer-sdk/js-core-plugin` 7.1.0, `AppsFlyerRPC/Strict` 7.0.41 → `AppsFlyerFramework` 7.0.4 |

## Contract nc1 (iOS = Android)

**Link template:**
```
https://nearsy.onelink.me/Uxo6/<id>?pid=…&c=…&af_channel=…&af_ad=…
  &deep_link_value=<home|profile|alerts>
  &deep_link_sub1=<source>&deep_link_sub2=<campaign>&deep_link_sub3=<content>
  &deep_link_sub4=<tool>&deep_link_sub5=nc1
```

**Fields Nearsy reads:**

| Field | Meaning | PostHog (acquisition / access) |
|---|---|---|
| `deep_link_sub1` | channel | `signup_source` / `campaign_source` |
| `deep_link_sub2` | campaign | `signup_campaign` / `campaign_name` |
| `deep_link_sub3` | piece | `signup_content` / `campaign_content` |
| `deep_link_sub4` | distribution tool | `signup_tool` / `campaign_tool` |
| `deep_link_sub5` | contract version, must be `nc1` | — (otherwise nothing is attributed) |
| `deep_link_value` | navigation destination | none (never analytics) |
| computed by the app | `onelink_direct` / `onelink_deferred` | `attribution_method` |

**What is never read:**
- `pid`, `c`, `af_channel`, `af_ad`, `media_source` and `campaign` are for AppsFlyer's reports only.
- Deferred UDL returns them as null anyway.

**Validation:**
- Values are slugs (`^[a-z0-9][a-z0-9._-]{0,63}$`, lowercased).
- `organic`, `unknown`, `none`, `null` and `undefined` are refused.
- An invalid field is dropped on its own. The touch needs a source or a campaign.
- A payload with an OAuth key (`code`, `state`, `token`, `transactionId`, `error`, `mode`…) is dropped whole.

## Three separate outcomes

| Outcome | When | Effect |
|---|---|---|
| **Confirmed acquisition** | Direct UDL (`is_deferred=false`), captured before the account was created, on an account created on this install, first on this install | `signup_completed` with the fields, or `acquisition_attributed` within 24 h. Person `$set_once`. Never overwritten |
| **Later campaign access** | Link opened with a session, after creation, or by an existing account | `campaign_accessed`. Acquisition is not touched |
| **Navigation destination** | `deep_link_value` from the closed list | Opens a tab. No effect on attribution |

**Deferred matches:**
- They count only with a deterministic match (`match_type=referrer`, which only happens on Android).
- On iOS without IDFA a deferred match is probabilistic. It is **an estimate and is never written**, not even as `campaign_accessed`. There is no `onelink_estimated` value.
- iOS doesn't register the conversion-data listener. Android falls back to it only under the same rules.

**Duplicates:** the same touch arriving direct and deferred within 10 min counts once.

## Destinations (C6, scope adopted by the Owner; expiries proposed)

| `deep_link_value` | iOS | Android |
|---|---|---|
| `home` | `MainTabs → Home` | Home tab |
| `profile` | `MainTabs → Profile` (own profile) | Profile tab |
| `alerts` | `MainTabs → Alerts` | Alerts tab |

**Storage:** one destination at a time, last one wins. It stores the key, `deferred`, the capture time and the account. Never the URL.

**Consumption:**
- Once only, by the signed-in account, when MainTabs is focused (after login and the CRJ).
- The destination waits through login, OAuth and the CRJ.

**Expiry:** direct 30 min, deferred 24 h. The same key isn't consumed again within 10 min.

**Accounts:**
- A real sign-out clears it. A guest first launch keeps a deferred destination.
- A destination captured with account A is discarded when B signs in.
- One captured while signed out goes to the first account that signs in.

## OAuth and native links (C8)

`plugins/withNearsyAppsFlyer.js` and `nearsyAppsFlyerCore.js` replace the stock AppsFlyer Expo plugin, which forwards **every** URL to the SDK at cold start:

- **What reaches AppsFlyer:** only `continueUserActivity` with all of these:
  - `NSUserActivityTypeBrowsingWeb`;
  - `https`;
  - no port and no userinfo;
  - host `nearsy.onelink.me`;
  - path `/Uxo6` or `/Uxo6/…`.
- **What never reaches it:**
  - `openURL`, which carries the OAuth returns `nearsy://linkedin-auth|tiktok-ownership|x-ownership|youtube-ownership` and the Google and Facebook schemes;
  - the launch options at cold start.
- **The rest of the app still gets everything:** `super` and `RCTLinkingManager` receive every URL. JS never calls `handleOpenURL` or `continueUserActivity`.
- **Podfile:** sets `$RNAppsFlyerStrictMode=true`, so `AppsFlyerRPC/Strict` is used, with no IDFA or AdSupport code.
- **Checks:** a post-condition fails the prebuild if any other AppsFlyer forward appears. It works in either order with `withNearsyRnfbAppCheck`.

## Privacy defaults (C7)

**Calls made before `start()`:**
- `setDisableAdvertisingIdentifiers(true)`;
- `setDisableCollectASA(true)`;
- `setDisableAppleAdsAttribution(true)`;
- `setDisableSKAdNetwork(true)`;
- `setShouldCollectDeviceName(false)`;
- `setSharingFilterForPartners(['all'])`.

**What the app never does:**
- `setCustomerUserId`: the Firebase UID never reaches AppsFlyer;
- `logEvent`, in-app events or S2S;
- an ATT prompt;
- reading the clipboard.

**Debug logs:** `enableDebug` runs only on nearsy-dev builds.

**Mapping to PostHog:** only when PostHog is enabled. When it's off, a touch only affects navigation.

## Activating it

1. **EAS:** create the sensitive variable `NEARSY_APPSFLYER_DEV_KEY` in each environment that will use it. Never in Git. **Checked 2026-11-21 (names only): missing in `development` and `production`.** Until it exists, a build of the test profile fails on the builder, before compiling.
2. **Profile:** set `NEARSY_APPSFLYER_ENABLED=true` in that profile's `env`. Only `dev-internal-appsflyer` has it; a test fails if any other profile, directly or by `extends`, does.

**Next test binary: `dev-internal-appsflyer`**
- Extends `dev-internal`: internal (ad hoc) distribution, no dev client, EAS environment `development`, Firebase `nearsy-dev`, Functions `us-central1`, PostHog off.
- Version 2.1.0 (86), outside the App Store numbers (84, 83, 76, 74) and the CRJ build (85). No submit profile.
- It includes the CRJ client hotfix (`a82a4a2`, in the base `e9a8fce`). The server part is `nearsy-functions` PR #47, merged as `531131b`. Per the Functions agent (2026-11-21): deployed on `nearsy-dev` (`setActiveProfileMode`, `activateVisibility`, 15:48–15:50Z) and **not** on `nearsy-pj`, where both callables predate the fix. A production binary would therefore not have the server part.
- PostHog is off there because the `development` EAS environment has no PostHog token and there is no dev distribution channel. So the binary can show SDK traffic, the OAuth filter and navigation, **not** the PostHog events; those are covered by unit tests only.
- The ad hoc profile currently registers a single device. Any test iPhone must be in it.
3. **Apple:** the App ID needs the Associated Domains capability. EAS syncs it when it signs a binary with the entitlement, so the provisioning profile gets regenerated.
4. **Build:** a new binary is required. OTA can't add native code.

**What happens with the switch on:**
- **On the EAS builder:** the build fails if the key is missing or malformed.
- **Locally:** reading the config only checks the profile, and embeds nothing.

## Pending items and risks

- **Owner:**
  - approve nc1, including `onelink_direct` and `onelink_deferred`;
  - approve the destinations and expiry times;
  - EU consent: there's no CMP and `setConsentData` isn't called;
  - App Privacy labels, privacy policy and AppsFlyer's data processing agreement;
  - turn off click tracking in Mailchimp, or validate it.
- **Validation status:** see the report below. Traffic capture and physical tests run on the next authorized binary; none can be declared done now.
- **Device validation:** none done yet.
  - Capture traffic to confirm that neither an OAuth return nor a non-OneLink URL reaches AppsFlyer. The SDK is closed source.
  - Check the real UDL keys on iOS (`is_deferred`, `match_type`).
  - Check compilation with `useFrameworks: static` and the RNFB pods.
  - Check startup with the New Architecture.
- **Clock:** the capture time comes from the device; the creation time from the Auth server.
- **Install marker:** an iCloud restore can bring it back from another device. The capture-before-creation rule still holds.
- **Rule change (B10):** a link opened after signup is now `campaign_accessed`, no longer late acquisition. The same applies to the `/c/` links, which are off.

## Code

| File | Role |
|---|---|
| `apps/nearsy-ios/scripts/appsFlyerBuildConfig.cjs` | Build switch, key check, extra, domain |
| `apps/nearsy-ios/react-native.config.js` | Unlinks the native module when off |
| `apps/nearsy-ios/plugins/withNearsyAppsFlyer.js`, `nearsyAppsFlyerCore.js` | AppDelegate filter, Podfile strict mode |
| `packages/shared/src/appsflyer/oneLinkContract.ts` | nc1 parser |
| `packages/shared/src/appsflyer/pendingDestination.ts` | Destination store |
| `packages/shared/src/appsflyer/appsFlyerRuntime.ts`, `appsFlyerSdk(.ios).ts`, `bootstrap.ts` | SDK start, privacy calls, routing |
| `packages/shared/src/analytics/attribution.ts`, `index.ts` | Acquisition evidence, install record, `handleOneLinkTouch` |

**Tests:**
- `pnpm test:appsflyer` (root);
- `pnpm --filter nearsy-ios test:appsflyer-native`.

## Validation report (2026-11-21)

**Local validations done (no binary):**
- `pnpm test:appsflyer`: nc1 parser, acquisition evidence, access, deduplication, install claim.
- `pnpm --filter nearsy-ios test:appsflyer-native`: AppDelegate filter on the Expo 54 template (only guarded `continueUserActivity`, never `openURL` or launch options), App Check coexistence, Podfile strict mode, build switch, key never echoed, only `dev-internal-appsflyer` enabled.
- `iosBinaryVersionOverride`: 2.1.0 (86) is unique and never submitted.
- Autolinking: 16 modules off, 17 on.
- AASA served by AppsFlyer lists `4DX74Q6UH4.com.nearsy.app.client` with `/Uxo6/*`.
- `typecheck` in `apps/nearsy-ios`. Shared and iOS suites: only the failures already present on the base.
- EAS variables checked by name only.

**Tests that need a device (next authorized binary):**
- Compilation with static frameworks and the RNFB pods; startup with the New Architecture.
- Traffic capture: no OAuth return (`nearsy://…`, Google, Facebook) and no non-OneLink URL reaches AppsFlyer; no IDFA/IDFV-based or device-name fields.
- Real UDL keys on iOS (`is_deferred`, `match_type`).
- Direct link with the app installed: signed out, signed in, during the CRJ.
- Deferred link (install from the link): destination opens; no attribution recorded.
- Each destination; expiry; account switch; sign-out.
- OAuth sign-ins (Google, Facebook, LinkedIn, TikTok, X, YouTube) still work.

**Pending configuration that requires a new binary:**
- `NEARSY_APPSFLYER_DEV_KEY` in the EAS `development` environment (and `production` later).
- Associated Domains capability on the App ID (EAS syncs it at signing; profile regenerated).
- Test iPhones registered in the ad hoc profile.
- For production: a profile with the switch, an Owner decision on EU consent, App Privacy labels and privacy policy.
- Any change to the host, template, destinations or privacy calls.

**Kept apart:** the farm binaries and the CRJ build 2.1.0 (85) contain no AppsFlyer; their results never count for this integration. The CRJ physical validation (Personal and Professional) is still pending.
