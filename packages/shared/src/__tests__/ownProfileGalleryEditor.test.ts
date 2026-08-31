import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildPostCrjGalleryPersistencePatch,
  createGalleryOperationLock,
  extractOwnProfileGallerySummaryCounts,
  isPersistableGalleryPhoto,
  parsePostCrjGalleryEditorParams,
  prependGalleryPhoto,
  readPostCrjGalleryFromDoc,
  removeGalleryPhoto,
  sanitizeGalleryPhotosForPersistence,
} from '../gallery/postCrjGalleryEditor';
import {
  GALLERY_GRID_GAP,
  OWN_PROFILE_GALLERY_COLUMNS,
  galleryTileSize,
} from '../gallery/galleryGridTokens';
import { CRJ_GALLERY_UX_CAP } from '../gallery/onboardingGalleryPersistence';

const remotePhoto = {
  url: 'https://cdn.example.com/a.jpg',
  path: 'users/u/gallery/personal/a.jpg',
  createdAt: 1,
};

describe('post-CRJ gallery editor helpers', () => {
  it('parsePostCrjGalleryEditorParams fails closed on invalid params', () => {
    assert.deepEqual(
      parsePostCrjGalleryEditorParams({ uid: 'u1', mode: 'personal' }, null),
      { ok: false, reason: 'missing_auth' },
    );
    assert.deepEqual(
      parsePostCrjGalleryEditorParams({ uid: 'u2', mode: 'personal' }, 'u1'),
      { ok: false, reason: 'uid_mismatch' },
    );
  });

  it('CRJ cap remains 6; post-CRJ editor has no explicit product cap helpers', () => {
    assert.equal(CRJ_GALLERY_UX_CAP, 6);
    const editorSrc = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'gallery', 'postCrjGalleryEditor.ts'),
      'utf8',
    );
    assert.doesNotMatch(editorSrc, /MAX_GALLERY_ITEMS/);
    assert.doesNotMatch(editorSrc, /canAddGalleryItem/);
    assert.doesNotMatch(editorSrc, /isGalleryAtMax/);
  });

  it('allows galleries larger than 12 in persistence patch', () => {
    const photos = Array.from({ length: 13 }, (_, index) => ({
      ...remotePhoto,
      path: `users/u/gallery/personal/${index}.jpg`,
      createdAt: index,
    }));
    const patch = buildPostCrjGalleryPersistencePatch('personal', photos);
    assert.equal(patch.personalGallery?.length, 13);
  });

  it('allows 50-item gallery in persistence patch', () => {
    const photos = Array.from({ length: 50 }, (_, index) => ({
      ...remotePhoto,
      path: `users/u/gallery/personal/${index}.jpg`,
      createdAt: index,
    }));
    const patch = buildPostCrjGalleryPersistencePatch('personal', photos);
    assert.equal(patch.personalGallery?.length, 50);
  });

  it('reads personal and professional galleries in isolation', () => {
    const doc = {
      personalGallery: [remotePhoto],
      professionalGallery: [
        {
          url: 'https://cdn.example.com/pro.jpg',
          path: 'users/u/gallery/professional/pro.jpg',
          createdAt: 2,
        },
      ],
    };
    assert.equal(readPostCrjGalleryFromDoc(doc, 'personal').length, 1);
    assert.equal(readPostCrjGalleryFromDoc(doc, 'professional').length, 1);
    const counts = extractOwnProfileGallerySummaryCounts(doc);
    assert.equal(counts.personal, 1);
    assert.equal(counts.professional, 1);
  });

  it('prepend puts newest photo first without sorting historical items', () => {
    const first = { ...remotePhoto, path: 'users/u/gallery/personal/1.jpg' };
    const second = {
      ...remotePhoto,
      url: 'https://cdn.example.com/b.jpg',
      path: 'users/u/gallery/personal/2.jpg',
      createdAt: 2,
    };
    const newest = {
      ...remotePhoto,
      url: 'https://cdn.example.com/new.jpg',
      path: 'users/u/gallery/personal/new.jpg',
      createdAt: 99,
    };
    const prepended = prependGalleryPhoto([first, second], newest);
    assert.deepEqual(
      prepended.map((photo) => photo.path),
      [newest.path, first.path, second.path],
    );
    assert.equal(first.createdAt, 1);
    assert.equal(second.createdAt, 2);
  });

  it('remove preserves order of remaining photos', () => {
    const photos = [
      { ...remotePhoto, path: 'a.jpg', createdAt: 1 },
      {
        ...remotePhoto,
        url: 'https://cdn.example.com/b.jpg',
        path: 'b.jpg',
        createdAt: 2,
      },
      {
        ...remotePhoto,
        url: 'https://cdn.example.com/c.jpg',
        path: 'c.jpg',
        createdAt: 3,
      },
    ];
    const removed = removeGalleryPhoto(photos, photos[1]!);
    assert.deepEqual(
      removed.map((photo) => photo.path),
      ['a.jpg', 'c.jpg'],
    );
  });

  it('never persists local URIs', () => {
    assert.equal(
      isPersistableGalleryPhoto({
        url: 'file:///tmp/x.jpg',
        path: 'local-1',
        createdAt: 1,
      }),
      false,
    );
    assert.deepEqual(
      sanitizeGalleryPhotosForPersistence([
        remotePhoto,
        {
          url: 'file:///tmp/x.jpg',
          path: 'local-1',
          createdAt: 2,
        },
      ]),
      [remotePhoto],
    );
  });

  it('buildPostCrjGalleryPersistencePatch writes one face only', () => {
    const personal = buildPostCrjGalleryPersistencePatch('personal', [remotePhoto]);
    assert.deepEqual(Object.keys(personal).sort(), ['personalGallery']);
    assert.equal(
      Object.prototype.hasOwnProperty.call(personal, 'profileSetupCompleted'),
      false,
    );
  });
});

