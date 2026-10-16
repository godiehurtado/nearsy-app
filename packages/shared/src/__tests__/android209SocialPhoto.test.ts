/**
 * NEARSY-209 — social profile photo copy / priority / dedupe (Android).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach } from 'node:test';

import {
  bindSocialPhotoCopySession,
  clearSocialPhotoCopySessionCache,
  getSocialPhotoCopyActiveUidForTests,
  getSocialPhotoCopyGenerationForTests,
  isAuthProviderPhotoHost,
  isAuthProviderPhotoUrl,
  isNearsyOwnedProfileImageUrl,
  resolvePersistedProfileImageUrl,
  shouldCopyAuthProviderPhotoToStorage,
} from '../profile/socialProfilePhotoCopy.ts';
import { mergeCompleteProfilePrefill } from '../authentication/social/application/mergeCompleteProfilePrefill.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('NEARSY-209 social photo — Google Android API', () => {
  it('does not set profileImageSize on Android configure (iOS-only)', () => {
    const src = readSrc('services/googleAuth.android.ts');
    assert.match(src, /iOS-ONLY|iOS-only|profileImageSize/);
    assert.doesNotMatch(
      src,
      /GoogleSignin\.configure\(\{[^}]*profileImageSize/s,
    );
  });
});

describe('NEARSY-209 social photo — allowlist & owned detection', () => {
  it('accepts Google / Facebook / LinkedIn CDN hosts only over https', () => {
    assert.equal(isAuthProviderPhotoHost('lh3.googleusercontent.com'), true);
    assert.equal(isAuthProviderPhotoHost('platform-lookaside.fbsbx.com'), true);
    assert.equal(isAuthProviderPhotoHost('media.licdn.com'), true);
    assert.equal(isAuthProviderPhotoHost('media-exp1.licdn.com'), true);
    assert.equal(isAuthProviderPhotoHost('dms.licdn.com'), true);
    assert.equal(isAuthProviderPhotoHost('evil.example.com'), false);

    assert.equal(
      isAuthProviderPhotoUrl('https://lh3.googleusercontent.com/a/photo'),
      true,
    );
    assert.equal(
      isAuthProviderPhotoUrl(
        'https://media.licdn.com/dms/image/v2/C4E03AQExample/profile-displayphoto-shrink_800_800/0/1',
      ),
      true,
    );
    assert.equal(
      isAuthProviderPhotoUrl('http://lh3.googleusercontent.com/a/photo'),
      false,
    );
    assert.equal(
      isAuthProviderPhotoUrl('https://cdn.example.com/user-typed.jpg'),
      false,
    );
  });

  it('detects Nearsy Storage URLs under users/{uid}/', () => {
    const uid = 'uid-abc';
    assert.equal(
      isNearsyOwnedProfileImageUrl(
        `https://firebasestorage.googleapis.com/v0/b/nearsy-dev.appspot.com/o/users%2F${uid}%2Fuid_1.jpg?alt=media`,
        uid,
      ),
      true,
    );
    assert.equal(
      isNearsyOwnedProfileImageUrl(
        'https://lh3.googleusercontent.com/a/photo',
        uid,
      ),
      false,
    );
  });

  it('shouldCopy only for new auth-provider remotes', () => {
    const uid = 'u1';
    assert.equal(
      shouldCopyAuthProviderPhotoToStorage(
        'https://lh3.googleusercontent.com/a/photo',
        uid,
      ),
      true,
    );
    assert.equal(
      shouldCopyAuthProviderPhotoToStorage('file:///tmp/x.jpg', uid),
      false,
    );
    assert.equal(
      shouldCopyAuthProviderPhotoToStorage(
        'https://cdn.example.com/arbitrary.jpg',
        uid,
      ),
      false,
    );
  });
});

describe('NEARSY-209 social photo — priority merge', () => {
  it('existing user photo wins over provider prefill', () => {
    const merged = mergeCompleteProfilePrefill(
      { profileImage: 'https://firebasestorage.googleapis.com/o/users%2Fu1%2Fa.jpg' },
      { photoUrl: 'https://lh3.googleusercontent.com/provider.jpg' },
    );
    assert.equal(
      merged.profileImage,
      'https://firebasestorage.googleapis.com/o/users%2Fu1%2Fa.jpg',
    );
  });

  it('empty seed accepts social prefill URL', () => {
    const merged = mergeCompleteProfilePrefill(
      { profileImage: null },
      { photoUrl: 'https://lh3.googleusercontent.com/provider.jpg' },
    );
    assert.equal(
      merged.profileImage,
      'https://lh3.googleusercontent.com/provider.jpg',
    );
  });
});

describe('NEARSY-209 social photo — resolve + dedupe', () => {
  beforeEach(() => {
    clearSocialPhotoCopySessionCache();
  });

  it('uploads local picks via uploadProfileImage', async () => {
    let uploadCalls = 0;
    const result = await resolvePersistedProfileImageUrl(
      'uid-1',
      'file:///data/photo.jpg',
      {
        uploadProfileImage: async (_uid, uri) => {
          uploadCalls += 1;
          assert.equal(uri, 'file:///data/photo.jpg');
          return 'https://firebasestorage.googleapis.com/o/users%2Fuid-1%2Fx.jpg';
        },
        downloadToCache: async () => {
          throw new Error('should not download local');
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.source, 'local_upload');
      assert.match(result.url, /users%2Fuid-1/);
    }
    assert.equal(uploadCalls, 1);
  });

  it('copies auth-provider photo once per session (no duplicate upload)', async () => {
    let downloads = 0;
    let uploads = 0;
    const remote = 'https://lh3.googleusercontent.com/a/new-photo';
    const deps = {
      uploadProfileImage: async () => {
        uploads += 1;
        return 'https://firebasestorage.googleapis.com/o/users%2Fuid-1%2Fcopied.jpg';
      },
      downloadToCache: async (url: string) => {
        downloads += 1;
        assert.equal(url, remote);
        return 'file:///cache/social.jpg';
      },
    };
    const first = await resolvePersistedProfileImageUrl('uid-1', remote, deps);
    const second = await resolvePersistedProfileImageUrl('uid-1', remote, deps);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok) assert.equal(first.source, 'social_copy');
    if (second.ok) assert.equal(second.source, 'session_cache');
    assert.equal(downloads, 1);
    assert.equal(uploads, 1);
  });

  it('does not download arbitrary remote URLs', async () => {
    const result = await resolvePersistedProfileImageUrl(
      'uid-1',
      'https://cdn.example.com/user-pasted.jpg',
      {
        uploadProfileImage: async () => {
          throw new Error('no upload');
        },
        downloadToCache: async () => {
          throw new Error('no download');
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.source, 'remote_passthrough');
      assert.equal(result.url, 'https://cdn.example.com/user-pasted.jpg');
    }
  });

  it('reports social_import_failed without inventing a Storage URL', async () => {
    const result = await resolvePersistedProfileImageUrl(
      'uid-1',
      'https://lh3.googleusercontent.com/a/broken',
      {
        uploadProfileImage: async () => {
          throw new Error('upload boom');
        },
        downloadToCache: async () => 'file:///cache/x.jpg',
      },
    );
    assert.deepEqual(result, { ok: false, reason: 'social_import_failed' });
  });

  it('failure is not cached — retry can succeed', async () => {
    let uploads = 0;
    const remote = 'https://lh3.googleusercontent.com/a/retry-me';
    const deps = {
      uploadProfileImage: async () => {
        uploads += 1;
        if (uploads === 1) throw new Error('transient');
        return 'https://firebasestorage.googleapis.com/o/users%2Fuid-1%2Fok.jpg';
      },
      downloadToCache: async () => 'file:///cache/social.jpg',
      cleanupLocalTemp: async () => undefined,
    };
    const first = await resolvePersistedProfileImageUrl('uid-1', remote, deps);
    const second = await resolvePersistedProfileImageUrl('uid-1', remote, deps);
    assert.deepEqual(first, { ok: false, reason: 'social_import_failed' });
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.source, 'social_copy');
    assert.equal(uploads, 2);
  });

  it('manual local selection wins over provider URL path', async () => {
    const result = await resolvePersistedProfileImageUrl(
      'uid-1',
      'content://media/external/images/1',
      {
        uploadProfileImage: async (_uid, uri) => {
          assert.equal(uri, 'content://media/external/images/1');
          return 'https://firebasestorage.googleapis.com/o/users%2Fuid-1%2Fmanual.jpg';
        },
        downloadToCache: async () => {
          throw new Error('must not download when manual local wins');
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.source, 'local_upload');
  });

  it('owned Storage URL is not re-uploaded', async () => {
    let uploads = 0;
    const owned =
      'https://firebasestorage.googleapis.com/o/users%2Fuid-1%2Fowned.jpg?alt=media';
    const result = await resolvePersistedProfileImageUrl('uid-1', owned, {
      uploadProfileImage: async () => {
        uploads += 1;
        return owned;
      },
      downloadToCache: async () => {
        throw new Error('no download');
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.source, 'already_owned');
    assert.equal(uploads, 0);
  });

  it('clears cache on uid change and discards stale in-flight copy', async () => {
    bindSocialPhotoCopySession('uid-a');
    const genA = getSocialPhotoCopyGenerationForTests();
    assert.equal(getSocialPhotoCopyActiveUidForTests(), 'uid-a');

    let releaseUpload: (() => void) | null = null;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });

    const slow = resolvePersistedProfileImageUrl(
      'uid-a',
      'https://lh3.googleusercontent.com/a/slow',
      {
        downloadToCache: async () => 'file:///cache/a.jpg',
        uploadProfileImage: async () => {
          await uploadGate;
          return 'https://firebasestorage.googleapis.com/o/users%2Fuid-a%2Fa.jpg';
        },
        cleanupLocalTemp: async () => undefined,
      },
    );

    bindSocialPhotoCopySession('uid-b');
    assert.notEqual(getSocialPhotoCopyGenerationForTests(), genA);
    assert.equal(getSocialPhotoCopyActiveUidForTests(), 'uid-b');
    releaseUpload?.();
    const stale = await slow;
    assert.deepEqual(stale, { ok: false, reason: 'session_stale' });
  });

  it('cleans local temp after social copy attempt', async () => {
    let cleaned: string | null = null;
    await resolvePersistedProfileImageUrl(
      'uid-1',
      'https://lh3.googleusercontent.com/a/tmp',
      {
        downloadToCache: async () => 'file:///cache/tmp.jpg',
        uploadProfileImage: async () =>
          'https://firebasestorage.googleapis.com/o/users%2Fuid-1%2Ftmp.jpg',
        cleanupLocalTemp: async (uri) => {
          cleaned = uri;
        },
      },
    );
    assert.equal(cleaned, 'file:///cache/tmp.jpg');
  });

  it('App auth listener binds/clears social photo session cache', () => {
    const app = readSrc('App.tsx');
    assert.match(app, /bindSocialPhotoCopySession/);
    assert.match(app, /clearSocialPhotoCopySessionCache/);
  });

  it('uses legacy file:// download for putFile-compatible temps', () => {
    const mod = readSrc('profile/socialProfilePhotoCopy.ts');
    assert.match(mod, /expo-file-system\/legacy/);
    assert.match(mod, /downloadAsync/);
    assert.match(mod, /loadLegacyFileSystem/);
    assert.match(mod, /legacy_fs_unavailable|legacy_fs_import_failed/);
    assert.match(mod, /putFile/);
    assert.match(mod, /Redirect limitation|Residual redirect|residual limitation/i);
    assert.match(mod, /nearsy-expo-fs-legacy/);
    assert.match(mod, /require\('\.\.\/services\/storageService'\)/);
    assert.doesNotMatch(
      mod,
      /import\(\s*['\"]\.\.\/services\/storageService\.android/,
    );
    assert.match(mod, /\[socialProfilePhotoCopy\]/);
    assert.doesNotMatch(mod, /SOCIAL_PHOTO_COPY_BUILD_TAG|module_loaded|legacy_fs_ok/);
  });

  it('CRJ and Own Profile persist call resolvePersistedProfileImageUrl', () => {
    const crj = readSrc('screens/ProfileCompletionScreen.tsx');
    const own = readSrc('screens/CompleteProfileScreen.tsx');
    assert.match(crj, /resolvePersistedProfileImageUrl/);
    assert.match(crj, /socialImportFailed/);
    assert.match(own, /resolvePersistedProfileImageUrl/);
    assert.match(own, /socialImportFailed/);
  });

  it('main avatars use ProfileAvatarImage with onError fallback', () => {
    const hero = readSrc('components/profile/OwnProfileHero.tsx');
    const header = readSrc('components/TopHeader.tsx');
    const nearby = readSrc('screens/NearbySearchScreen.tsx');
    const avatar = readSrc('components/ProfileAvatarImage.tsx');
    assert.match(hero, /ProfileAvatarImage/);
    assert.match(header, /ProfileAvatarImage/);
    assert.match(nearby, /ProfileAvatarImage/);
    assert.match(avatar, /onError/);
  });
});
