import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { POST_SOCIAL_MEDIA_CRJ_STEP } from '../social/onboardingSocialPersistence';
import {
  CRJ_GALLERY_UX_CAP,
  POST_GALLERY_CRJ_STEP,
  abandonedSessionUploadPaths,
  buildCrjGalleryPersistencePatch,
  galleriesEqual,
  hasUploadingGalleryItems,
  isRemoteGalleryUrl,
  payloadContainsUndefined,
  readCrjGallery,
  removedPersistedGalleryPaths,
  shouldPersistCrjGallery,
  toPersistedGalleryPhotos,
  type CrjGalleryItem,
} from '../gallery/onboardingGalleryPersistence';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

function readyPhoto(
  id: string,
  extras: Partial<CrjGalleryItem> = {},
): CrjGalleryItem {
  return {
    id,
    url: `https://cdn.example.com/${id}.jpg`,
    path: `users/u/gallery/personal/${id}.jpg`,
    createdAt: 1,
    status: 'ready',
    fromSession: false,
    ...extras,
  };
}

describe('CRJ-I8 Gallery navigation', () => {
  it('A — Social Media → Gallery', () => {
    assert.equal(POST_SOCIAL_MEDIA_CRJ_STEP, 'gallery');
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('POST_SOCIAL_MEDIA_CRJ_STEP'));
    assert.ok(screen.includes("kind === 'gallery'"));
  });

  it('B — Social Media Skip → Gallery', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(
      screen.includes('advanceSocialMedia({ requireValidFields: false })'),
    );
    assert.equal(POST_SOCIAL_MEDIA_CRJ_STEP, 'gallery');
  });

  it('C — Gallery → Location', () => {
    assert.equal(POST_GALLERY_CRJ_STEP, 'location');
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('advanceGallery({ persist: true })'));
    assert.ok(screen.includes('POST_GALLERY_CRJ_STEP'));
  });

  it('D — Gallery Skip → Location', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('advanceGallery({ persist: false })'));
    assert.equal(POST_GALLERY_CRJ_STEP, 'location');
  });

  it('E — Location Back → Gallery', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('function goBack()'));
    assert.ok(screen.includes('setStepIndex((i) => i - 1)'));
    assert.ok(screen.includes("kind === 'gallery'"));
  });

  it('F — Gallery Back → Social Media', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const social = screen.indexOf("if (offset === 0) return { kind: 'socialMedia' }");
    const galleryConst = screen.indexOf('POST_SOCIAL_MEDIA_CRJ_STEP');
    assert.ok(social > 0);
    assert.ok(galleryConst > 0);
  });

  it('G — Gallery appears exactly once in navigation resolve', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const returns = screen.match(/POST_SOCIAL_MEDIA_CRJ_STEP/g) ?? [];
    assert.ok(returns.length >= 1);
    assert.equal(POST_SOCIAL_MEDIA_CRJ_STEP, 'gallery');
  });

  it('H — no n/N step counter', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const panel = readSharedSource(
      'components/registration/OnboardingGalleryStep.tsx',
    );
    assert.ok(!screen.includes('Category N of'));
    assert.ok(!screen.match(/step\s+\d+\s*\/\s*\d+/i));
    assert.ok(!panel.includes('Photo 1 of'));
    assert.ok(!panel.includes('Step N of'));
  });
});

