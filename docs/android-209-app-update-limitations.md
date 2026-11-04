# Android 2.0.9: app update notice limitations

**The v2 client (#118) is out of this release, as on iOS.** This build keeps the existing client, and no
notice is activated by it.

## What this client does

- **Request:** `getAppUpdatePolicy` with exactly `{ platform: 'android' }`, which Functions #43 serves as channel `production`.
- **Reads:** only the legacy aliases `enabled`, `latestVersion` and `storeUrl`.
- **Shows:** an optional notice with Update and Later. It never blocks.

Checked by passing the output of the #43 `resolveAppUpdatePolicy` through this client's parser and decision,
with 2.0.9 installed. The deployed callable itself was not called.

| Server configuration | Result |
|---|---|
| Neutral (current intent) | No notice |
| Legacy bridge, `latestVersion` 2.0.10 | Optional notice |
| `RECOMMENDED_VERSION` 2.0.10, `RECOMMENDED_BUILD` 0 | Optional notice |
| `RECOMMENDED_VERSION` 2.0.9, `RECOMMENDED_BUILD` 46 | No notice |
| `FORCE_ENABLED` with minimum 2.0.10, build 1 | No notice |

## Limitations

- **No mandatory update.** `forceEnabled` and `minimum` are ignored, so policy cannot block a 2.0.9 install later.
- **No comparison by build.** Two 2.0.9 builds look identical, so a newer versionCode of 2.0.9 can never be announced.
- **No channel.** A Play Internal install is treated as production, and any notice sends it to the public listing.
- **`cacheTtlSeconds` is ignored.** The client uses its own 15-minute refetch interval.
- **Only the default `storeUrl` is accepted.** An override, even an allowlisted one, makes the client discard the policy, so no notice appears.

## For whoever activates notices later

Marketing-only soft notices (build `0` or the legacy bridge) reach this client. They would send Play Internal
installs to the public listing, so confirm availability for that audience first.
