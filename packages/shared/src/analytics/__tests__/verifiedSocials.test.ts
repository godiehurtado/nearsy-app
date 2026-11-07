import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAnalyticsClient } from '../client';
import { POSTHOG_HOST, type AnalyticsConfig } from '../config';
import { createFakeTransport } from '../fakeTransport';
import {
  bindAnalyticsServices,
  markAnalyticsConfigured,
  noteVerifiedSocialRemoved,
  trackVerifiedSocialLinked,
  type AnalyticsServices,
} from '../index';
import { createEventLedger } from '../ledger';
import { createPendingAttributionStore } from '../attribution';
import type { StringStore } from '../lifecycle';
import { buildPersonProperties, diffPersonProperties } from '../profileProperties';
import { combineVerifiedSocialReads, createVerifiedSocialMemory } from '../verifiedSocialRead';
import { InstagramOwnershipClientError } from '../../social/instagramOwnership/errors';
import { TiktokOwnershipClientError } from '../../social/tiktokOwnership/errors';
import { XOwnershipClientError } from '../../social/xOwnership/errors';
import { YoutubeOwnershipClientError } from '../../social/youtubeOwnership/errors';

const NOW = new Date('2026-11-07T12:00:00Z');
const ok = (result: string) => ({ status: 'fulfilled' as const, value: { result } });
const fail = (reason: unknown) => ({ status: 'rejected' as const, reason });
const youtubeOff = fail(new YoutubeOwnershipClientError('YOUTUBE_NOT_ENABLED', 'off'));
const tiktokOff = fail(new TiktokOwnershipClientError('TIKTOK_NOT_ENABLED', 'off'));

/** The QA account: Facebook saved by hand, Instagram and X verified. */
const DOC = {
  mode: 'personal',
  socialLinksPersonal: { facebook: 'https://www.facebook.com/someone' },
};

describe('verified reads, one platform at a time', () => {
  it('a disabled YouTube or TikTok is unknown and does not hide Instagram and X', () => {
    assert.deepEqual(
      combineVerifiedSocialReads({
        youtube: youtubeOff,
        tiktok: tiktokOff,
        instagram: ok('verified'),
        x: ok('verified'),
      }),
      { instagram: true, x: true },
    );
  });

  it('Instagram alone', () => {
    assert.deepEqual(
      combineVerifiedSocialReads({
        youtube: youtubeOff,
        tiktok: tiktokOff,
        instagram: ok('verified'),
        x: ok('not_linked'),
      }),
      { instagram: true, x: false },
    );
  });

  it('X alone', () => {
    assert.deepEqual(
      combineVerifiedSocialReads({
        youtube: youtubeOff,
        tiktok: tiktokOff,
        instagram: ok('not_linked'),
        x: ok('verified'),
      }),
      { instagram: false, x: true },
    );
  });

  it('a pending Instagram challenge is not connected yet', () => {
    assert.deepEqual(combineVerifiedSocialReads({ instagram: ok('pending'), x: ok('verified') }), {
      instagram: false,
      x: true,
    });
  });

  it('any refusal leaves only that platform unknown', () => {
    for (const reason of [
      new InstagramOwnershipClientError('INSTAGRAM_NOT_ENABLED', 'off'),
      new InstagramOwnershipClientError('NETWORK', 'down'),
      new Error('app check not ready'),
      undefined,
    ]) {
      assert.deepEqual(
        combineVerifiedSocialReads({ youtube: youtubeOff, instagram: fail(reason), x: ok('verified') }),
        { x: true },
      );
    }
    assert.deepEqual(
      combineVerifiedSocialReads({
        instagram: ok('verified'),
        x: fail(new XOwnershipClientError('X_NOT_ENABLED', 'off')),
      }),
      { instagram: true },
    );
  });

  it('nothing proved is null', () => {
    assert.equal(combineVerifiedSocialReads({ youtube: youtubeOff, tiktok: tiktokOff }), null);
  });
});