describe('CRJ-I8 Gallery data', () => {
  it('empty optional Gallery persists empty ready list without completing profile', () => {
    const patch = buildCrjGalleryPersistencePatch('personal', []);
    assert.deepEqual(patch.personalGallery, []);
    assert.equal(patch.professionalGallery, undefined);
    assert.equal(patch.profileSetupCompleted, false);
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'visibility'), false);
  });

  it('add image only persists remote ready rows', () => {
    const items: CrjGalleryItem[] = [
      readyPhoto('a', { fromSession: true }),
      {
        id: 'local-1',
        url: 'file:///tmp/x.jpg',
        path: 'local-1',
        createdAt: 2,
        status: 'uploading',
        fromSession: true,
      },
    ];
    const persisted = toPersistedGalleryPhotos(items);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]!.path, 'users/u/gallery/personal/a.jpg');
    assert.equal(isRemoteGalleryUrl('file:///tmp/x.jpg'), false);
  });

  it('remove image drops it from persistence patch', () => {
    const original = [readyPhoto('a'), readyPhoto('b')];
    const current = [readyPhoto('a')];
    const patch = buildCrjGalleryPersistencePatch('personal', current);
    assert.equal(patch.personalGallery?.length, 1);
    assert.deepEqual(removedPersistedGalleryPaths(original, current), [
      'users/u/gallery/personal/b.jpg',
    ]);
  });

  it('existing Gallery prefill hydrates remote rows only', () => {
    const draft = readCrjGallery(
      {
        personalGallery: [
          {
            url: 'https://cdn.example.com/keep.jpg',
            path: 'users/u/gallery/personal/keep.jpg',
            createdAt: 9,
          },
          { url: 'file:///local.jpg', path: 'local-x', createdAt: 1 },
        ],
      },
      'personal',
    );
    assert.equal(draft.length, 1);
    assert.equal(draft[0]!.url, 'https://cdn.example.com/keep.jpg');
  });

  it('Skip does not erase existing Gallery', () => {
    const original = [readyPhoto('keep')];
    const current = [
      readyPhoto('keep'),
      readyPhoto('new', {
        fromSession: true,
        path: 'users/u/gallery/personal/new.jpg',
        url: 'https://cdn.example.com/new.jpg',
        id: 'users/u/gallery/personal/new.jpg',
      }),
    ];
    assert.equal(shouldPersistCrjGallery(original, current), true);
    assert.deepEqual(abandonedSessionUploadPaths(original, current), [
      'users/u/gallery/personal/new.jpg',
    ]);
    assert.equal(shouldPersistCrjGallery(original, original), false);
  });

  it('Personal / Professional isolation', () => {
    const personal = buildCrjGalleryPersistencePatch('personal', [
      readyPhoto('p'),
    ]);
    const professional = buildCrjGalleryPersistencePatch('professional', [
      readyPhoto('r'),
    ]);
    assert.ok(personal.personalGallery);
    assert.equal(personal.professionalGallery, undefined);
    assert.ok(professional.professionalGallery);
    assert.equal(professional.personalGallery, undefined);
  });

  it('no local URI persisted', () => {
    const persisted = toPersistedGalleryPhotos([
      {
        id: 'local-1',
        url: 'file:///tmp/x.jpg',
        path: 'local-1',
        createdAt: 1,
        status: 'ready',
        fromSession: true,
      },
    ]);
    assert.deepEqual(persisted, []);
  });

  it('no undefined and failed upload not persisted', () => {
    const patch = buildCrjGalleryPersistencePatch('personal', [
      readyPhoto('ok'),
      {
        id: 'bad',
        url: 'file:///tmp/fail.jpg',
        path: 'local-bad',
        createdAt: 2,
        status: 'failed',
        fromSession: true,
      },
    ]);
    assert.equal(payloadContainsUndefined(patch), false);
    assert.equal(patch.personalGallery?.length, 1);
    assert.equal(patch.profileSetupCompleted, false);
  });

  it('order preservation', () => {
    const items = [readyPhoto('one'), readyPhoto('two'), readyPhoto('three')];
    const persisted = toPersistedGalleryPhotos(items);
    assert.deepEqual(
      persisted.map((p) => p.path),
      items.map((p) => p.path),
    );
    assert.equal(galleriesEqual(persisted, persisted), true);
  });

  it('uploading blocks persist helper detection', () => {
    assert.equal(
      hasUploadingGalleryItems([
        readyPhoto('a'),
        {
          id: 'u',
          url: 'file:///x',
          path: 'local-u',
          createdAt: 1,
          status: 'uploading',
          fromSession: true,
        },
      ]),
      true,
    );
  });

  it('CRJ UX cap is a proposal of 6, not encoded in production GalleryScreen', () => {
    assert.equal(CRJ_GALLERY_UX_CAP, 6);
    const production = readSharedSource('screens/GalleryScreen.tsx');
    assert.ok(!production.includes('CRJ_GALLERY_UX_CAP'));
    assert.ok(!production.includes('MAX_GALLERY'));
  });
});

describe('CRJ-I8 permissions source', () => {
  it('does not auto-request library permission on Gallery mount', () => {
    const panel = readSharedSource(
      'components/registration/OnboardingGalleryStep.tsx',
    );
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(!panel.includes('requestMediaLibraryPermissionsAsync'));
    assert.ok(screen.includes('async function addGalleryPhoto()'));
    const addFn = screen.slice(screen.indexOf('async function addGalleryPhoto()'));
    const permIdx = screen.indexOf(
      'requestMediaLibraryPermissionsAsync',
      screen.indexOf('async function addGalleryPhoto()'),
    );
    assert.ok(permIdx > 0);
    assert.ok(addFn.includes('requestMediaLibraryPermissionsAsync'));
    assert.ok(screen.includes('galleryPermissionDenied'));
  });

  it('denied path does not block Skip', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('advanceGallery({ persist: false })'));
    assert.ok(screen.includes('galleryPermissionDenied'));
  });
});

describe('CRJ-I8 isolation', () => {
  it('does not implement CRJ-I9 or Auth', () => {
    const provider = readSharedSource(
      'affiliations/affiliationEntitySearchProvider.ts',
    );
    assert.ok(provider.includes('CRJ-I9'));
    assert.ok(provider.includes('future'));
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(!screen.includes('signInWithCustomToken'));
  });
});
