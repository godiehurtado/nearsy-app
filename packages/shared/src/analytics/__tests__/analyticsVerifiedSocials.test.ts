import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONFIRMED_SOCIALS_KEY_PREFIX,
  createVerifiedSocialController,
  readManualPlatforms,
  socialProperties,
} from '../analyticsSocial.ts';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (rel: string) => readFileSync(join(srcRoot, rel), 'utf8');

function makeStorage(data = new Map<string, string>()) {
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => void data.set(key, value),
  };
}

function makeController(options: { uid?: string | null; storage?: ReturnType<typeof makeStorage> } = {}) {
  const storage = options.storage ?? makeStorage();
  const auth = { uid: options.uid === undefined ? 'userA' : options.uid };
  const linked: Array<[string, string, string]> = [];
  const synced: string[] = [];
  const controller = createVerifiedSocialController({
    storage,
    currentUid: () => auth.uid,
    emitLinked: (uid, platform, mode) => linked.push([uid, platform, mode]),
    syncPerson: (uid) => synced.push(uid),
  });
  return { auth, controller, linked, storage, synced };
}

/** Lets queued storage work and the `.then` of a consumed marker run. */
async function settle(controller: { idle(): Promise<void> }) {
  for (let i = 0; i < 4; i += 1) await controller.idle();
}

describe('verified socials: a rejection never hides the others', () => {
  it('Facebook manual, Instagram and X verified, YouTube rejected', async () => {
    const { controller } = makeController();
    controller.note('personal', 'instagram', true);
    controller.note('personal', 'x', true);
    controller.note('personal', 'tiktok', false);
    controller.fail('personal', 'youtube'); // e.g. YOUTUBE_NOT_ENABLED outside the allowlist
    await settle(controller);
    const verified = controller.verifiedFor('personal', 'userA');
    assert.deepEqual(verified, ['instagram', 'x']);
    const manual = readManualPlatforms(
      { socialLinksPersonal: { facebook: 'https://facebook.com/me' } },
      'personal',
    );
    assert.deepEqual(socialProperties(manual, verified), {
      social_platforms_manual: ['facebook'],
      social_platforms_verified: ['instagram', 'x'],
      socials_connected: ['facebook', 'instagram', 'x'],
      has_socials: true,
    });
  });

  it('YouTube confirmed is included', async () => {
    const { controller } = makeController();
    controller.note('personal', 'instagram', true);
    controller.note('personal', 'x', true);
    controller.note('personal', 'youtube', true);
    controller.note('personal', 'tiktok', false);
    await settle(controller);
    assert.deepEqual(controller.verifiedFor('personal'), ['instagram', 'x', 'youtube']);
  });

  it('the list stays unknown until every network was read once', async () => {
    const { controller } = makeController();
    controller.note('personal', 'instagram', true);
    controller.note('personal', 'x', true);
    controller.fail('personal', 'youtube');
    await settle(controller);
    assert.equal(controller.verifiedFor('personal'), undefined);
  });

  it('a failed read keeps a connection confirmed earlier in the process', async () => {
    const { controller } = makeController();
    for (const platform of ['instagram', 'youtube', 'tiktok'] as const) {
      controller.note('personal', platform, false);
    }
    controller.note('personal', 'x', true);
    controller.fail('personal', 'x');
    await settle(controller);
    assert.deepEqual(controller.verifiedFor('personal'), ['x']);
  });

  it('a failed read after a restart keeps the last confirmed value', async () => {
    const storage = makeStorage();
    const first = makeController({ storage });
    first.controller.note('personal', 'x', true);
    first.controller.note('personal', 'instagram', true);
    await settle(first.controller);

    const second = makeController({ storage });
    second.controller.fail('personal', 'x');
    second.controller.fail('personal', 'instagram');
    second.controller.note('personal', 'youtube', false);
    second.controller.note('personal', 'tiktok', false);
    await settle(second.controller);
    assert.deepEqual(second.controller.verifiedFor('personal'), ['instagram', 'x']);
    assert.ok(second.synced.length > 0);
  });

  it('never confirmed and failed: left out, not claimed', async () => {
    const { controller } = makeController();
    controller.fail('personal', 'x');
    controller.note('personal', 'instagram', true);
    controller.note('personal', 'youtube', false);
    controller.note('personal', 'tiktok', false);
    await settle(controller);
    assert.deepEqual(controller.verifiedFor('personal'), ['instagram']);
  });

  it('damaged memory reads as empty', async () => {
    const storage = makeStorage(new Map([[CONFIRMED_SOCIALS_KEY_PREFIX + 'userA', '{bad']]));
    const { controller } = makeController({ storage });
    controller.fail('personal', 'x');
    for (const platform of ['instagram', 'youtube', 'tiktok'] as const) {
      controller.note('personal', platform, false);
    }
    await settle(controller);
    assert.deepEqual(controller.verifiedFor('personal'), []);
  });

  it('modes are separate', async () => {
    const { controller } = makeController();
    for (const platform of ['instagram', 'youtube', 'tiktok', 'x'] as const) {
      controller.note('personal', platform, platform === 'x');
    }
    await settle(controller);
    assert.deepEqual(controller.verifiedFor('personal'), ['x']);
    assert.equal(controller.verifiedFor('professional'), undefined);
  });
});