describe('remembered verified state', () => {
  const read = (state: Record<string, boolean> | null) => state;

  it('an unknown platform keeps its last proved value', async () => {
    const memory = createVerifiedSocialMemory(memoryStore());
    await memory.merge('uidA', 'personal', read({ youtube: true, instagram: true, x: true }));
    // YouTube is switched off later: its refusal proves nothing.
    const merged = await memory.merge('uidA', 'personal', read({ instagram: true, x: false }));
    assert.deepEqual(merged, { youtube: true, instagram: true, x: false });
  });

  it('an explicit false replaces a remembered true', async () => {
    const memory = createVerifiedSocialMemory(memoryStore());
    await memory.merge('uidA', 'personal', read({ x: true }));
    assert.deepEqual(await memory.merge('uidA', 'personal', read({ x: false })), { x: false });
  });

  it('survives a restart, because it lives on the device', async () => {
    const store = memoryStore();
    await createVerifiedSocialMemory(store).merge('uidA', 'personal', read({ instagram: true }));
    const afterRestart = createVerifiedSocialMemory(store);
    assert.deepEqual(await afterRestart.merge('uidA', 'personal', null), { instagram: true });
  });

  it('is kept apart per account and per mode', async () => {
    const memory = createVerifiedSocialMemory(memoryStore());
    await memory.merge('uidA', 'personal', read({ instagram: true }));
    assert.equal(await memory.merge('uidB', 'personal', null), null);
    assert.equal(await memory.merge('uidA', 'professional', null), null);
  });

  it('is removed when the account is deleted', async () => {
    const store = memoryStore();
    const memory = createVerifiedSocialMemory(store);
    await memory.merge('uidA', 'personal', read({ instagram: true }));
    await memory.merge('uidA', 'professional', read({ x: true }));
    await memory.merge('uidB', 'personal', read({ x: true }));
    await memory.forget('uidA');
    assert.equal(await memory.merge('uidA', 'personal', null), null);
    assert.equal(await memory.merge('uidA', 'professional', null), null);
    assert.deepEqual(await memory.merge('uidB', 'personal', null), { x: true });
  });

  it('a read with nothing proved writes nothing', async () => {
    const store = memoryStore();
    const memory = createVerifiedSocialMemory(store);
    await memory.merge('uidA', 'personal', null);
    assert.equal(store.size(), 0);
  });

  it('the QA account with YouTube off and no memory: Instagram and X still reach the person', () => {
    const verified = combineVerifiedSocialReads({
      youtube: youtubeOff,
      tiktok: ok('not_linked'),
      instagram: ok('verified'),
      x: ok('verified'),
    });
    const { set, unset } = buildPersonProperties(DOC, verified, NOW);
    assert.deepEqual(set.social_platforms_verified, ['instagram', 'x']);
    assert.deepEqual(set.socials_connected, ['facebook', 'instagram', 'x']);
    assert.equal(set.has_socials, true);
    assert.equal(unset.includes('social_platforms_verified'), false);
  });

  it('nothing known at all still never sends an empty verified list', () => {
    const { set } = buildPersonProperties(DOC, null, NOW, { verifiedConfirmedForMode: true });
    assert.equal('social_platforms_verified' in set, false);
    assert.equal('has_socials' in set, false);
  });
});

