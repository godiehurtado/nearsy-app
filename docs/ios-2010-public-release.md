# Nearsy iOS 2.0.10: public release preparation

Branch `feature/ios-posthog`. Nothing here was built, submitted or published.

## Distribution

| Profile | Binary | Analytics | Use |
|---|---|---|---|
| `production` | 2.0.10 (76) | PostHog included, capture **off** (no channel declared) | App Store |
| `testflight-contacts-diagnostics` | 2.0.10 (75) | Off, like `production` | Internal TestFlight only: Contacts diagnostic reference for 7 days after the build |
| `beta` | 2.0.10 (74) today; next Beta needs 77+ | On, `distribution_channel=beta`, `is_test_user=true` | TestFlight QA only |

- `beta` extends `production`; `production` never inherits the Beta channel.
- Never promote a Beta binary to the App Store: every store user would be marked `is_test_user=true`.
- Both profiles share one App Store build number space. Check EAS and App Store Connect before each build.

```bash
cd apps/nearsy-ios
eas build --platform ios --profile production --clear-cache
eas submit --platform ios --profile production --id <BUILD_ID>
```

## Binary version in More

More shows `Version 2.0.10 (76)` from the native bundle (`CFBundleShortVersionString`, `CFBundleVersion`) through `expo-application`. It never reads the app config or an update manifest. Android, without that module, shows nothing.

## Affiliations: custom logo button

The "Upload a logo instead" / "Add an optional image" button now uses the shared `PrimaryButton` (filled gradient, white label) in the CRJ and in profile editing. While the image picker is open it shows the disabled style and cannot open a second picker.

## Contacts

### Pre-request failure on iPhone

Evidence: Full Access granted, city search succeeding, and Identity seeing no iOS Contacts calls. The failure is before the HTTP request.

Excluded with evidence:
- **Region and emulator:** the EAS `production` environment defines no emulator host or other region, and the profile fixes `us-central1`.
- **Project, Auth token and native App Check provider:** shared with city search, which works.
- **Code drift:** Contacts, App Check, Firebase transport and config are identical between `f5053a4` (base of the 2.0.10 (72) diagnostic build) and this branch.

Still open, both specific to Contacts and both before the request:
1. **Its own App Check bootstrap**, which forces a token refresh (`getToken(true)`) before its first call. City search, once started, uses the cached token.
2. **The Keychain session read** (`expo-secure-store`) that every Contacts operation does first.

Not proven. App Check is not presented as the cause.

**Builds 73 and 74 have no diagnostic reference.** 2.0.10 (72) had one but is not available to the Owner in TestFlight, so this branch adds a new internal build, **2.0.10 (75)**, described below.

**One physical test, no new build:** install 2.0.10 (72) from TestFlight on the affected iPhone, sign in with the affected account, open More, turn Contacts on once, and photograph the alert. Its `Ref:` line names the stage (`app_check_init`, `app_check_force`, `session_read`, etc.). If 72 is no longer installable, the reference has to be ported to a new TestFlight-only build.

### Payload against Identity's contract (preventive)

Checked against `nearsy-identity-functions` `origin/main` (`a193ff7`): `normalize.ts`, `parse.ts`.

