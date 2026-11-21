# AGENTS.md: Nearsy Android

Instrucciones para agentes que trabajan en la **historia Android** de `godiehurtado/nearsy-app` (rama canónica `develop-android`).

## 1. Reglas comunes

Este archivo contiene solo las particularidades del componente. Las reglas comunes de todos los agentes de Nearsy están en la documentación central:

- Entrada: `C:\Users\Godie\OneDrive\Freelance\ANA_PEREZ\NEARCY\Standardization_Nearsy\START_HERE.md`
- Reglas operativas vigentes: `C:\Users\Godie\OneDrive\Freelance\ANA_PEREZ\NEARCY\Standardization_Nearsy\04_AI_Development\Agent_Methodology\agent-operating-rules.md`
- Ficha técnica Android: `C:\Users\Godie\OneDrive\Freelance\ANA_PEREZ\NEARCY\Standardization_Nearsy\02_Architecture\System_Overview\component-android.md`

**Si la ruta central no está disponible:** registra la limitación, aplica este archivo y continúa solo con el trabajo que no dependa de la información ausente.

**Precedencia:**
1. la tarea;
2. las reglas operativas comunes;
3. este archivo;
4. STD-003, solo en sus partes compatibles.

`.cursor/rules/project-rules.mdc` contiene pautas de estilo y remite a este archivo; si hay conflicto, prevalece este.

## 2. Historia y ramas

- Este repositorio aloja **dos historias canónicas independientes**: `develop-android` (esta) y `develop-ios`.
  - Nunca hagas merge, cherry-pick ni rebase entre ellas.
  - No copies código, documentos ni referencias de la rama iOS.
  - Las referencias locales a `develop-ios` en un clon Android pueden estar desactualizadas: no las uses como referencia de iOS.
- `packages/shared` en esta rama es la **versión Android**. No supongas que coincide con la de iOS.
- **Crea la rama de trabajo desde `develop-android`**, con un nombre acorde a la tarea. La integración en `develop-android` es un merge y requiere autorización explícita.
- Antes de trabajar, confirma con Git la ruta, el remoto, la rama activa y el HEAD.

## 3. Estructura

- `apps/nearsy-android`: capa fina, con `index.ts` y `App.tsx`, que reexporta `@nearsy/shared`.
  - Proyecto nativo con generación continua (CNG): `android/` no está versionado y lo genera `expo prebuild`.
  - La personalización nativa está en `apps/nearsy-android/plugins/`.
  - La configuración vigente es `apps/nearsy-android/app.json`, `app.config.js` y `eas.json`. Los `app.json`/`eas.json` de la raíz del repositorio no son la configuración de los builds Android.
- `packages/shared/src`: la lógica de la app. Los archivos `*.android.ts(x)` son específicos de Android.
- Gestor de paquetes: pnpm (`pnpm-lock.yaml`). `patch-package` se aplica en `postinstall`.

## 4. Particularidades técnicas

- **Firebase:** React Native Firebase para Auth, Firestore, Storage, Functions y App Check, en la región `us-central1`.
  - App Check usa Play Integrity en producción y el proveedor debug solo en los perfiles de nearsy-dev: `development-nearsy-dev` y `appsflyer-nearsy-dev`. Este último es un APK interno sin dev client, con AppsFlyer habilitado.
  - Falla cerrado; no lo relajes.
- **Entorno de build:** `NEARSY_FIREBASE_ENV`.
  - `development` usa `nearsy-dev`; cualquier otro valor usa **`nearsy-pj` (producción)**.
  - Los perfiles `preview`, `beta` y `qa` también apuntan a producción.
- **versionCode:** `appVersionSource: remote`, así que lo gestiona EAS. El `versionCode` de `app.json` no es la referencia.
- **Ubicación, descubrimiento y push:**
  - las cadencias están en `services/backgroundLocation.ts`, `components/LiveLocationTracker.tsx`, `hooks/useLiveLocation.ts`, `visibility/contractualLocationRefresh.ts` y `hooks/useNearbyAlerts.ts`;
  - el token de Expo Push se guarda en `users/{uid}/pushTokens`;
  - cambiar las cadencias o la ruta de escritura de la ubicación afecta a la carga y al coste del backend, así que requiere una tarea explícita.

## 5. Validación

- La compilación y la validación locales forman parte de cualquier implementación autorizada; no requieren permiso adicional:
  - `pnpm install` según el lockfile;
  - `typecheck`;
  - `check:metro-imports`;
  - las pruebas node:test de `packages/shared/src`, según indica cada documento de `docs/`.
- No hay pruebas e2e.
- Requieren autorización explícita y separada:
  - `eas build`;
  - subidas a Google Play;
  - actualizaciones OTA.

## 6. Configuración y secretos

- No muestres, copies ni registres valores de `google-services*.json`, `.env*`, variables sensibles de EAS ni tokens debug.
- Si una tarea autorizada los necesita, usa los mecanismos existentes con el mínimo acceso necesario.

## 7. Documentación de este repositorio

- Mantén en `docs/` los documentos de release, analítica, ADR (`docs/adr/`) y runbooks de Android.
- Al cerrar una tarea, indica en el reporte qué debe actualizarse en la ficha técnica central.
- Este archivo es la fuente oficial de las particularidades de Android. Actualízalo aquí.
