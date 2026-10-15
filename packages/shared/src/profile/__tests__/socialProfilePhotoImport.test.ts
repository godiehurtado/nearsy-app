import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  clearSocialProfilePhotoImportCache,
  isEligibleSocialProviderPhotoUrl,
  isNearsyManagedProfileImageUrl,
  resolveProfileImageForPersistence,
} from '../socialProfilePhotoImport';

afterEach(() => {
  clearSocialProfilePhotoImportCache();
});

describe('isEligibleSocialProviderPhotoUrl', () => {
  it('accepts Google / Facebook / LinkedIn avatar hosts', () => {
    assert.equal(
      isEligibleSocialProviderPhotoUrl(
        'https://lh3.googleusercontent.com/a/photo',
      ),
      true,
    );
    assert.equal(
      isEligibleSocialProviderPhotoUrl(
        'https://scontent.xx.fbcdn.net/v/t1.0-1/p.jpg',
      ),
      true,
    );
    assert.equal(
      isEligibleSocialProviderPhotoUrl(
        'https://media.licdn.com/dms/image/C4E03AQ/profile',
      ),
      true,
    );
  });

  it('rejects arbitrary, http, and non-https URLs', () => {
    assert.equal(
      isEligibleSocialProviderPhotoUrl('https://evil.example.com/a.png'),
      false,
    );
    assert.equal(
      isEligibleSocialProviderPhotoUrl(
        'http://lh3.googleusercontent.com/a/photo',
      ),
      false,
    );
    assert.equal(
      isEligibleSocialProviderPhotoUrl('ftp://lh3.googleusercontent.com/a'),
      false,
    );
    assert.equal(isEligibleSocialProviderPhotoUrl('not-a-url'), false);
    assert.equal(isEligibleSocialProviderPhotoUrl(''), false);
  });
});

describe('isNearsyManagedProfileImageUrl', () => {
  it('detects Firebase Storage paths under users/{uid}/', () => {
    const uid = 'user-abc';
    const url =
      'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/' +
      encodeURIComponent(`users/${uid}/user-abc_1.jpg`) +
      '?alt=media&token=abc';
    assert.equal(isNearsyManagedProfileImageUrl(uid, url), true);
    assert.equal(isNearsyManagedProfileImageUrl('other', url), false);
  });
});

describe('resolveProfileImageForPersistence', () => {
  it('uploads local URIs', async () => {
    const calls: string[] = [];
    const result = await resolveProfileImageForPersistence(
      'uid-1',
      'file:///tmp/photo.jpg',
      {
        upload: async (_uid, uri) => {
          calls.push(uri);
          return 'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fuid-1%2Fp.jpg?alt=media';
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.imported, false);
      assert.match(result.url, /firebasestorage/);
    }
    assert.deepEqual(calls, ['file:///tmp/photo.jpg']);
  });

  it('imports eligible social URLs once (session cache)', async () => {
    let uploads = 0;
    const remote = 'https://lh3.googleusercontent.com/a/ACg8ocTest';
    const storageUrl =
      'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fuid-1%2Fs.jpg?alt=media';
    const upload = async () => {
      uploads += 1;
      return storageUrl;
    };

    const first = await resolveProfileImageForPersistence('uid-1', remote, {
      upload,
    });
    const second = await resolveProfileImageForPersistence('uid-1', remote, {
      upload,
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(first.imported, true);
      assert.equal(second.imported, true);
      assert.equal(first.url, storageUrl);
      assert.equal(second.url, storageUrl);
    }
    assert.equal(uploads, 1);
  });

  it('keeps existing Nearsy Storage URLs without re-upload', async () => {
    let uploads = 0;
    const url =
      'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fuid-1%2Fexisting.jpg?alt=media&token=t';
    const result = await resolveProfileImageForPersistence('uid-1', url, {
      upload: async () => {
        uploads += 1;
        return 'should-not-run';
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.url, url);
      assert.equal(result.imported, false);
    }
    assert.equal(uploads, 0);
  });

  it('does not fetch arbitrary remote URLs', async () => {
    let uploads = 0;
    const arbitrary = 'https://cdn.example.com/user-picked.png';
    const result = await resolveProfileImageForPersistence('uid-1', arbitrary, {
      upload: async () => {
        uploads += 1;
        return 'should-not-run';
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.url, arbitrary);
      assert.equal(result.imported, false);
    }
    assert.equal(uploads, 0);
  });

  it('returns import_failed without caching a bad result', async () => {
    const remote = 'https://lh3.googleusercontent.com/a/fail';
    const result = await resolveProfileImageForPersistence('uid-1', remote, {
      upload: async () => {
        throw new Error('network');
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'import_failed');
    }

    let uploads = 0;
    const retry = await resolveProfileImageForPersistence('uid-1', remote, {
      upload: async () => {
        uploads += 1;
        return 'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fuid-1%2Fok.jpg?alt=media';
      },
    });
    assert.equal(retry.ok, true);
    assert.equal(uploads, 1);
  });

  it('returns empty when uri is missing', async () => {
    const result = await resolveProfileImageForPersistence('uid-1', null);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'empty');
    }
  });

  it('rejects social import results that are not Nearsy Storage for the uid', async () => {
    const remote = 'https://lh3.googleusercontent.com/a/bad-result';
    const result = await resolveProfileImageForPersistence('uid-1', remote, {
      upload: async () => 'https://lh3.googleusercontent.com/a/still-hotlink',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'import_failed');
    }
  });

  it('does not reuse cached imports across uids after clear', async () => {
    const remote = 'https://lh3.googleusercontent.com/a/shared-photo';
    const storageA =
      'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fuid-a%2Fa.jpg?alt=media';
    const storageB =
      'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fuid-b%2Fb.jpg?alt=media';

    await resolveProfileImageForPersistence('uid-a', remote, {
      upload: async () => storageA,
    });
    clearSocialProfilePhotoImportCache();

    let uploads = 0;
    const result = await resolveProfileImageForPersistence('uid-b', remote, {
      upload: async () => {
        uploads += 1;
        return storageB;
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.url, storageB);
    }
    assert.equal(uploads, 1);
  });
});