- **Found:** Identity validates phones with `libphonenumber-js/max` (`isPossible` and `isValid`) and rejects the **whole** `syncContactHashes` call when one identifier fails. The iOS client only checked an E.164 regex, so a number with the right shape but invalid (for example `+1 555 555 0100`) would cost the entire snapshot.
- **Fixed:** the client applies the same rules with `libphonenumber-js` 1.13.11 (Identity's version) and sends E.164. Invisible format marks iOS keeps around numbers (bidi, zero-width, BOM) are removed first. Invalid identifiers are skipped one by one; the contact's other phones and emails still upload.
- **Found and fixed:** the address book reader returned an empty book when `expo-contacts` was unavailable, and stopped silently after 20,000 rows. Both now fail the operation, so a read failure is never sent as an empty or partial snapshot.
- **Confirmed:** request fields match Identity's parsers: `syncContactHashes` sends exactly `sourceId`, `snapshotVersion`, `contactsEpoch`, `identifiers` (`kind`, `value`); enable `{contactsEpoch}`; refresh `{}`; remove `{sourceId, contactsEpoch, knownSnapshotVersion}`. No banned fields.

### National numbers, empty books and libphonenumber

- **National numbers** (no `+`) are skipped, never given a country. Identity also accepts international form only. No region is inferred from language or locale. The only verifiable region in the app is the account's own OTP-verified `phone`; using it as the default region would change Identity's "E.164 only" contract and needs a joint decision with Identity and Product.
- **A book with phones or emails but none valid** fails with `contacts-identifier-invalid` (not retried automatically) and keeps the previous snapshot. Only a book with no phone or email at all is sent as empty.
- **Validator parity:** the app and Identity both import `libphonenumber-js/max` 1.13.11 with the same registry integrity hash, byte-identical `metadata.max.json`, and the same call (`parsePhoneNumberWithError(raw, { extract: false })`, no default country). Compared against Identity `origin/main`; the deployed artifact itself was not inspected.

## Affiliation notices (approved Functions contract)

- Push motives: `interest`, `contact`, `both`, `affiliation`, `contact_affiliation`. An unknown motive is left out (never guessed); the tap still opens the profile, and `alertId` and `alert_opened` are kept.
- The `notifyNearbyInterests` setting is now titled "Shared interests and affiliations" / "Intereses y afiliaciones compartidos". The stored field and its default are unchanged.
- Saving a real affiliation change (CRJ or profile editing) schedules the existing debounced proximity reevaluation; an unchanged save does not. A scheduling failure never fails the save.
- **Public binary (2.0.9 (70), `f5053a4`):** the response listener only parses the payload for `actorUid` and navigates; an unknown motive falls back without error. It creates no local notification text: iOS shows the remote push title and body. It therefore tolerates the new motives.

## Contacts diagnostic build 2.0.10 (75)

**Internal TestFlight only. Never submit it for App Store review or release it.**

- **What it adds:** every Contacts error alert in More ends with `Ref: <stage>/<code>[/http-NNN][/firebase-status][/exchange]`, built only from closed lists. No native messages, tokens, UIDs, emails, phones, URLs or contact data.
- **Stages:** `env_config`, `project_js`, `native_port`, `project_native` (client composition); `app_check_init`, `app_check_force`, `app_check_token` (App Check initial, forced refresh, normal token); `session_read`, `session_write` (SecureStore); `permission`; `auth_token`; `contacts_read`; `endpoint`, `fetch`, `response` (HTTP transport).
- **Reused from `feature/ios-209-contacts-diagnostic`:** only `contactsDiagnostics.ts` and `contactsDiagnosticsFlag.ts`. The old composition module was not restored: the current `iosContactsFoundation.ios.ts` keeps its steps, checks, caching and errors and only reports which step runs.
- **Unchanged:** reasons, toggle, consent, retries, persistence, network calls and App Check protections.
- **Expiry:** the profile declares `NEARSY_CONTACTS_DIAGNOSTICS_DAYS=7`; the EAS builder embeds the instant seven days after compiling. Any other profile that declares it fails the build. The public profile has no reference.
- **PostHog:** off, like the public candidate.

```bash
cd apps/nearsy-ios
eas build --platform ios --profile testflight-contacts-diagnostics --clear-cache
eas submit --platform ios --profile production --id <BUILD_ID>
```

**Test for the Owner:** install 2.0.10 (75) from TestFlight, sign in with the affected account, open More, turn Contacts on once, and take a screenshot of the whole alert including the `Ref:` line.

## Alerts inbox: shared affiliations (next candidate, not in 2.0.10 (75))

- `discoverNearby` results may carry the additive `sharedAffiliationCount`, computed by the server from stable affiliation identities shared between both active modes. Only a non-negative integer counts; absent or invalid means no affiliation match and never breaks the response.
- The inbox shows a candidate only when they share interests or `sharedAffiliationCount > 0`, one row per uid. Nearby people with neither are no longer listed.
- With a shared affiliation, the row uses a generic text, even if interests are also shared: "{name} is near you and you share affiliations." / "{name} está cerca y comparte afiliaciones contigo." No affiliation names or logos.
- Discovery filters, navigation and `alert_opened` are unchanged. The inbox stays independent of the push preference and does not include Contacts. No extra calls per profile.
- Integrated check pending the Functions deploy of the field.

## National numbers: default region (aligned with Android)

- A number written with `+` keeps its own country.
- A national number is read in a **default region taken only from the account's own phone, when OTP verified it** (`phone` with `phoneVerified === true` on the user document). No language, locale or SIM.
- **The default region is an interpretation rule, not a guarantee of each contact's country.** A contact saved in national form from another country will be read in the account's country, or skipped if the number is not valid there.
- Without that region nothing is prefixed and national numbers are skipped.
- Every result is checked again with Identity's rules (`libphonenumber-js/max` 1.13.11) before it is kept, and identifiers are deduplicated after normalizing.
- A failed region read fails the sync instead of uploading a book read with a different rule. Empty book, all-invalid and read-failure handling are unchanged.
- Sending E.164 does not change Identity's contract.

## Contacts diagnostic result: `Ref: session_read/other` (build 75)

**Proven:**
- **Keys:** every per-UID key matches the installed `expo-secure-store` 15.0.8 rule `^[\w.-]+$` for any UID shape. Only per-UID keys are read, with default options; legacy global keys from earlier builds are never read.
- **What `session_read` covers:** the dynamic import of `expo-secure-store`, up to six sequential `getItemAsync` reads, and parsers that cannot throw. There is no migration.
- **Never `other` from the store:** any native or JS failure of `getItemAsync` is wrapped and reported as its native code (`err-key-chain`, `err-invalid-key`, `err-missing-plist-key`, `err-sec-access-control`) or `session-unavailable`. Sessions from earlier builds and corrupt values do not fail the read.
- **Compiled code:** the project Babel preset keeps the session store's `read()` method as written; it does not shadow the key-reading helper.

**Therefore** the failure was not an exception inside the session read. The reference shows the last step entered (`session_read`) and `other`, which is what the trace prints when the error was raised outside a traced step or not recorded. The exact source is still unproven, so nothing in SecureStore was changed.

**Trace limitations found:** a later step clears an earlier recorded failure, and the reference does not say whether the error came from inside a step or after it.

**Minimal next evidence (no build):** Identity's log for this account around 21:48 Miami (02:48 UTC, November 11): whether `enableContactsSync` or `refreshVerifiedActorKeys` reached it.

**Minimal next diagnostic (only if that log is not conclusive), one internal build and the same single test:** keep the first failure across steps, and add to the reference whether it was raised inside or after the step, the error kind from a closed list (`error`, `typeerror`, `rangeerror`, `syntaxerror`, `coded`, `non-object`), the previous step, and for `session_read` which read failed (`import`, `key-1`…`key-6`).

## Public App Store version

The App Store lookup for `com.nearsy.app.client` (app `6759302206`) reports **version 2.0.9**, released on 2026-11-05 08:02 UTC. The public API does not give the build number. EAS has production builds of 2.0.9 numbered 63 to 70; the release-candidate commit locks 2.0.9 (70) (`f5053a4`), built on 2026-11-04. **Which build is attached to the 2.0.9 release can only be confirmed in App Store Connect** (App Store › 2.0.9 › Build). The push analysis of `f5053a4` holds for every 2.0.9 build from 63 on only if their push handling matches; that was checked for 70.

### Identity logs for the build 75 test (02:43–02:53 UTC, November 11)

Identity found **no Contacts request from any platform between 01:45 and 03:45 UTC**: no `refreshVerifiedActorKeys`, `enableContactsSync`, `syncContactHashes`, `disableContactsSync` or `removeContactSource`, not even rejected ones (no 401 or 403). Build 75 (`Nearsy/75` user agent) did reach the backend at 02:47 (`getAppUpdatePolicy`, `publishLocation`, `discoverNearby`). So the failure happened on the device before the first Contacts callable. The logs cannot tie requests to an account, and a request that never left the device leaves no trace.

With the trace in build 75, `session_read` was only the last step entered; it does not prove that the session read failed. SecureStore on the device is **not** ruled out: the test double only shows that the app's own code would report a native SecureStore failure with its code or `session-unavailable`.

### Trace v2 (in the branch, not built)

- **First failure kept:** a later step or failure never replaces it.
- **Causing step vs running step:** a failure caught inside a step names that step. A failure caught outside any step (gaps between steps, runner, coordinator) shows `unknown`, plus `after-<last finished step>` or `during-<step still running>`.
- **No exception:** when the operation ends with a returned failure, the reference is `unknown/<outcome reason>/k-none/...`.
- **Error kind:** `k-typeerror`, `k-rangeerror`, `k-referenceerror`, `k-syntaxerror`, `k-coded`, `k-error`, `k-non-object` or `k-none`. Our wrappers report the kind of what they wrap.
- **Closed lists only:** stages, codes, outcome reasons, kinds and HTTP or Firebase statuses. No messages or data.

Examples: `session_read/err-key-chain/k-coded` (the read itself failed), `unknown/other/k-typeerror/after-session_read` (an error after a successful read), `unknown/contacts-timeout/k-none/during-session_read` (the read never finished).

**Next minimal step:** one internal TestFlight build with trace v2 and the same single test (open More, turn Contacts on once, capture the alert). That separates a failing session read from an error after it, and names the error kind.
