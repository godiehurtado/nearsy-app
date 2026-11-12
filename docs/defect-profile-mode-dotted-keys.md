# Defect: per-mode profile fields saved as literal dotted names

**Status:** open, not scheduled. Excluded from 2.1.0 by Owner decision.

**Do not:**
- change the save code;
- migrate or repair documents;
- change the backend read precedence until real data and impact have been checked.

## What happens (from code)

- Profile saves call `upsertUserProfile` → `setDoc(ref, { ...patch }, { merge: true })` (`packages/shared/src/services/firestoreService.ts`).
- `buildActiveProfileSavePatch` builds keys such as `profiles.professional.company` (`packages/shared/src/profile/profileModeFields.ts`).
- `setDoc` does not parse field paths, so each key is stored as a literal top-level field named `profiles.professional.company`, not inside the `profiles` map. Only `updateDoc`, or set with `mergeFields` / `FieldPath`, expands dots.
- The nested `profiles` map exists only from the account shell (`createUserProfile`), with empty strings.

## Who reads what

- **Client:** `resolveModePresentation` reads the nested map first, then falls back to top level for the active mode.
- **Functions:** `faceFields.ts` (`resolveActiveFaceField`) and matching `dirtyDetect.ts` read the nested map; empty nested values fall back to top level. Functions never reads the literal dotted names.
- **Net effect:** both sides use the top-level copies, which `projectActiveToTopLevel` fills only for the active face.
  - The inactive face's saved values are invisible to Functions.
  - Discovery and pushes are unaffected, because they use only the active face.
- **PostHog** `first_name` / `last_name` (2.1.0) read the same top-level fields, so they are consistent with Functions.
- **Industry** is proposed as a top-level `professionalIndustryId`, outside this problem.

## Before any fix

1. The Owner authorizes reading one or more test `users/{uid}` documents, listing field names only, to confirm the stored shape.
2. Measure impact:
   - how many documents carry literal dotted fields;
   - whether any inactive-face data exists only there.
3. Decide the fix together with Functions:
   - `updateDoc` for dotted patches, or nested objects with set-merge;
   - the migration of existing literal fields;
   - the precedence change, since filled nested maps would win over top level in Functions.
4. Run a joint test pass before shipping.

Found during 2.1.0 review (iOS and Functions, 2026-11-12).