describe('person properties across link, unlink and relink', () => {
  function send(previous: Record<string, string>, verified: Parameters<typeof buildPersonProperties>[1]) {
    return diffPersonProperties(previous, buildPersonProperties(DOC, verified, NOW));
  }
  const both = { youtube: false, tiktok: false, instagram: true, x: true };

  it('the QA account gets verified, union and has_socials', () => {
    const { patch } = send({}, both);
    assert.deepEqual(patch.set.social_platforms_manual, ['facebook']);
    assert.deepEqual(patch.set.social_platforms_verified, ['instagram', 'x']);
    assert.deepEqual(patch.set.socials_connected, ['facebook', 'instagram', 'x']);
    assert.equal(patch.set.has_socials, true);
  });

  it('unlinking Instagram, then X, then relinking each, sends only the change', () => {
    let { next } = send({}, both);

    let step = send(next, { ...both, instagram: false });
    assert.deepEqual(step.patch.set.social_platforms_verified, ['x']);
    assert.deepEqual(step.patch.set.socials_connected, ['facebook', 'x']);
    assert.equal('has_socials' in step.patch.set, false);
    next = step.next;

    step = send(next, { ...both, instagram: false, x: false });
    assert.deepEqual(step.patch.set.social_platforms_verified, []);
    assert.deepEqual(step.patch.set.socials_connected, ['facebook']);
    assert.equal('has_socials' in step.patch.set, false, 'Facebook keeps it true');
    next = step.next;

    step = send(next, { ...both, instagram: false });
    assert.deepEqual(step.patch.set.social_platforms_verified, ['x']);
    next = step.next;

    step = send(next, both);
    assert.deepEqual(step.patch.set.social_platforms_verified, ['instagram', 'x']);
    assert.deepEqual(step.patch.set.socials_connected, ['facebook', 'instagram', 'x']);
    next = step.next;

    // A plain re-read with nothing new sends nothing.
    assert.deepEqual(send(next, both).patch, { set: {}, unset: [] });
  });

  it('without the manual link, removing the last verified one sets has_socials false', () => {
    const doc = { mode: 'personal', socialLinksPersonal: {} };
    const first = diffPersonProperties({}, buildPersonProperties(doc, { instagram: true }, NOW));
    const after = diffPersonProperties(first.next, buildPersonProperties(doc, { instagram: false }, NOW));
    assert.equal(after.patch.set.has_socials, false);
    assert.deepEqual(after.patch.set.socials_connected, []);
  });
});

function memoryStore(): StringStore & { size(): number } {
  const map = new Map<string, string>();
  return {
    size: () => map.size,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
  };
}

const config: AnalyticsConfig = {
  enabled: true,
  token: 'phc_test',
  host: POSTHOG_HOST,
  environment: 'production',
  distributionChannel: 'beta',
  isTestInstall: true,
  attributionHosts: [],
};

async function setup() {
  const fake = createFakeTransport();
  const client = createAnalyticsClient({
    config,
    createTransport: async () => fake,
    binary: () => ({ appVersion: '2.0.10', appBuild: '73' }),
  });
  const changed: string[] = [];
  const store = memoryStore();
  const services: AnalyticsServices = {
    client,
    ledger: createEventLedger(store),
    attribution: createPendingAttributionStore(store),
    attributionHosts: [],
    now: () => NOW.getTime(),
    sha256Hex: async (input: string) => Buffer.from(input).toString('hex').padEnd(64, '0'),
    scheduleProfileSync: () => {},
    noteVerifiedSocialsChanged: (uid) => {
      changed.push(uid);
    },
    observeLocationPermissions: () => {},
    noteExternalAuthFlow: () => {},
  };
  markAnalyticsConfigured();
  bindAnalyticsServices(services);
  await client.start();
  client.reportAuthState({ uid: 'uidA', email: null, creationTime: 'Mon, 02 Nov 2026 10:00:00 GMT' });
  return { fake, changed, client };
}

afterEach(() => {
  bindAnalyticsServices(null);
});

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

describe('social_linked for verified networks', () => {
  for (const platform of ['instagram', 'x'] as const) {
    it(`${platform}: a confirmed link reports once and refreshes the person`, async () => {
      const { fake, changed } = await setup();
      trackVerifiedSocialLinked('uidA', platform);
      await settle();
      const events = fake.captured('social_linked');
      assert.equal(events.length, 1);
      assert.equal(events[0]?.properties.social_platform, platform);
      assert.equal(events[0]?.properties.link_type, 'verified');
      assert.equal(events[0]?.properties.distribution_channel, 'beta');
      assert.deepEqual(changed, ['uidA']);
    });

    it(`${platform}: unlink refreshes the person without an event; relink reports again`, async () => {
      const { fake, changed } = await setup();
      trackVerifiedSocialLinked('uidA', platform);
      noteVerifiedSocialRemoved('uidA');
      trackVerifiedSocialLinked('uidA', platform);
      await settle();
      assert.equal(fake.captured('social_linked').length, 2);
      assert.deepEqual(changed, ['uidA', 'uidA', 'uidA']);
    });
  }

  it('no account, no event', async () => {
    const { fake } = await setup();
    trackVerifiedSocialLinked(null, 'instagram');
    await settle();
    assert.equal(fake.captured('social_linked').length, 0);
  });
});

