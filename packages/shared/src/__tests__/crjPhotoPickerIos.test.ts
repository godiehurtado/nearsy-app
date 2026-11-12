/**
 * 2.0.11 — CRJ profile photo step on iOS: no silent exits.
 *
 * The fake native below models expo-image-picker 17.0.10 on iOS:
 * - launchImageLibraryAsync (allowsEditing) checks no Photos permission;
 * - requestCameraPermissionsAsync prompts only while undetermined;
 * - launchCameraAsync rejects without camera permission.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import en from '../i18n/locales/en';
import es from '../i18n/locales/es';
import {
  CRJ_PHOTO_PICKER_OPTIONS,
  crjPhotoOutcomeAlert,
  runCrjIosPhotoPick,
  safeErrorCode,
  type CrjPhotoPickerDeps,
  type CrjPickerResult,
} from '../onboarding/crjPhotoPicker';

const here = dirname(fileURLToPath(import.meta.url));
const screenSource = readFileSync(
  join(here, '..', 'screens', 'ProfileCompletionScreen.tsx'),
  'utf8',
);

type PhotosStatus = 'notDetermined' | 'authorized' | 'limited' | 'denied' | 'restricted';
type CameraStatus = 'notDetermined' | 'authorized' | 'denied' | 'restricted';

const PICKED: CrjPickerResult = { canceled: false, assets: [{ uri: 'file:///tmp/crop.jpg' }] };

function fakeIos(opts: {
  photos?: PhotosStatus;
  camera?: CameraStatus;
  /** Answer the system camera prompt with this when undetermined. */
  cameraPromptAnswer?: 'allow' | 'deny';
  libraryResult?: CrjPickerResult | Error;
  cameraResult?: CrjPickerResult | Error;
  permissionError?: Error;
}) {
  const calls = { library: 0, camera: 0, cameraPrompt: 0, photosPrompt: 0 };
  const state = { photos: opts.photos ?? 'notDetermined', camera: opts.camera ?? 'notDetermined' };
  const deps: CrjPhotoPickerDeps = {
    launchLibrary: async () => {
      calls.library += 1;
      // Out-of-process picker: Photos status is irrelevant and never prompted.
      const r = opts.libraryResult ?? PICKED;
      if (r instanceof Error) throw r;
      return r;
    },
    launchCamera: async () => {
      calls.camera += 1;
      if (state.camera !== 'authorized') {
        throw Object.assign(new Error('Missing camera permission'), {
          code: 'ERR_MISSING_CAMERA_PERMISSION',
        });
      }
      const r = opts.cameraResult ?? PICKED;
      if (r instanceof Error) throw r;
      return r;
    },
    requestCameraPermission: async () => {
      if (opts.permissionError) throw opts.permissionError;
      if (state.camera === 'notDetermined') {
        calls.cameraPrompt += 1;
        state.camera = opts.cameraPromptAnswer === 'deny' ? 'denied' : 'authorized';
      }
      return { granted: state.camera === 'authorized' };
    },
  };
  return { deps, calls, state };
}

function lookup(resources: unknown) {
  return (key: string, options?: Record<string, unknown>): string => {
    let node: any = resources;
    for (const part of key.split('.')) node = node?.[part];
    assert.equal(typeof node, 'string', `missing i18n key ${key}`);
    return (node as string).replace(/\{\{(\w+)\}\}/g, (_, k) => String(options?.[k] ?? ''));
  };
}
const tEn = lookup(en);
const tEs = lookup(es);

