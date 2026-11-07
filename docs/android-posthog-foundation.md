# Android PostHog foundation

Scope: first batch of Tracking Plan v1, Android only. Remote capture is off in every build,
production included. Nothing here has run on a device or reached PostHog yet.

## What this batch sends

| Kind | Names |
|---|---|
| Events | `app_opened`, `signup_completed` (email, Google, Facebook), `profile_completed` |
| Person properties | `email`, `profile_type`, `languages`, `occupation`, `platform`, `app_version` |
| Properties on every event | `platform`, `app_version`, `app_build`, `environment`, `tracking_plan_version` |

An unknown value is omitted. A confirmed empty value is explicit: `languages: []` and
`occupation: null`. The Firebase UID is the `distinct_id`.

## Activation

`resolveAnalyticsConfig` returns one of three modes:

| Mode | When | Effect |
|---|---|---|
| `inspect` | Any `__DEV__` build | Sanitized local logs; the SDK is not loaded |
| `off` | Default in release builds, or any invalid setting | No-op; the SDK is not loaded |
| `remote` | All the conditions below | Sends to `https://us.i.posthog.com` (project 716015) |

Remote needs all of these at build time, and none is set by this change:

- `NEARSY_ANALYTICS_ENABLED=true`
- `NEARSY_ANALYTICS_ENV=production`
- `NEARSY_POSTHOG_TOKEN`, a valid project token
- `NEARSY_FIREBASE_ENV=production` and no development client

`preview` and any other environment resolve to `off`, because they use production Firebase UIDs
and would write onto real people. The token is embedded in the build only when capture is enabled.
Do not put it in reports, logs or tracked files.

## Automatic capture

Not used: `PostHogProvider`, lifecycle events, session replay, exception autocapture, remote
config, surveys, feature flags and GeoIP. As a backstop, `before_send` drops any event other than
the three above and the SDK's `$identify` and `$set`.

## Identity and ordering

Every operation runs on one serial chain and reads `firebaseAuth.currentUser` when it executes:

- Identify runs before any event of that account, whichever arrives first: the auth listener or
  the credential promise.
- A to B resets before identifying B, with or without a logout in between.
- An event requested for a user who is no longer signed in is dropped.
- If `identify` fails, the event is not sent.
- A `distinct_id` persisted by an earlier run is reset if it does not match the current user.

Analytics starts from the mounted `App` component and is not imported by the background location
task.

## `app_opened`

It fires on the first foreground state after the first auth emission, and on a return from
background after at least 30 seconds away.

The minimum exists because React Native on Android reports `background` on every host pause
(`AppStateModule.onHostPause`), which includes permission dialogs and sign-in activities. **The
30-second value is an implementation assumption and needs product confirmation.** A dialog that
stays open longer counts as an open; a shorter app switch does not.

`session_id` comes from the SDK's `getSessionId()`, so it is absent in `inspect` mode.

### `is_first_open`: proposal, currently omitted

Neither of these proves a first open:

- `nearsy.hasSeenWelcome` records that the Welcome screen was seen, not an app open.
- The SDK's install marker only means "first run with PostHog installed".

Proposal, pending physical validation:

1. Send `true` only when no local marker exists and `getInstallationTimeAsync()` equals
   `getLastUpdateTimeAsync()`, meaning the package was never updated.
2. Otherwise send `false` if a marker exists or the package was updated. Omit it if a read fails.
3. Write the local marker after the first event is handed to the SDK.

To prove on devices first:

- Fresh install, update from a previous build, and reinstall.
- Android backup and restore, which could bring the marker back.
- Whether a reinstall should count as a first open.

### Users who already had the app

- Older binaries send nothing until they update.
- The first `app_opened` after updating is not a first open of the app, and "first seen" in
  PostHog is not the install date. First opens and D1/D7/D30 cohorts must start from installs after
  this release.
- No historical events are emitted. Restored sessions are identified without `signup_completed` or
  `profile_completed`, and their properties arrive from the profile listener.
- A signed-out existing user stays anonymous until login.

## Limitations

- `signup_completed` is not sent for LinkedIn: the identity service does not report new accounts yet.
- Email signup fires once the Auth account exists, even if the later profile write fails.
- A deleted and recreated account has a new UID and counts as a new signup.
- "Only once" is per process, and delivery is at most what the SDK retries. Duplicates or losses
  are possible, so analyses should count unique people.
- `completion_time_min` is elapsed time since the Firebase Auth account was created, not active
  time. Accounts created before tracking produce valid but non-comparable values. Filter them by
  release date.
- Unchanged person properties are written at most once per process, not once ever.

## QA on a physical Android device (Metro 8082)

No remote capture is involved. Use test accounts in `nearsy-dev` only.

```bash
adb reverse tcp:8082 tcp:8082
```

```bash
NEARSY_FIREBASE_ENV=development NEARSY_DEV_CLIENT=true pnpm --filter nearsy-android exec expo start --dev-client --port 8082
```

Filter Metro logs by `[analytics:inspect]` and check:

| Step | Expected |
|---|---|
| Cold start, signed out | One `capture app_opened`, no identify |
| Register by email | `identify`, then one `capture signup_completed` |
| Google or Facebook, new account | Same sequence |
| Google or Facebook, existing account | `identify` without `signup_completed` |
| Restart with a session | One `identify` and `capture app_opened`, no signup |
| Finish CRJ | One `capture profile_completed`, with `completion_time_min` |
| Lose network at the final CRJ save | No event until the save succeeds |
| Edit occupation or switch mode | One `set_person` per real change |
| Logout | `reset`, then `register` |
| A then B | `reset` before B's `identify` |
| Background 30 seconds or more | One new `capture app_opened` |
| Permission dialog closed quickly | No new `capture app_opened` |
| Any line | No email, occupation, UID or token in clear |

### Dev Client

- **Installed client is enough to try this batch** if it includes `expo-application`. Autolinking
  finds that module, but this was not confirmed against the client on the device.
- **Check:** the first `register` log must show `app_version` and `app_build`. If they are missing,
  build a new Dev Client. The app keeps working without them.
- **Remote mode needs a new build,** because its settings are fixed at build time. It is not part
  of this batch.

## Tests

From `packages/shared`:

```bash
node --experimental-strip-types --test src/analytics/__tests__/analyticsFoundation.test.ts
```
