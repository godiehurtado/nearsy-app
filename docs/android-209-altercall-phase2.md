# Android 2.0.9 Altercall / phase-2 package

Baseline: `origin/develop-android` `2f4a8b78bff6e09ccfa67020f4ccb0b8bac345bd` (merge #108).
Beta AAB 2.0.9 (43) remains `d92c482` and is not this branch.

No merge, bump, build, submit, iOS, FCM rotation, or Functions deploy in this PR.
Physical device QA was not executed in this delivery.

## Requirement matrix

| Block | Result | Status |
|---|---|---|
| 1 Password show/hide | Login + Register/CRJ hidden by default, EN/ES a11y, autofill preserved. Confirm-password exists only as unused i18n; Auth unchanged. Age 18–99 untouched. | Implemented; physical QA pending |
| 2 Alignment / Compatibilidad | EN Alignment, ES Compatibilidad. Tier badges/labels not rendered. Score and DTO unchanged. | Implemented; physical QA pending |
| 3 Other icons | Common 113 Ionicons (same names as iOS #109 unique glyphmap set). Original 20 first. EN/ES search; virtualized modal. Historical 11 Android-draft extras still render. | Implemented; physical QA pending |
| 4 Sports catalog | Existing sports kept. `sports_boxing` / `sports_pickleball` existing. `sports_motorsports` stays Motorsports; `sports_hockey` stays Hockey. New `sports_car_racing` and `sports_ice_hockey`. | Implemented client-side; backend catalog/embeddings pending |
| 5 Travel & Culture | Cultural Experiences / Latin Culture removed from new options, kept as legacy. `travel_local` reused; `travel_world_cultures` new. | Implemented; physical QA pending |
| 6 Social order + modals | YT→TT→IG→X→FB→LI→Web. Snapchat hidden. Website optional in CRJ. Connect opens per-platform modal. Instagram copy-code reverse-DM. YouTube/TikTok follow real availability. | Implemented; physical QA pending |
| 7 Immediate social persist | Verified Connect/Unlink persist without general Save. Manual links persist on modal confirm. CRJ social writes keep `profileSetupCompleted: false`. | Implemented; physical QA pending |
| 8 Contacts, prefs, Alerts | Functions #40 contracts read at `2426d624`. Independent PR from `develop-android`. Identity `syncContactHashes` not implemented until wire schema is final. | Follow-up PR |
| 9 Nearby empty vs error | Generic/retry no longer reuse “No one matches these filters”. Empty / generic / retry / visibility-off differentiated EN/ES. Retry still publish-before-discover. | Implemented; physical QA pending |
| 10 Preservations | Distances hidden, affiliations-before-interests, `androidCrjResume`, silent Discovery refetch, #108 token lifecycle, Delete Account seal, FCM v1 untouched, no Apple Sign-In, no new PostHog, patch-package kept. | Preserved in this PR |

## Catalog manifesto

### Sports (`sports_outdoors` / Sports group)

| id | EN | ES | icon | status |
|---|---|---|---|---|
| sports_football | Football | Fútbol americano | american-football-outline | existing |
| sports_basketball | Basketball | Baloncesto | basketball-outline | existing |
| sports_baseball | Baseball | Béisbol | baseball-outline | existing |
| sports_soccer | Soccer | Fútbol | football-outline | existing |
| sports_tennis | Tennis | Tenis | tennisball-outline | existing |
| sports_golf | Golf | Golf | golf-outline | existing |
| sports_volleyball | Volleyball | Voleibol | football-outline | existing |
| sports_hockey | Hockey | Hockey | snow-outline | existing — generic Hockey, not narrowed to Ice Hockey |
| sports_ice_hockey | Ice Hockey | Hockey sobre hielo | snow-outline | new |
| sports_field_hockey | Field Hockey | Hockey sobre césped | flag-outline | new |
| sports_pickleball | Pickleball | Pickleball | tennisball-outline | existing |
| sports_padel | Padel | Pádel | tennisball-outline | new |
| sports_table_tennis | Table Tennis | Tenis de mesa | tennisball-outline | new |
| sports_badminton | Badminton | Bádminton | tennisball-outline | new |
| sports_boxing | Boxing | Boxeo | fitness-outline | existing |
| sports_mma | MMA | Artes marciales mixtas | fitness-outline | new |
| sports_martial_arts | Martial Arts | Artes marciales | body-outline | new |
| sports_fencing | Fencing | Esgrima | flash-outline | new |
| sports_archery | Archery | Tiro con arco | locate-outline | new |
| sports_rugby | Rugby | Rugby | american-football-outline | new |
| sports_cricket | Cricket | Críquet | baseball-outline | new |
| sports_polo | Polo | Polo | trophy-outline | new |
| sports_motorsports | Motorsports | Deportes de motor | speedometer-outline | existing — generic Motorsports, not narrowed to Car Racing |
| sports_car_racing | Car Racing | Automovilismo | car-outline | new |
| sports_college | College Sports | Deportes universitarios | school-outline | existing |

Full table (all official + legacy + 113 icons): `docs/android-209-altercall-catalog-manifest.md`.

New IDs are client-catalog only until Functions embeddings/validation admit them. Do not treat them as matching-ready in production until the backend contract is confirmed.

### Travel & Culture

| id | EN | ES | status |
|---|---|---|---|
| travel_local | Local Exploration | Exploración local | existing equivalent of Local Exploration; `travel_local_exploration` not created |
| travel_world_cultures | World Cultures | Culturas del mundo | new |
| travel_cultural | Cultural Experiences | Experiencias culturales | legacy only (not selectable) |
| travel_latin_culture | Latin Culture | Cultura latina | legacy only (not selectable) |

Legacy rows stay visible in CRJ/editor so the user can remove them. IDs are not reused with a new meaning.

### Other icons

113 unique Ionicons names, matched read-only to iOS #109 unique identifiers and present in the Android Ionicons glyphmap. Original 20 stay first. Search is EN/ES. Picker is a virtualized modal `FlatList`. Eleven unreleased Android-draft extras remain renderable for saved customs.

### Backend dependencies

- New official interest IDs: Functions catalog / embeddings / validation.
- Social ownership: existing Identity callables; YouTube/TikTok remain disabled until Identity enables them. Client flags do not enable backend.
- Contactos / encounter-notify / Alerts identity: contracts not in this repo (`encounter-notify-contracts-v1.md`, `prompts/android-encounter-notify.md`). Implement in a later PR from `develop-android`.

## Contacts / Alerts (block 8)

Pending contract. Not implemented here. Do not close the Altercall AAB without that follow-up PR once contracts land.

Functions #40 (`godiehurtado/nearsy-functions` `2426d624`) is in review, not production. Client follow-up is a separate PR from `develop-android`. Identity `syncContactHashes` waits for the final Identity wire schema.

## Translations and copy

- Password eye: `authentication.password.show` / `hide` (EN/ES).
- Alignment title: EN `Alignment`, ES `Compatibilidad`; a11y score-only (`a11yScoreOnly`).
- Nearby empty vs error: `nearby.emptyTitle`, `nearby.errorTitle`, `nearby.inactiveTitle`, `nearby.errorGeneric`, `nearby.errorRetry`.
- Instagram: `profile.social.instagram.copyCode`, `copyCodeA11y`, `pendingSteps`, Open Instagram.
- New sports/travel labels live under `onboarding.profileCompletion.interests.items.*`.

## Tests run in this delivery

From `packages/shared` with `node --experimental-strip-types --test`:

- `src/__tests__/android209AltercallPhase2.test.ts`
- `src/__tests__/android209InstagramOwnership.test.ts`
- `src/__tests__/postCrjProfilePersistence.test.ts`
- `src/visibility/__tests__/nearbyLoadUiState.test.ts`
- `src/visibility/__tests__/discoveryCompatibilityVersions.test.ts`

`postCrjProfilePersistence` affiliations case “preserves provider/custom metadata including logo and website” still fails on this baseline (`legacy` caption ≠ raw name). It is unrelated to this package and was not changed here.

Physical EN/ES walkthrough, Android Back, large text, new/incomplete account, Personal/Professional kill-reopen, and failed-network QA were not executed.

## Out of scope (intentional)

- Merge, version bump, AAB/build, Play submit, Functions deploy.
- iOS / `develop-ios`.
- FCM v1 credential create/rotate.
- Matching DTO, count-10, OTP, TTL, Apple Sign-In, PostHog.