describe('verified socials: social_linked once per confirmed connection', () => {
  it('X direct path: one event, the following read adds none', async () => {
    const { controller, linked } = makeController();
    controller.markPending('personal', 'x');
    controller.linked('personal', 'x');
    controller.note('personal', 'x', true);
    await settle(controller);
    controller.note('personal', 'x', true);
    await settle(controller);
    assert.deepEqual(linked, [['userA', 'x', 'personal']]);
  });

  it('X finalizer failed, reconciliation confirms: one event', async () => {
    const { controller, linked } = makeController();
    controller.markPending('personal', 'x');
    // connectXOwnership returned failed; refreshForMode reads verified.
    controller.note('personal', 'x', true);
    await settle(controller);
    controller.note('personal', 'x', true);
    await settle(controller);
    assert.deepEqual(linked, [['userA', 'x', 'personal']]);
  });

  it('X attempt survives a restart and counts once', async () => {
    const storage = makeStorage();
    const first = makeController({ storage });
    first.controller.markPending('personal', 'x');
    await settle(first.controller);

    const second = makeController({ storage });
    second.controller.note('personal', 'x', true);
    await settle(second.controller);
    const third = makeController({ storage });
    third.controller.note('personal', 'x', true);
    await settle(third.controller);
    assert.deepEqual(second.linked, [['userA', 'x', 'personal']]);
    assert.deepEqual(third.linked, []);
  });

  it('an old connection found on a read is not a new one', async () => {
    const { controller, linked } = makeController();
    controller.note('personal', 'x', true);
    controller.note('personal', 'instagram', true);
    await settle(controller);
    assert.deepEqual(linked, []);
  });

  it('an attempt that ends not connected is closed', async () => {
    const { controller, linked } = makeController();
    controller.markPending('personal', 'x');
    controller.note('personal', 'x', false);
    await settle(controller);
    controller.note('personal', 'x', true);
    await settle(controller);
    assert.deepEqual(linked, []);
  });

  it('disconnect updates the person without an event; reconnect counts again', async () => {
    const { controller, linked, synced } = makeController();
    for (const platform of ['instagram', 'youtube', 'tiktok'] as const) {
      controller.note('personal', platform, false);
    }
    controller.markPending('personal', 'x');
    controller.linked('personal', 'x');
    controller.note('personal', 'x', true);
    await settle(controller);
    const syncsBefore = synced.length;
    controller.note('personal', 'x', false);
    await settle(controller);
    assert.deepEqual(controller.verifiedFor('personal'), []);
    assert.equal(synced.length, syncsBefore + 1);
    assert.equal(linked.length, 1);

    controller.markPending('personal', 'x');
    controller.linked('personal', 'x');
    controller.note('personal', 'x', true);
    await settle(controller);
    assert.deepEqual(linked, [
      ['userA', 'x', 'personal'],
      ['userA', 'x', 'personal'],
    ]);
    assert.deepEqual(controller.verifiedFor('personal'), ['x']);
  });

  it('Instagram pending is not connected; its verified read counts once', async () => {
    const { controller, linked } = makeController();
    controller.markPending('personal', 'instagram');
    controller.note('personal', 'instagram', false);
    await settle(controller);
    assert.deepEqual(linked, []);
    controller.note('personal', 'instagram', true);
    await settle(controller);
    controller.note('personal', 'instagram', true);
    await settle(controller);
    assert.deepEqual(linked, [['userA', 'instagram', 'personal']]);
  });

  it('a failed read neither emits nor closes the attempt', async () => {
    const { controller, linked } = makeController();
    controller.markPending('personal', 'x');
    controller.fail('personal', 'x');
    await settle(controller);
    assert.deepEqual(linked, []);
    controller.note('personal', 'x', true);
    await settle(controller);
    assert.deepEqual(linked, [['userA', 'x', 'personal']]);
  });

  it('an attempt in one mode is not a connection in the other', async () => {
    const { controller, linked } = makeController();
    controller.markPending('personal', 'x');
    controller.note('professional', 'x', true);
    await settle(controller);
    assert.deepEqual(linked, []);
  });
});

