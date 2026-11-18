# AGENTS.md: Nearsy iOS

Instrucciones para agentes que trabajan en la **historia iOS** de `godiehurtado/nearsy-app` (rama canónica `develop-ios`).

## 1. Reglas comunes

Este archivo contiene solo las particularidades del componente. Las reglas comunes de todos los agentes de Nearsy están en la documentación central:

- Entrada: `C:\Users\Godie\OneDrive\Freelance\ANA_PEREZ\NEARCY\Standardization_Nearsy\START_HERE.md`
- Reglas operativas vigentes: `C:\Users\Godie\OneDrive\Freelance\ANA_PEREZ\NEARCY\Standardization_Nearsy\04_AI_Development\Agent_Methodology\agent-operating-rules.md`
- Ficha técnica iOS: `C:\Users\Godie\OneDrive\Freelance\ANA_PEREZ\NEARCY\Standardization_Nearsy\02_Architecture\System_Overview\component-ios.md`

**Si la ruta central no está disponible:** registra la limitación, aplica este archivo y continúa solo con el trabajo que no dependa de la información ausente.

**Precedencia:**
1. la tarea;
2. las reglas operativas comunes;
3. este archivo;
4. STD-003, solo en sus partes compatibles.

`.cursor/rules/project-rules.mdc` contiene pautas de estilo y remite a este archivo; si hay conflicto, prevalece este.

## 2. Historia y ramas

- Este repositorio aloja **dos historias canónicas independientes**: `develop-ios` (esta) y `develop-android`.
  - Nunca hagas merge, cherry-pick ni rebase entre ellas.
  - No copies código, documentos ni referencias de la rama Android.
- `packages/shared` en esta rama es la **versión iOS**. No supongas que coincide con la de Android.
- **Crea la rama de trabajo desde `develop-ios`**, con un nombre acorde a la tarea. La integración en `develop-ios` es un merge y requiere autorización explícita.
- Antes de trabajar, confirma con Git la ruta, el remoto, la rama activa y el HEAD. Ninguna carpeta es canónica por su nombre.

## 3. Estructura

- `apps/nearsy-ios`: capa fina. `index.ts` registra `App`; `App.tsx` reexporta `@nearsy/shared`. Contiene además los plugins de configuración (`plugins/`), los scripts de build (`scripts/`), `app.json`, `app.config.js` y `eas.json`.
- `packages/shared/src`: la lógica de la app. Los archivos `*.ios.ts(x)` son específicos de iOS.
- Gestor de paquetes: pnpm, según el campo `packageManager` de `package.json` en la raíz, con `pnpm-lock.yaml`.

## 4. Particularidades técnicas

- **Firebase:**
  - el SDK JS gestiona Auth, Firestore y Storage;
  - React Native Firebase se usa solo para App Check y Functions;
  - las callables se llaman con `firebase/callableHttp.ts`: ID token más App Check, región `us-central1`;
  - las de LinkedIn usan `httpsCallable` de RNFB.
- **Entorno de build:** se elige en tiempo de build con `EXPO_PUBLIC_NEARSY_FIREBASE_ENV`.
  - `development` usa `nearsy-dev`; vacío o `production` usa **`nearsy-pj` (producción)**.
  - `app.config.js` valida el proyecto y el bundle: no relajes esas comprobaciones.
- **Versión y build number:** `app.config.js` los toma de `NEARSY_IOS_VERSION` / `NEARSY_IOS_BUILD_NUMBER`, definidos en cada perfil de `apps/nearsy-ios/eas.json` (`appVersionSource: local`). Cambiarlos es un bump de versión y requiere autorización.
- **Ubicación, descubrimiento y push:**
  - las cadencias están en `background/bgPublishThrottle.ts`, `visibility/contractualLocationRefresh.ts`, `components/LiveLocationTracker.tsx` y `hooks/useNearbyAlerts.ts`;
  - el token de Expo Push se guarda en `users/{uid}/pushTokens`;
  - cambiar las cadencias afecta a la carga y al coste del backend, así que requiere una tarea explícita.

## 5. Validación

- La compilación y la validación locales forman parte de cualquier implementación autorizada; no requieren permiso adicional:
  - `pnpm install` según el lockfile;
  - `typecheck` en `apps/nearsy-ios`;
  - las suites `test:*` de la raíz (node:test con tsx);
  - `test:*` de `apps/nearsy-ios`.
- No hay pruebas e2e. Para cambios de interfaz, añade una prueba manual con captura.
- Requieren autorización explícita y separada:
  - `eas build`;
  - envíos a TestFlight o a la App Store;
  - actualizaciones OTA.

## 6. Configuración y secretos

- No muestres, copies ni registres valores de `GoogleService-Info*.plist`, `.env*`, secretos de EAS ni tokens debug de App Check.
- Si una tarea autorizada los necesita, usa los mecanismos existentes (variables de entorno o secretos de EAS) con el mínimo acceso necesario.

## 7. Documentación de este repositorio

- Mantén en `docs/` los documentos de release, analítica y ADR de iOS.
- Al cerrar una tarea, indica en el reporte qué debe actualizarse en la ficha técnica central.
- Este archivo es la fuente oficial de las particularidades de iOS. Actualízalo aquí.
