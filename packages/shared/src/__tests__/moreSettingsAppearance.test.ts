/**
 * ENH-SET-01 — More Preferences Appearance wiring (source contracts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

test('ENH-SET-01: Preferences exposes Appearance via commitTheme + AppearanceToggle', () => {
  const screen = readShared('screens/MoreScreen.tsx');
  assert.match(screen, /AppearanceToggle/);
  assert.match(screen, /commitTheme/);
  assert.match(screen, /settings\.appearance\.title/);
  assert.match(screen, /handleSelectAppearance/);
  assert.match(screen, /setAppearanceModalOpen\(true\)/);
  // Language remains; Appearance is adjacent in Preferences (not last alone).
  assert.match(screen, /settings\.language\.title/);
  // Do not invent a parallel storage path.
  assert.doesNotMatch(screen, /nearsy\.appearance/);
  assert.doesNotMatch(screen, /saveAppearance/);
  assert.doesNotMatch(screen, /AsyncStorage\.setItem/);

  const en = readShared('i18n/resources/settings.ts');
  assert.match(en, /appearance:\s*\{/);
  assert.match(en, /light:\s*'Light'/);
  assert.match(en, /dark:\s*'Dark'/);

  const es = readShared('i18n/locales/es.ts');
  assert.match(es, /appearance:\s*\{/);
  assert.match(es, /light:\s*'Claro'/);
  assert.match(es, /dark:\s*'Oscuro'/);

  const themeSelection = readShared('screens/ThemeSelectionScreen.tsx');
  assert.match(themeSelection, /You can change it later in More/);
  assert.doesNotMatch(themeSelection, /later in your profile/);
});
