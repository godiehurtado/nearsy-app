# iOS 2.0.9 Altercall — interest manifesto

Accessible record of catalog IDs touched in this package. Persisted selections keep their IDs. Display names change only where the same entity is renamed without narrowing.

Status values: `existing` (same ID, same meaning), `new` (new selectable ID), `legacy` (not selectable; still displayed until DATA-INT-02).

## Decisions

- `sports_motorsports` stays **Motorsports / Deportes de motor**. Prior meaning covers motor sport generally (cars, motorcycles, rally, karting). Relabeling it Car Racing / Automovilismo would silently narrow persisted rows. Android “Car Racing” is coverage correspondence to this existing ID, not a new ID and not a rename.
- `sports_hockey` stays **Hockey / Hockey**. The stored entity is generic hockey. `snow-outline` is not evidence that saved rows meant ice hockey only. Ice hockey is not introduced as a new ID. Field hockey is the new ID `sports_field_hockey`.
- `travel_local` already was Local Exploration / Exploración local. No ID change.
- `travel_cultural` and `travel_latin_culture` are retired from new selection and kept as legacy display. They are not converted to `travel_world_cultures`.

## Rows

| id | previous name | EN | ES | category | icon | status |
| --- | --- | --- | --- | --- | --- | --- |
| sports_boxing | Boxing | Boxing | Boxeo | sports_outdoors | fitness-outline | existing |
| sports_pickleball | Pickleball | Pickleball | Pickleball | sports_outdoors | tennisball-outline | existing |
| sports_hockey | Hockey | Hockey | Hockey | sports_outdoors | snow-outline | existing |
| sports_motorsports | Motorsports | Motorsports | Deportes de motor | sports_outdoors | speedometer-outline | existing |
| travel_local | Local Exploration | Local Exploration | Exploración local | travel | map-outline | existing |
| sports_mma | — | MMA | Artes marciales mixtas | sports_outdoors | body-outline | new |
| sports_polo | — | Polo | Polo | sports_outdoors | medal-outline | new |
| sports_martial_arts | — | Martial Arts | Artes marciales | sports_outdoors | flash-outline | new |
| sports_padel | — | Padel | Pádel | sports_outdoors | tennisball-outline | new |
| sports_rugby | — | Rugby | Rugby | sports_outdoors | american-football-outline | new |
| sports_cricket | — | Cricket | Críquet | sports_outdoors | baseball-outline | new |
| sports_field_hockey | — | Field Hockey | Hockey sobre césped | sports_outdoors | golf-outline | new |
| sports_table_tennis | — | Table Tennis | Tenis de mesa | sports_outdoors | tennisball-outline | new |
| sports_badminton | — | Badminton | Bádminton | sports_outdoors | tennisball-outline | new |
| sports_fencing | — | Fencing | Esgrima | sports_outdoors | flash-outline | new |
| sports_archery | — | Archery | Tiro con arco | sports_outdoors | locate-outline | new |
| travel_world_cultures | — | World Cultures | Culturas del mundo | travel | earth-outline | new |
| travel_cultural | Cultural Experiences | Cultural Experiences | Experiencias culturales | travel | globe-outline | legacy |
| travel_latin_culture | Latin Culture | Latin Culture | Cultura latina | travel | flag-outline | legacy |

Not created: `sports_car_racing`, `sports_ice_hockey`, `travel_local_exploration`.

## Backend admission (not done in this iOS PR)

Selectable in UI does **not** mean matching, embeddings, or encounter-notify push are resolved.

New IDs the backend must admit before those pipelines treat them as official catalog:

1. Functions official interest / embeddings catalog (outside this repo). iOS Discovery limits are aligned to backend hint `f2855a1` in `packages/shared/src/visibility/constants.ts`; the embeddings generator that consumes catalog IDs is Functions, not this app.
2. Any server-side profile-write allowlist that rejects unknown `interests*` IDs.
3. Matching / Discovery embedding refresh: a new ID stored on a profile produces no usable embedding until the catalog in (1) includes it.
4. Encounter-notify interest-side matching, if it uses official interest IDs — Functions PR #40 (`feat/209-encounter-notify`, HEAD `2426d624417e318ae2d939e1213cb137e7079b46`), still in review and not deployed.
5. DATA-INT-02 data migration for legacy display IDs (`travel_cultural`, `travel_latin_culture`). Until then they remain visible and deletable only.

`custom_*` rows stay `isCustom: true` and are excluded from matching on the client catalog rules.
