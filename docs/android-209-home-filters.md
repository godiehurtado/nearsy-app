# Android 2.0.9 Home filters: saving age and distance

Scope: PR #117, Android client. Not validated on a device yet. The iOS incident closed by
Functions #45 says nothing about Android, which needs its own check.

## How a save works

`visibility/searchPreferencesWriter.ts` is one save queue per signed-in account.

- **One write at a time.** Replies cannot arrive out of order, and rapid slider moves
  coalesce into the latest intent.
- **What is shown is derived:** last confirmed + what is still unsent. Nothing has to be
  rolled back by hand.
- **A success is confirmed even if a newer intent exists.** If the newest write then fails,
  the UI returns to that confirmed value, not to the one before it.
- **An older failure with a newer intent** carries its fields into the next write and stays
  quiet; that write's result decides. There are no automatic retries.
- **Only the edited fields of one mode are sent,** merged key by key. The other mode and
  untouched fields, including stored interests, are never copied from local state.
- **Replies for another account change nothing,** and nothing queued is sent after the
  account changes. Nothing is written before the first read of the account.

A failure shows `home.errors.preferencesSave` and touches no Visibility state. Saving
triggers no matching or reevaluate. Interests stay hidden behind
`MVP_FREE_SHOW_INTEREST_SEARCH_FILTER`.

## Stored data is not repaired

- A mode with **no stored map** gets one complete first write, because the rules require
  all fields. Nothing is being replaced.
- A mode with **any stored map, even an invalid one,** only receives the edited fields.
- With invalid historical data the rules deny the save. It shows the error and rolls back,
  and the data stays as stored. This also applies when only the other mode is invalid,
  since the rules validate both once `searchPreferences` changes.
- **Known display limit, not changed here:** `parseSearchPreferencesFromUserDoc` still shows
  defaults for an invalid stored mode. It only affects what is shown; those defaults are
  no longer written.

## Rules check

`packages/shared/src/__tests__/android209SearchPrefsRules.emulator.mjs` runs Home's exact
payload against the rules of Functions #45 (merge `34b08370c4b9e1a1850f5b54c2a7c8d72969647f`).
It uses the local emulator and synthetic data only. It refuses anything but localhost, and
checks the SHA-256 of the rules file. It is outside the regular suites because the rules
live in `nearsy-functions`.

```bash
NEARSY_FIRESTORE_RULES=/path/to/firestore/firestore.rules firebase emulators:exec --only firestore --project demo-nearsy-rules "node --experimental-strip-types --test packages/shared/src/__tests__/android209SearchPrefsRules.emulator.mjs"
```

It sends the write through the emulator's REST API with a merge mask built as the SDK
builds one, not through the native Android SDK. Device QA covers that last step.

## Rules mirror: retired

Cursor's local `searchPreferencesRulesMirror.ts` is not part of this work. It had no
consumers, reflected rules older than #44 and #45, and would have been a second source of
truth that passes while the real rules deny. The emulator check above replaces it with the
real engine. The original stays in the backup folder outside the repository.

## Limits

- Android device QA is pending.
- While offline, a native write stays pending until it reaches the server, so the section
  keeps showing the intent. No timer declares a result.
- Leaving Home does not cancel the queue; a remount during a save starts a new queue from
  the next read.