describe('CRJ photo (iOS) — library opens without general Photos access', () => {
  for (const photos of ['notDetermined', 'authorized', 'limited', 'denied', 'restricted'] as const) {
    it(`Photos ${photos}: opens the picker and returns the cropped photo`, async () => {
      const { deps, calls } = fakeIos({ photos });
      const outcome = await runCrjIosPhotoPick('library', deps);
      assert.deepEqual(outcome, { kind: 'picked', uri: 'file:///tmp/crop.jpg' });
      assert.equal(calls.library, 1);
      assert.equal(calls.photosPrompt, 0);
      assert.equal(calls.cameraPrompt, 0);
    });
  }

  it('cancel in the picker is a quiet cancel (no message)', async () => {
    const { deps } = fakeIos({ libraryResult: { canceled: true, assets: null } });
    const outcome = await runCrjIosPhotoPick('library', deps);
    assert.deepEqual(outcome, { kind: 'canceled' });
    assert.equal(crjPhotoOutcomeAlert(outcome, tEn, () => {}), null);
  });

  it('picker rejection becomes a readable error, not a silent exit', async () => {
    const err = Object.assign(new Error('file:///private/secret.jpg failed for Jane'), {
      code: 'ERR_MISSING_VIEW_CONTROLLER',
    });
    const { deps } = fakeIos({ libraryResult: err });
    const outcome = await runCrjIosPhotoPick('library', deps);
    assert.deepEqual(outcome, {
      kind: 'error',
      source: 'library',
      stage: 'picker',
      code: 'ERR_MISSING_VIEW_CONTROLLER',
    });
    assert.ok(!JSON.stringify(outcome).includes('secret'));
    assert.ok(!JSON.stringify(outcome).includes('Jane'));
    const alert = crjPhotoOutcomeAlert(outcome, tEn, () => {})!;
    assert.equal(alert.title, "Couldn't open your photos");
    assert.equal(alert.buttons.length, 1);
  });

  it('a result without a usable uri counts as cancel', async () => {
    const { deps } = fakeIos({ libraryResult: { canceled: false, assets: [{ uri: '' }] } });
    assert.deepEqual(await runCrjIosPhotoPick('library', deps), { kind: 'canceled' });
  });
});

describe('CRJ photo (iOS) — camera permission states', () => {
  it('not asked + allow: prompts once and opens the camera', async () => {
    const { deps, calls } = fakeIos({ camera: 'notDetermined', cameraPromptAnswer: 'allow' });
    assert.equal((await runCrjIosPhotoPick('camera', deps)).kind, 'picked');
    assert.equal(calls.cameraPrompt, 1);
    assert.equal(calls.camera, 1);
  });

  it('not asked + deny: shows the blocked message instead of nothing', async () => {
    const { deps, calls } = fakeIos({ camera: 'notDetermined', cameraPromptAnswer: 'deny' });
    assert.deepEqual(await runCrjIosPhotoPick('camera', deps), { kind: 'cameraBlocked' });
    assert.equal(calls.camera, 0);
  });

  it('authorized: no prompt, camera opens', async () => {
    const { deps, calls } = fakeIos({ camera: 'authorized' });
    assert.equal((await runCrjIosPhotoPick('camera', deps)).kind, 'picked');
    assert.equal(calls.cameraPrompt, 0);
  });

  for (const camera of ['denied', 'restricted'] as const) {
    it(`${camera}: blocked message with Cancel and Open Settings, camera not launched`, async () => {
      const { deps, calls } = fakeIos({ camera });
      const outcome = await runCrjIosPhotoPick('camera', deps);
      assert.deepEqual(outcome, { kind: 'cameraBlocked' });
      assert.equal(calls.camera, 0);
      let opened = 0;
      const alert = crjPhotoOutcomeAlert(outcome, tEn, () => (opened += 1))!;
      assert.deepEqual(alert.buttons.map((b) => b.text), ['Cancel', 'Open Settings']);
      assert.equal(alert.buttons[0].style, 'cancel');
      assert.equal(alert.buttons[0].onPress, undefined);
      alert.buttons[1].onPress!();
      assert.equal(opened, 1);
    });
  }

  it('return from Settings: the next tap reads the new answer and opens the camera', async () => {
    const { deps, state } = fakeIos({ camera: 'denied' });
    assert.equal((await runCrjIosPhotoPick('camera', deps)).kind, 'cameraBlocked');
    state.camera = 'authorized'; // user enabled it in Settings and came back
    assert.equal((await runCrjIosPhotoPick('camera', deps)).kind, 'picked');
  });

  it('permission request rejection becomes a readable error', async () => {
    const { deps, calls } = fakeIos({
      permissionError: Object.assign(new Error('boom'), { code: 'ERR_PERMISSIONS' }),
    });
    const outcome = await runCrjIosPhotoPick('camera', deps);
    assert.deepEqual(outcome, {
      kind: 'error',
      source: 'camera',
      stage: 'permission',
      code: 'ERR_PERMISSIONS',
    });
    assert.equal(calls.camera, 0);
    assert.equal(crjPhotoOutcomeAlert(outcome, tEn, () => {})!.title, "Couldn't open the camera");
  });

  it('camera launch rejection becomes a readable error', async () => {
    const { deps } = fakeIos({ camera: 'authorized', cameraResult: new Error('no code here') });
    const outcome = await runCrjIosPhotoPick('camera', deps);
    assert.deepEqual(outcome, { kind: 'error', source: 'camera', stage: 'picker', code: undefined });
  });

  it('camera cancel stays quiet', async () => {
    const { deps } = fakeIos({ camera: 'authorized', cameraResult: { canceled: true } });
    assert.deepEqual(await runCrjIosPhotoPick('camera', deps), { kind: 'canceled' });
  });
});

