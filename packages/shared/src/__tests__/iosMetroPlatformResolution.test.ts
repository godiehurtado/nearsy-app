import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = resolve(here, '..');
const iosMetro = resolve(here, '../../../../apps/nearsy-ios/metro.config.js');

function metroPrefersIosOverAndroid(sourceExts: string[]): boolean {
  const iosTs = sourceExts.indexOf('ios.ts');
  const androidTs = sourceExts.indexOf('android.ts');
  const ts = sourceExts.indexOf('ts');
  if (iosTs < 0 || ts < 0) return false;
  if (androidTs >= 0 && androidTs < iosTs) return false;
  return iosTs < ts;
}

describe('iOS Metro platform resolution', () => {
  it('nearsy-ios Metro lists ios.ts before generic ts and not after android.ts', () => {
    const src = readFileSync(iosMetro, 'utf8');
    assert.match(src, /sourceExts/);
    assert.match(src, /'ios\.ts'/);
    const iosIndex = src.indexOf("'ios.ts'");
    const tsIndex = src.indexOf("\n  'ts'");
    const androidIndex = src.indexOf("'android.ts'");
    assert.ok(iosIndex > 0 && tsIndex > iosIndex);
    assert.equal(androidIndex, -1);
  });

  it('location, visibility, and auth foundations have iOS implementations Metro will load', () => {
    const pairs: Array<[string, string]> = [
      ['background/locationTask.ts', 'background/locationTask.ios.ts'],
      [
        'visibility/iosVisibilityFoundation.ts',
        'visibility/iosVisibilityFoundation.ios.ts',
      ],
      ['config/firebaseConfig.ts', 'config/firebaseConfig.ios.ts'],
      ['services/authService.ts', 'services/authService.ios.ts'],
      ['services/db.ts', 'services/db.ios.ts'],
    ];
    for (const [stub, ios] of pairs) {
      assert.equal(existsSync(join(sharedSrc, stub)), true, stub);
      assert.equal(existsSync(join(sharedSrc, ios)), true, ios);
    }
    assert.equal(metroPrefersIosOverAndroid(['ios.ts', 'ts', 'android.ts']), true);
  });
});
