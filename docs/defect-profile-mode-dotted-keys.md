# Defect: per-mode profile fields saved as literal dotted names

**Status:** in 2.1.0 scope since the QA of build 81 (Owner, 2026-11-13). Client fix C1–C4 on feature/ios-210, agreed with Functions and Android; server C5/C5b and any migration are separate Owner decisions. See **Fix (2.1.0)** below.

**Do not** (original 2026-11-12 limits; the save-code limit is superseded by the 2.1.0 fix below, the other two still hold):
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

## Fix (2.1.0)

QA 2.1.0 (81): a Professional face saved while Personal was active looked lost after relogin, and a later switch mixed both faces. Cause: the literal dotted fields above, plus readers (app and server) that fall back to top level.

Contract agreed with Functions and Android (iOS code in `profile/profileModeFields.ts`, `profile/userProfileSetPayload.ts`, `services/firestoreService.ts`):

- **C1 Write:** face fields go to the real nested map `profiles.<mode>.<field>` (one set-merge with nested objects). Never blanks, never the other mode. The top-level mirror is written only for the confirmed active face; mode changes only through `setActiveProfileMode`.
- **C2 Cleanup:** the same write deletes the literal `"profiles.<mode>.<field>"` fields it writes (that face only). This is not a migration.
- **C3 Read:** literal → nested → top level only for the stored active mode. The `profiles` map may be absent.
- **C4:** an absent value never authorizes writing or copying into the other mode. The inactive face never borrows top-level values.
- **C5/C5b (server, Owner decision):** same precedence in Functions; `setActiveProfileMode` writes the top-level mirror from the target face. iOS does not depend on it.
- **Migration of existing literals:** a separate plan, not executed.
- **Affected account:** nobody saves a profile on it from any build until the Owner decides its recovery (C2 would delete literal fields that are evidence).

Tests: `__tests__/profileFaceContract.test.ts` (in-memory set-merge model, controlled data).
