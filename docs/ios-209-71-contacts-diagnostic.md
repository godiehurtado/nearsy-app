# Nearsy iOS 2.0.9 (71): Contacts diagnostic build

**TestFlight internal testing only. Do not submit this build for App Store review or release it.**

## Purpose
Build 70 turns several failures before the Identity request into "Could not sync contacts. Try again." This build shows which step failed, so the failure can be read from one screenshot.

It is `f5053a4` plus the diagnostic reference and this build's configuration. It contains no other changes.

## What differs
When Contacts fails with the generic message, the alert adds a reference:

```text
Ref: app_check_force/token-error/http-403/permission-denied/app-attest
```

The parts are stage, code, HTTP status when a response exists, Firebase status, and App Check exchange. Unknown values become `other`. The reference contains no native messages, UIDs, tokens, URLs or contact data.

Reason, toggle, consent, retries, persistence, network calls and the App Check provider match build 70.

## Expiry
The reference stops showing at 23:59 Miami time on November 12, 2026. `NEARSY_CONTACTS_DIAGNOSTICS_UNTIL` holds that instant in UTC: `2026-11-13T04:59:00.000Z`.

## Build and upload
Only the `testflight-contacts-diagnostics` EAS profile can carry the expiry; any other profile fails the build. It extends `production`, so it keeps the bundle, EAS project, production Firebase, App Check provider and credentials.

```bash
eas build --platform ios --profile testflight-contacts-diagnostics
```

```bash
eas submit --platform ios --profile testflight-contacts-diagnostics --id <build-id>
```

## Limit
TestFlight and App Store share the binary, so App Store Connect would still let someone select this build for review. Nothing in the code can block that. If it ever happened, the reference would stay visible until the expiry.

## After the diagnosis
Remove the expiry and the profile's use before any store candidate. The next store build must have a higher build number than this one.
