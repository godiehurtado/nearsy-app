# Firestore Rules — Source of Truth (nearsy-dev)

Status: **DEV_RULES_FUNCTIONAL_PARITY_WITH_PRODUCTION** (local; not deployed).

## Targets

| Item | Value |
|------|--------|
| Dev project | `nearsy-dev` |
| Dev database | `(default)` |
| Rules file (SoT) | `C:\nsy\firestore\firestore.rules` |
| Config | `C:\nsy\firestore\firebase.json` → `"database": "(default)"` |
| Alias | `C:\nsy\firestore\.firebaserc` → `default: nearsy-dev` |

## Functional reference (Production)

| Item | Value |
|------|--------|
| Reference project | `nearsy-pj` |
| Reference database | `(default)` |
| Reference inspected | 2026-08-11 (read-only Rules API) |
| Reference release | `projects/nearsy-pj/releases/cloud.firestore` |
| Reference ruleset | `projects/nearsy-pj/rulesets/904f6dd5-3f24-4644-a487-688d2bbb44f5` (id only; not embedded in rules) |
| Reference updateTime | `2026-03-19T20:43:13.371060Z` |

Local rules reuse **authorization logic only** (owner / visibility / subcollections / reports / moderation). They do **not** copy Production project identifiers into the rules source.

## Intent

- This file seeks **functional parity**, not security hardening.
- No field allowlists, type gates, or new immutability in this phase.
- Future hardening must be a **separate** change after parity is deployed and validated.

## Explicit non-SoT / obsolete

| Path | Role |
|------|------|
| `NEARSY/firebase.json` + `nearsy-db` | Obsolete / incorrect for Android CRJ against nearsy-dev; **do not use** for deploy |
| `nearsy-identity-functions/firestore.rules.emulator-draft` | Identity emulator draft only — **not** global app SoT |
| Production console-only rules | Functional reference until mirrored here; not the Dev deploy path |

## Future deploy (do not run until approved)

```bash
cd C:\nsy\firestore
firebase use
# expect: nearsy-dev
# confirm firebase.json database == "(default)" and rules == "firestore.rules"
firebase deploy --only firestore:rules --project nearsy-dev
```

`--only firestore:rules` deploys **rules only** (not indexes).

## Rollback (Dev) — see ROLLBACK.md

Record the active `rulesetName` for `cloud.firestore` on `nearsy-dev` immediately before deploy; restore that release via the Rules API if needed.
