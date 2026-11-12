/**
 * Google Play photo and video permissions policy (2.0.10 rejection of 50):
 * every image selection uses the system photo picker, Android never asks for
 * a library permission first, and the manifest declares no READ_MEDIA_*.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  pickImageWithSystemPicker,
  SystemImagePickerEmptyResultError,
} from '../media/systemImagePickerCore.ts';

const sharedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidApp = path.resolve(sharedRoot, '../../../apps/nearsy-android');

type Launch = { canceled: boolean; assets?: Array<{ uri?: string | null }> | null };

function fakePicker(launches: Array<Launch | Error>, granted = true) {
  const calls: string[] = [];
  const options: Array<Record<string, unknown>> = [];
  return {
    calls,
    options,
    port: {
      imagesMediaType: 'Images',
      async requestMediaLibraryPermissionsAsync() {
        calls.push('permission');
        return { granted };
      },
      async launchImageLibraryAsync(opts: Record<string, unknown>) {
        calls.push('launch');
        options.push(opts);
        const next = launches.shift();
        if (!next) throw new Error('unexpected launch');
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

describe('the system picker on Android', () => {
  it('opens the picker straight away, images only, with no permission request', async () => {
    const picker = fakePicker([{ canceled: false, assets: [{ uri: 'file:///cache/a.jpg' }] }]);
    const outcome = await pickImageWithSystemPicker(picker.port, 'android', {
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    assert.deepEqual(outcome, { kind: 'picked', uri: 'file:///cache/a.jpg' });
    assert.deepEqual(picker.calls, ['launch']);
    assert.deepEqual(picker.options[0], {
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      mediaTypes: 'Images',
    });
  });

  it('cancel, then reopen and pick', async () => {
    const picker = fakePicker([
      { canceled: true, assets: null },
      { canceled: false, assets: [{ uri: 'file:///cache/b.jpg' }] },
    ]);
    assert.deepEqual(await pickImageWithSystemPicker(picker.port, 'android', {}), { kind: 'canceled' });
    assert.deepEqual(await pickImageWithSystemPicker(picker.port, 'android', {}), {
      kind: 'picked',
      uri: 'file:///cache/b.jpg',
    });
    assert.deepEqual(picker.calls, ['launch', 'launch']);
  });

  it('a picker failure or a success without an image rejects, never silently', async () => {
    const failing = fakePicker([new Error('FailedToPickMediaException')]);
    await assert.rejects(pickImageWithSystemPicker(failing.port, 'android', {}), /FailedToPickMedia/);
    const empty = fakePicker([{ canceled: false, assets: [] }]);
    await assert.rejects(
      pickImageWithSystemPicker(empty.port, 'android', {}),
      SystemImagePickerEmptyResultError,
    );
  });

  it('runs both steps through the external-flow wrapper', async () => {
    const picker = fakePicker([{ canceled: true }]);
    let wrapped = 0;
    await pickImageWithSystemPicker(picker.port, 'android', {}, async (run) => {
      wrapped += 1;
      return run();
    });
    assert.equal(wrapped, 1);
  });
});

describe('other platforms are unchanged', () => {
  it('iOS still asks first, and a denial does not open the picker', async () => {
    const denied = fakePicker([], false);
    assert.deepEqual(await pickImageWithSystemPicker(denied.port, 'ios', {}), { kind: 'denied' });
    assert.deepEqual(denied.calls, ['permission']);
    const granted = fakePicker([{ canceled: false, assets: [{ uri: 'file:///c.jpg' }] }]);
    await pickImageWithSystemPicker(granted.port, 'ios', {});
    assert.deepEqual(granted.calls, ['permission', 'launch']);
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('every selection flow', () => {
  const flows = [
    'screens/CompleteProfileScreen.tsx',
    'screens/GalleryScreen.tsx',
    'screens/ProfileCompletionScreen.tsx',
    'components/registration/OnboardingAffiliationCategoryPanel.tsx',
  ];

  it('profile photo, gallery and affiliation logo use the shared system picker', () => {
    for (const flow of flows) {
      assert.match(readFileSync(path.join(sharedRoot, flow), 'utf8'), /pickImageFromSystemLibrary\(/, flow);
    }
  });

  it('only the picker module asks for library access or opens the library', () => {
    const offenders = sourceFiles(sharedRoot)
      .filter((file) => !/[\\/]media[\\/]systemImagePicker(Core)?\.ts$/.test(file))
      .filter((file) =>
        /requestMediaLibraryPermissionsAsync|getMediaLibraryPermissionsAsync|launchImageLibraryAsync|expo-media-library/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => path.relative(sharedRoot, file));
    assert.deepEqual(offenders, []);
  });

  it('the camera keeps its own permission request and reports failures', () => {
    for (const flow of ['screens/CompleteProfileScreen.tsx', 'screens/ProfileCompletionScreen.tsx']) {
      const text = readFileSync(path.join(sharedRoot, flow), 'utf8');
      assert.match(text, /requestCameraPermissionsAsync/, flow);
      assert.match(text, /profile\.errors\.openCamera/, flow);
    }
  });

  it('library failures show an error in every flow', () => {
    for (const flow of flows) {
      const text = readFileSync(path.join(sharedRoot, flow), 'utf8');
      assert.match(text, /profile\.errors\.pickImage|profile\.gallery\.uploadError/, flow);
    }
  });
});

describe('the Android manifest config', () => {
  const app = JSON.parse(readFileSync(path.join(androidApp, 'app.json'), 'utf8')).expo;
  const MEDIA = [
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  ];

  it('declares no broad media permission and blocks them for every library', () => {
    for (const perm of MEDIA) {
      assert.equal(app.android.permissions.includes(perm), false, perm);
      assert.equal(app.android.blockedPermissions.includes(perm), true, perm);
    }
  });

  it('keeps the camera: the picker plugin is present and CAMERA is not blocked', () => {
    assert.ok(app.plugins.some((p: unknown) => p === 'expo-image-picker' || (Array.isArray(p) && p[0] === 'expo-image-picker')));
    assert.equal(app.android.blockedPermissions.includes('android.permission.CAMERA'), false);
    assert.equal(app.android.blockedPermissions.includes('android.permission.WRITE_EXTERNAL_STORAGE'), false);
  });

  it('versionName stays 2.0.10', () => {
    assert.equal(app.version, '2.0.10');
  });
});
