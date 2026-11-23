# Android: push token for onboarding-recovery pushes

Owner requirement (2026-11-23), reviewed by Functions in godiehurtado/nearsy-functions#49
(`docs/operations/pre-event-onboarding-push-plan-2026-11-23.md`). It applies from Android 2.1.1. The
version stays at 2.1.1; the build that carries this change replaces 2.1.1 (57).

## Problem

Store builds 2.0.10 (51), 2.1.0 (55) and 2.1.1 (56/57) register the Expo token only when
`users/{uid}.profileSetupCompleted === true`, or from the Alerts tab or the More row, both after the
CRJ. The CRJ Notifications step asks for the permission but does not register the token. So no Android
account with an incomplete CRJ had a token, and an onboarding-recovery push could not reach it.

## Change

| Moment | Before | Now |
|---|---|---|
| Sign-in or session restore (`App.tsx`, auth listener) | Registers only with a completed CRJ | Registers for every signed-in account when the permission is **already granted**. Never prompts |
| CRJ Notifications step, permission already granted | Moves on | Registers the token, then moves on |
| CRJ Notifications step, permission granted at the prompt | Moves on | Registers the token right after the grant, then moves on |
| CRJ Notifications step, permission denied or skipped | Moves on | Moves on; **nothing is written** |
| Proximity-notice re-evaluation after a registration | Always (only completed profiles registered) | Only for a completed profile. A registration during the CRJ does not call `reevaluateProximityNotices` |

- Code: `notifications/onboardingPushToken.ts` (decisions), `App.tsx`,
  `screens/ProfileCompletionScreen.tsx` (`requestNotifications`), `services/pushTokens.android.ts`
  (`registerPushToken(options)`).
- Registration never blocks the step and never throws into it. A failed write is retried at the next
  sign-in.

## Contract with Functions (unchanged)

- Path: `users/{uid}/pushTokens/{expoToken}`. Fields: `token`, `platform` (`android`), `deviceName`,
  `osName`, `osVersion`, `updatedAt` (ms). Written with merge. No FCM token, no topic.
- Functions selects the recipients and their payload: `{kind:'onboarding_resume', campaign, push}`, with no
  `actorUid`.
- Tapping that push opens the app. Android ignores the unknown `kind` (`pushOpenCoordinator.ts` reads only
  `actorUid`/`alertId`). The profile gate takes the account to its pending step: date of birth → phone
  verification → CRJ at `users/{uid}.androidCrjResume.step`. No deep link is needed.
- Channel `default`, importance DEFAULT.

## Account binding (unchanged, now also covered for the CRJ)

The session lifecycle (`services/pushTokenLifecycle.ts`) still guarantees that a token is never written
under another account:

- the write goes only under the signed-in UID (`assertCurrentUid`, plus the Firestore rule `isOwner`);
- a registration whose UID changed or whose session was released while minting is dropped;
- logout deletes this device's token before `signOut`;
- an account switch releases the outgoing account's token first, and restores it if the new sign-in fails;
- Delete Account seals client writes.

Known limit (unchanged, client-side cannot fix it): after a reinstall without logout, the old account's
doc for the same device stays. If another account signs in, the same token exists under both. Functions
drops tokens shared by more than one account.

## Reach and limits

- Android 12 and below: the permission is granted at install, so every account that signs in with this
  build is registered, CRJ complete or not.
- Android 13 and above: only accounts that reached the Notifications step and granted the permission, or
  granted it from system settings. Users who leave earlier have no permission and cannot be reached.
- Only devices running this build are covered. Earlier builds keep the old behavior until updated.

## Tests

- `src/__tests__/androidOnboardingPushToken.test.ts`:
  - decisions;
  - the real session lifecycle: incomplete CRJ with permission, denial, grant at the step, logout, account
    switch, logout and account change while minting;
  - source guards on the three modified paths. The guards fail on the previous code.
- `src/__tests__/android209PushTokenLifecycle.test.ts`: updated for the new sign-in call.
- `src/services/__tests__/pushTokenLifecycle.test.ts`: unchanged, passes.

Device checks pending, on a physical Android, because App Check fails on the emulator:

1. New account, Android 13+:
   - grant at the Notifications step;
   - a `pushTokens` doc appears before finishing the CRJ;
   - quit mid-CRJ, reopen, and the token is still there.
2. Deny at the step: no doc.
3. Logout mid-CRJ: the doc is deleted.
4. Sign in with another account: the doc moves to that account only.