describe('gallery operation lock', () => {
  it('allows only one concurrent operation', () => {
    const lock = createGalleryOperationLock();
    assert.equal(lock.tryAcquire(), true);
    assert.equal(lock.tryAcquire(), false);
    assert.equal(lock.isHeld(), true);
    lock.release();
    assert.equal(lock.isHeld(), false);
    assert.equal(lock.tryAcquire(), true);
    lock.release();
  });
});

describe('post-CRJ Gallery editor screen contract', () => {
  const sharedRoot = path.resolve(import.meta.dirname, '..');

  function readShared(rel: string) {
    return fs.readFileSync(path.join(sharedRoot, rel), 'utf8');
  }

  it('GalleryScreen has no explicit cap, uses three-column admin grid and canonical viewer', () => {
    const screen = readShared('screens/GalleryScreen.tsx');
    assert.match(screen, /parsePostCrjGalleryEditorParams/);
    assert.match(screen, /createGalleryOperationLock/);
    assert.match(screen, /prependGalleryPhoto/);
    assert.match(screen, /ProfileGalleryAdminGrid/);
    assert.match(screen, /columns=\{OWN_PROFILE_GALLERY_COLUMNS\}/);
    assert.match(screen, /ProfileGallery/);
    assert.match(screen, /fullGallery:\s*true/);
    assert.doesNotMatch(screen, /Modal/);
    assert.doesNotMatch(screen, /TopHeader/);
    assert.doesNotMatch(screen, /getDiscoveryProfile/);
    assert.doesNotMatch(screen, /queueMicrotask/);
    assert.doesNotMatch(screen, /CRJ_GALLERY_UX_CAP/);
    assert.doesNotMatch(screen, /MAX_GALLERY/);
    assert.doesNotMatch(screen, /maxReached/);
    assert.doesNotMatch(screen, /\/12/);
    assert.doesNotMatch(screen, /reorder|drag|Draggable/i);
    assert.doesNotMatch(screen, /390|393|430|iPhone/);
  });

  it('Own Profile Gallery opens viewer on same stack so Back returns to Gallery', () => {
    const screen = readShared('screens/GalleryScreen.tsx');
    const profileStack = readShared('navigation/ProfileStack.tsx');
    assert.match(screen, /navigation\.navigate\('ProfileGallery'/);
    assert.doesNotMatch(screen, /navigate\('Home'/);
    assert.doesNotMatch(screen, /getParent\(\)/);
    assert.match(profileStack, /name="ProfileGallery"/);
    assert.match(profileStack, /ProfileGalleryScreen/);
    const viewer = readShared('screens/ProfileGalleryScreen.tsx');
    assert.match(viewer, /navigation\.goBack\(\)/);
    assert.doesNotMatch(viewer, /navigate\('Home'/);
    assert.doesNotMatch(viewer, /navigate\('MainHome'/);
  });

  it('Discovery ProfileGallery path stays on HomeStack without Home hardcode in viewer', () => {
    const discovery = readShared('screens/DiscoveryProfileScreen.tsx');
    const homeStack = readShared('navigation/HomeStack.tsx');
    assert.match(discovery, /navigation\.navigate\('ProfileGallery'/);
    assert.match(homeStack, /name="ProfileGallery"/);
    assert.doesNotMatch(discovery, /navigate\('Home'/);
  });

  it('Own Profile admin grid is three columns; Add tile participates in the grid', () => {
    assert.equal(OWN_PROFILE_GALLERY_COLUMNS, 3);
    const grid = readShared('components/gallery/ProfileGalleryAdminGrid.tsx');
    assert.match(grid, /columns\s*=\s*OWN_PROFILE_GALLERY_COLUMNS/);
    assert.match(grid, /galleryTileSize\(width,\s*columns\)/);
    assert.match(grid, /GALLERY_GRID_GAP/);
    assert.match(grid, /borderStyle: 'dashed'/);
    assert.match(grid, /Ionicons name="add"/);
    assert.match(grid, /onAddPress/);
    assert.doesNotMatch(grid, /useRoute|route\.name|route\.params/);
    assert.doesNotMatch(grid, /OnboardingGalleryStep/);
  });

  it('galleryTileSize yields three tiles and two gaps from container width', () => {
    const windowWidth = 390;
    const padding = 44;
    const tile = galleryTileSize(windowWidth, 3, padding);
    assert.equal(
      tile,
      Math.floor((windowWidth - padding - GALLERY_GRID_GAP * 2) / 3),
    );
    assert.ok(tile * 3 + GALLERY_GRID_GAP * 2 + padding <= windowWidth);
    assert.ok(tile >= 44);
  });

  it('CRJ OnboardingGalleryStep keeps independent columns and does not use admin grid', () => {
    const crj = readShared('components/registration/OnboardingGalleryStep.tsx');
    assert.match(crj, /const COLS = 3/);
    assert.doesNotMatch(crj, /ProfileGalleryAdminGrid/);
    assert.doesNotMatch(crj, /OWN_PROFILE_GALLERY_COLUMNS/);
    assert.match(crj, /GALLERY_GRID_GAP/);
    assert.match(crj, /CRJ_GALLERY_UX_CAP/);
  });

  it('ProfileGalleryScreen preserves discovery cap but allows fullGallery bypass', () => {
    const viewer = readShared('screens/ProfileGalleryScreen.tsx');
    assert.match(viewer, /fullGallery/);
    assert.match(viewer, /fullGallery \? next : next\.slice\(0, 12\)/);
  });

  it('GalleryScreen does not auto-request permission on mount', () => {
    const screen = readShared('screens/GalleryScreen.tsx');
    const mountBlock = screen.slice(0, screen.indexOf('const handleAddPhoto'));
    assert.doesNotMatch(mountBlock, /requestMediaLibraryPermissionsAsync/);
    assert.match(screen, /requestMediaLibraryPermissionsAsync/);
  });

  it('CompleteProfileScreen refreshes gallery summaries without full reload when dirty', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /extractOwnProfileGallerySummaryCounts/);
    assert.match(screen, /personalGallerySummaryCount/);
    assert.doesNotMatch(screen, /professionalGallery\.length/);
  });

  it('ProfileStack requires uid and mode for Gallery', () => {
    const stack = readShared('navigation/ProfileStack.tsx');
    assert.match(stack, /Gallery:\s*\{\s*uid: string;/);
    assert.match(stack, /mode: 'personal' \| 'professional'/);
  });
});