describe('verified socials: account changes', () => {
  it('a result for an account that signed out is dropped', async () => {
    const { auth, controller, linked } = makeController();
    auth.uid = 'userB';
    controller.note('personal', 'x', true, 'userA');
    controller.fail('personal', 'youtube', 'userA');
    await settle(controller);
    assert.equal(controller.verifiedFor('personal', 'userB'), undefined);
    assert.deepEqual(linked, []);
    auth.uid = null;
    controller.note('personal', 'x', true);
    assert.equal(controller.verifiedFor('personal', 'userA'), undefined);
  });

  it('another account starts clean and does not take the first one\'s attempt', async () => {
    const { auth, controller, linked } = makeController();
    for (const platform of ['instagram', 'youtube', 'tiktok', 'x'] as const) {
      controller.note('personal', platform, platform === 'x');
    }
    controller.markPending('personal', 'instagram');
    await settle(controller);
    auth.uid = 'userB';
    controller.note('personal', 'instagram', true);
    await settle(controller);
    assert.deepEqual(linked, []);
    assert.equal(controller.verifiedFor('personal', 'userA'), undefined);
    assert.equal(controller.verifiedFor('personal', 'userB'), undefined);
  });

  it('an account switch while a pending attempt resolves emits nothing', async () => {
    const { auth, controller, linked } = makeController();
    controller.markPending('personal', 'x');
    await settle(controller);
    controller.note('personal', 'x', true);
    auth.uid = 'userB'; // before the marker read resolves
    await settle(controller);
    assert.deepEqual(linked, []);
  });

  it('a slow memory load for the previous account does not leak', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const storage = makeStorage(
      new Map([[CONFIRMED_SOCIALS_KEY_PREFIX + 'userA', JSON.stringify({ 'personal:x': true })]]),
    );
    const slow = {
      ...storage,
      getItem: async (key: string) => {
        if (key.startsWith(CONFIRMED_SOCIALS_KEY_PREFIX + 'userA')) await gate;
        return storage.getItem(key);
      },
    };
    const auth = { uid: 'userA' as string | null };
    const controller = createVerifiedSocialController({
      storage: slow,
      currentUid: () => auth.uid,
      emitLinked: () => {},
      syncPerson: () => {},
    });
    controller.fail('personal', 'x');
    auth.uid = 'userB';
    for (const platform of ['instagram', 'youtube', 'tiktok'] as const) {
      controller.note('personal', platform, false);
    }
    controller.fail('personal', 'x');
    release();
    await settle(controller);
    assert.deepEqual(controller.verifiedFor('personal', 'userB'), []);
  });
});

describe('verified socials: wiring', () => {
  it('the editor and onboarding mount the same cards', () => {
    for (const file of ['screens/SocialMediaScreen.tsx', 'components/registration/OnboardingSocialMediaStep.tsx']) {
      const source = src(file);
      for (const card of ['Youtube', 'Tiktok', 'Instagram', 'X']) {
        assert.ok(source.includes(`<${card}OwnershipCard`), `${file} ${card}`);
      }
    }
  });

  it('each card reports a failed read as unknown and opens its attempt', () => {
    for (const [file, platform] of [
      ['Tiktok', 'tiktok'],
      ['X', 'x'],
      ['Youtube', 'youtube'],
    ]) {
      const source = src(`components/profile/${file}OwnershipCard.tsx`);
      const refresh = source.slice(
        source.indexOf('const refreshForMode'),
        source.indexOf('const refreshForModeRef'),
      );
      assert.ok(refresh.includes(`noteSocialOwnershipFailed(forMode, '${platform}')`), file);
      const connect = source.slice(source.indexOf('const onConnect'));
      assert.ok(
        connect.slice(0, 400).includes(`noteSocialVerificationPending(forMode, '${platform}')`),
        file,
      );
    }
    const instagram = src('components/profile/InstagramOwnershipCard.tsx');
    assert.ok(instagram.includes("noteSocialOwnershipFailed(forMode, 'instagram')"));
  });

  it('the own profile summary passes its account and reports errors as unknown', () => {
    const load = src('social/ownProfileSocialSummaryLoad.android.ts');
    assert.ok(load.includes('noteSocialOwnership(mode, platform, status === \'verified\', ownerUid)'));
    assert.ok(load.includes('noteSocialOwnershipFailed(mode, platform, ownerUid)'));
    const ownerAt = load.indexOf('const ownerUid');
    const readsAt = load.indexOf('const [youtube, tiktok, instagram, x] = await Promise.all');
    assert.ok(ownerAt > 0 && readsAt > ownerAt, 'the account is captured before the reads');
  });
});
