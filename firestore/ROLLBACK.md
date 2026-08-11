# Rollback procedure — nearsy-dev Firestore rules

**Do not execute** until an approved deploy needs reversal. This documents a reproducible Dev rollback.

## 1. Immediately before deploy (mandatory)

From a machine with Firebase CLI auth that can read `nearsy-dev`:

```bash
# Record active release (PowerShell example)
$cfg = Get-Content "$env:USERPROFILE\.config\configstore\firebase-tools.json" -Raw | ConvertFrom-Json
$token = $cfg.tokens.access_token
$headers = @{ Authorization = "Bearer $token" }
$rel = Invoke-RestMethod -Uri "https://firebaserules.googleapis.com/v1/projects/nearsy-dev/releases" -Headers $headers
$fs = $rel.releases | Where-Object { $_.name -like "*/cloud.firestore" }
$fs.rulesetName
$fs.updateTime

# Save ruleset id, e.g.:
# projects/nearsy-dev/rulesets/<UUID>
```

Also download and keep the **source** of that ruleset locally **outside git** (e.g. `.local-validation/pre-deploy-nearsy-dev-firestore.rules`):

```bash
# GET https://firebaserules.googleapis.com/v1/{rulesetName}
# Write source.files[].content to a local file under .local-validation/
```

Known pre-parity Dev ruleset (deny-all, 2026-08-09):  
`projects/nearsy-dev/rulesets/82e88076-a595-4d01-979e-de7da21a94ae`  
Re-fetch before any deploy; do not rely on this id alone without verifying it is still the active release.

## 2. After a bad deploy — restore prior release

Create/update the `cloud.firestore` release to point at the **saved** `rulesetName` (Rules API `projects.releases.patch` / Console → Rules → historical ruleset). Prefer the API so the target is an exact id, not a verbal “previous ruleset”.

Do **not** redeploy Production rules to Dev by copying project ids into `firebase.json`.

## 3. Verify

```bash
# Re-list releases; confirm rulesetName matches the saved pre-deploy id
# Smoke: authenticated self-read of users/{uid} behaves as expected for Dev
```

## Constraints

- Never run this procedure against `nearsy-pj` unless explicitly authorized.
- Never commit ruleset dumps that contain PII (Production dumps should stay in `.local-validation/`).