describe('the profile social editor reports verified changes', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const screen = readFileSync(join(here, '../../screens/SocialMediaScreen.tsx'), 'utf8');

  it('reports each confirmed connection', () => {
    for (const platform of ['youtube', 'tiktok', 'instagram', 'x']) {
      assert.match(screen, new RegExp(`trackVerifiedSocialLinked\\(editorUid, '${platform}'\\)`), platform);
    }
  });

  it('Instagram counts only a pending challenge that turns verified, never a plain read', () => {
    assert.match(screen, /if \(wasPending && presented\.verified\) \{\s*trackVerifiedSocialLinked\(editorUid, 'instagram'\)/);
    assert.equal(screen.match(/trackVerifiedSocialLinked\(editorUid, 'instagram'\)/g)?.length, 1);
  });

  it('each unlink refreshes the person', () => {
    const unlinks = screen.match(/await client\.unlink\(modeForRequest\);\s*noteVerifiedSocialRemoved\(editorUid\);/g);
    assert.equal(unlinks?.length, 4);
  });
});

describe('account changes during verified operations', () => {
  it('a link confirmed for A after switching to B is dropped, and B gets nothing', async () => {
    const { fake, client } = await setup();
    client.reportAuthState({ uid: 'uidB', email: null, creationTime: 'Tue, 03 Nov 2026 10:00:00 GMT' });
    trackVerifiedSocialLinked('uidA', 'instagram');
    trackVerifiedSocialLinked('uidA', 'x');
    await settle();
    assert.equal(fake.captured('social_linked').length, 0);
  });

  it('after signing out, a late confirmation for A is dropped', async () => {
    const { fake, client } = await setup();
    client.reportAuthState(null);
    trackVerifiedSocialLinked('uidA', 'x');
    await settle();
    assert.equal(fake.captured('social_linked').length, 0);
  });

  it('back on A, a new link reports under A only', async () => {
    const { fake, client } = await setup();
    client.reportAuthState({ uid: 'uidB', email: null, creationTime: 'Tue, 03 Nov 2026 10:00:00 GMT' });
    client.reportAuthState({ uid: 'uidA', email: null, creationTime: 'Mon, 02 Nov 2026 10:00:00 GMT' });
    trackVerifiedSocialLinked('uidA', 'instagram');
    await settle();
    const events = fake.captured('social_linked');
    assert.equal(events.length, 1);
    assert.equal(events[0]?.distinctId, 'uidA');
  });
});

describe('X confirmed by reconciliation after the finalizer fails', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const [name, path, uidVar] of [
    ['profile editor', '../../screens/SocialMediaScreen.tsx', 'editorUid'],
    ['onboarding', '../../components/registration/OwnedSocialConnectSection.tsx', 'uid'],
  ] as const) {
    const source = readFileSync(join(here, path), 'utf8').split('\r\n').join('\n');

    it(`${name}: captures whether X was connected before the attempt`, () => {
      assert.match(source, /const wasXConnected = xConnectedRef\.current;/);
      assert.match(source, /xConnectedRef\.current = xConnected;/);
    });

    it(`${name}: reports once, only when this attempt is confirmed and X was not connected`, () => {
      assert.match(
        source,
        new RegExp(
          `const get = await client\\.get\\(modeForRequest\\);\\s*if \\(!isXResultCurrent\\(requestGen, modeForRequest\\)\\) return;[\\s\\S]{0,240}if \\(get\\.result === 'verified' && !wasXConnected\\) \\{\\s*trackVerifiedSocialLinked\\(${uidVar}, 'x'\\);`,
        ),
      );
      // The normal success path and the reconciliation are exclusive branches.
      assert.equal(source.match(new RegExp(`trackVerifiedSocialLinked\\(${uidVar}, 'x'\\)`, 'g'))?.length, 2);
    });
  }
});
