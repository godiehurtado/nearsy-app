# Incident 2026-11-20: CRJ Profile Type (iOS side)

- **Status:** iOS hotfix on `hotfix/ios-crj-initial-mode`, branched from `develop-ios`. The server part is in
  `nearsy-functions` PR #47 (`hotfix/visibility-absent-mode`), and its incident note
  `docs/operations/incident-2026-11-20-absent-mode.md` is the reference.
- **Not part of this hotfix:** AppsFlyer (analysis only, no code anywhere) and any Android change.

## What happened (iOS 2.1.0 (84), `05aea3e`)

The CRJ first step, Profile Type, calls `setActiveProfileMode({mode})` while both faces are still
empty. New accounts have no stored `mode`, so the server reads them as Personal:

| Choice in step 1 | Server before the fix | Effect |
|---|---|---|
| Personal | Same mode, incomplete face: ok, **nothing written** | `mode` is never stored. `activateVisibility` later fails with `profile-incomplete` on `mode` |
| Professional | Change to an incomplete face: `PROFILE_INCOMPLETE` | Alert "destination incomplete"; the user cannot leave step 1 |
| Professional, back to step 1, then Personal | Same rejection | Blocked |

Local state is not proof. The client shows the choice before the server confirms it, but what
persists is the `mode` field on the user document.

## Contract (agreed with Functions and Android, PR #47)

- **CRJ selection window:** all of these hold:
  - `profileSetupCompleted !== true`;
  - `visibility !== true`;
  - there is no `discoveryProfiles/{uid}`;
  - the stored mode is absent or valid.
- **Inside the window:** `setActiveProfileMode` accepts Personal or Professional on an incomplete face.
  - It stores `mode` and answers `ok` with `targetProfileComplete: false`.
  - When the stored mode changes, the top-level mirror moves to the target face (C5b option A).
- **Outside the window:** a later mode change to an incomplete face still gets `PROFILE_INCOMPLETE`.
- **`activateVisibility`:** keeps every requirement: `profileSetupCompleted`, the stored mode's complete
  face, and the age. The only exception is an absent mode, which is read as Personal.

## iOS change

- **Code fix:** `resolveCrjResume` no longer resumes past Profile Type when the document has no valid
  stored `mode`.
  - **Before:** a named cursor won. The screen then had `mode = null`, so every later save returned
    without writing and Finish did nothing. This affected accounts interrupted before the server fix.
  - **Now:** the user picks the type again, and the callable stores it.
- **No other change was needed.** Step 1 already applies `response.mode` from an `ok` answer, and only
  `finishOnboarding` sets `profileSetupCompleted: true` before calling `activateVisibility`.
- **Test build:** new EAS profile `dev-internal`.
  - Internal (ad hoc) distribution, no dev client and no Metro.
  - Targets `nearsy-dev` (App Check debug provider).
  - PostHog is off.
  - Version 2.1.0 (85). It is never submitted.
- **Tests:** `packages/shared/src/__tests__/crjInitialModeHotfix.test.ts`.

## Known limitation (not changed)

At the end of the CRJ, a failed activation shows a generic message, not the missing field.
