/**
 * Android 2.0.9 — declare expo-clipboard for real Instagram code Copy.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/android209ExpoClipboard.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..', '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function readRepo(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

describe('expo-clipboard dependency and native config', () => {
  it('declares expo-clipboard for Expo SDK 54 on Android', () => {
    const pkg = JSON.parse(readRepo('apps/nearsy-android/package.json'));
    assert.match(String(pkg.dependencies['expo-clipboard'] ?? ''), /^~8\.0\./);
    assert.match(String(pkg.dependencies.expo ?? ''), /~54\./);
  });

  it('keeps expo-clipboard in the lockfile importer for Android', () => {
    const lock = readRepo('pnpm-lock.yaml');
    assert.match(lock, /apps\/nearsy-android:/);
    assert.match(lock, /expo-clipboard@8\.0\./);
    assert.match(lock, /expo-clipboard:/);
  });

  it('does not require an Expo config plugin for clipboard', () => {
    const appJson = JSON.parse(readRepo('apps/nearsy-android/app.json'));
    const plugins = (appJson.expo.plugins ?? []).map((p: unknown) =>
      Array.isArray(p) ? p[0] : p,
    );
    assert.equal(plugins.includes('expo-clipboard'), false);
    // Contacts / FCM stay untouched by this change.
    assert.equal(plugins.includes('expo-contacts'), true);
    assert.equal(plugins.includes('expo-notifications'), true);
  });
});

describe('Copy vs Share contract', () => {
  it('Copy never silently treats Share as success', () => {
    const helper = readSrc('social/copyTextToClipboard.ts');
    assert.match(helper, /export async function copyTextToClipboard/);
    assert.match(helper, /export async function shareTextViaSystemShare/);
    assert.match(helper, /'unavailable'/);
    assert.match(helper, /require\('expo-clipboard'\)/);
    const copyFn = helper.slice(
      helper.indexOf('export async function copyTextToClipboard'),
      helper.indexOf('export async function shareTextViaSystemShare'),
    );
    assert.doesNotMatch(copyFn, /Share\.share/);
    assert.match(copyFn, /return 'copied'/);
    assert.doesNotMatch(copyFn, /return 'shared'/);
  });

  it('Instagram Copy announces Copiado only after clipboard success', () => {
    const card = readSrc('components/profile/InstagramOwnershipCard.tsx');
    assert.match(card, /copyTextToClipboard\(code, \{ sensitive: true \}\)/);
    assert.match(card, /result === 'copied'/);
    assert.match(
      card,
      /result === 'copied'[\s\S]*instagramOwnership\.copied/,
    );
    assert.match(card, /result === 'unavailable'/);
    assert.match(card, /shareTextViaSystemShare/);
    assert.match(card, /clipboardUnavailable/);
    assert.doesNotMatch(card, /result === 'shared'/);
    assert.doesNotMatch(card, /Share\.share/);
  });

  it('EN/ES expose Copiado and explicit Share copy', () => {
    const profile = readSrc('i18n/resources/profile.ts');
    assert.match(profile, /copied: 'Code copied'/);
    assert.match(profile, /copied: 'Código copiado'/);
    assert.match(profile, /clipboardUnavailable:/);
    assert.match(profile, /shareCode: 'Share code'/);
    assert.match(profile, /shareCode: 'Compartir código'/);
  });
});
