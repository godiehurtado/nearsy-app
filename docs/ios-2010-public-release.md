# Nearsy iOS 2.0.10: public release preparation

Branch `feature/ios-posthog`. Nothing here was built, submitted or published.

## Distribution

| Profile | Binary | Analytics | Use |
|---|---|---|---|
| `production` | 2.0.10 (75) | PostHog included, capture **off** (no channel declared) | App Store |
| `beta` | 2.0.10 (74) today; next Beta needs 76+ | On, `distribution_channel=beta`, `is_test_user=true` | TestFlight QA only |

- `beta` extends `production`; `production` never inherits the Beta channel.
- Never promote a Beta binary to the App Store: every store user would be marked `is_test_user=true`.
- Both profiles share one App Store build number space. Check EAS and App Store Connect before each build.

```bash
cd apps/nearsy-ios
eas build --platform ios --profile production --clear-cache
eas submit --platform ios --profile production --id <BUILD_ID>
```

## Binary version in More

More shows `Version 2.0.10 (75)` from the native bundle (`CFBundleShortVersionString`, `CFBundleVersion`) through `expo-application`. It never reads the app config or an update manifest. Android, without that module, shows nothing.

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

**Builds 73, 74 and this branch have no diagnostic reference.** The only build that has it is **2.0.10 (72)** (`44423b2`, profile `testflight-contacts-diagnostics`), until 23:59 Miami time on November 12, 2026.

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