describe('CRJ photo (iOS) — copy and privacy', () => {
  it('safeErrorCode keeps only short codes, never messages or URIs', () => {
    assert.equal(safeErrorCode({ code: 'ERR_X' }), 'ERR_X');
    assert.equal(safeErrorCode({ code: 'file:///a b.jpg' }), undefined);
    assert.equal(safeErrorCode(new Error('x')), undefined);
    assert.equal(safeErrorCode(null), undefined);
  });

  it('EN/ES copy exists and never promises Settings can lift a restriction', () => {
    for (const t of [tEn, tEs]) {
      const blocked = crjPhotoOutcomeAlert({ kind: 'cameraBlocked' }, t, () => {})!;
      assert.ok(blocked.title && blocked.message);
      for (const source of ['library', 'camera'] as const) {
        const err = crjPhotoOutcomeAlert(
          { kind: 'error', source, stage: 'picker' },
          t,
          () => {},
        )!;
        assert.ok(err.title && err.message && err.buttons[0].text);
      }
    }
    const enBody = crjPhotoOutcomeAlert({ kind: 'cameraBlocked' }, tEn, () => {})!.message;
    const esBody = crjPhotoOutcomeAlert({ kind: 'cameraBlocked' }, tEs, () => {})!;
    assert.match(enBody, /restricted.*may not let you change it/);
    assert.match(esBody.message, /restringido.*es posible que Ajustes no te permita cambiarlo/);
    assert.deepEqual(esBody.buttons.map((b) => b.text), ['Cancelar', 'Abrir Ajustes']);
  });
});

describe('CRJ photo screen wiring', () => {
  const ios = screenSource.slice(
    screenSource.indexOf('async function pickCrjPhotoIos'),
    screenSource.indexOf('async function pickFromLibrary'),
  );

  it('keeps crop 1:1, quality 0.85 and images only', () => {
    assert.deepEqual(CRJ_PHOTO_PICKER_OPTIONS, { allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    assert.equal(ios.match(/MediaTypeOptions\.Images/g)?.length, 2);
    assert.equal(ios.match(/\.\.\.CRJ_PHOTO_PICKER_OPTIONS/g)?.length, 2);
  });

  it('iOS library path never asks for general Photos access', () => {
    assert.ok(!ios.includes('requestMediaLibraryPermissionsAsync'));
    assert.match(ios, /setWizardPhoto\(outcome\.uri\)/);
    assert.match(ios, /Linking\.openSettings\(\)\.catch/);
    assert.match(ios, /if \(alert\) Alert\.alert/);
  });

  it('both buttons route to the iOS flow first; Android path is unchanged', () => {
    assert.match(
      screenSource,
      /async function pickFromLibrary\(\) \{\s*if \(Platform\.OS === 'ios'\) return pickCrjPhotoIos\('library'\);\s*const perm = await ImagePicker\.requestMediaLibraryPermissionsAsync\(\);\s*if \(!perm\.granted\) return;/,
    );
    assert.match(
      screenSource,
      /async function takePhoto\(\) \{\s*if \(Platform\.OS === 'ios'\) return pickCrjPhotoIos\('camera'\);\s*const perm = await ImagePicker\.requestCameraPermissionsAsync\(\);\s*if \(!perm\.granted\) return;/,
    );
  });

  it('logs only the error code, and only in development', () => {
    assert.match(ios, /outcome\.kind === 'error' && __DEV__/);
    assert.ok(!/console\.\w+\([^)]*uri/i.test(ios));
  });
});
